"""Exam state transitions. All mutations run in a single SQLite transaction."""
import json
import math
import sqlite3
import uuid

from fastapi import HTTPException

from backend.schemas import AnswerRequest


def owned_session(conn, code: str, user_id: int):
    row = conn.execute("SELECT * FROM exam_sessions WHERE session_code = ? AND user_id = ?", (code, user_id)).fetchone()
    if row is None:
        raise HTTPException(404, "考试记录不存在")
    return row


def total_questions(conn, code):
    return conn.execute("SELECT COUNT(*) FROM session_questions WHERE session_code = ?", (code,)).fetchone()[0]


def snapshot_at(conn, code, position):
    row = conn.execute("SELECT snapshot_json FROM session_questions WHERE session_code = ? AND position = ?", (code, position)).fetchone()
    if row is None:
        raise HTTPException(409, "考试题目状态异常")
    return json.loads(row[0])


def current_question(conn, session, now):
    if session["status"] == "completed":
        return None
    q = snapshot_at(conn, session["session_code"], session["current_index"])
    # Explicit allowlist: never send the snapshot's correctAnswer to the candidate.
    return {
        "questionId": q["questionId"], "content": q["content"],
        "questionType": q["questionType"], "options": q["options"],
        "optionKeys": list(q["options"]), "questionIndex": session["current_index"],
        "totalQuestions": total_questions(conn, session["session_code"]),
        "timeLimitSeconds": q["timeLimitSeconds"],
        "remainingSeconds": max(0, math.ceil(session["question_started_at"] + q["timeLimitSeconds"] - now)),
        "unansweredWarningSeconds": min(10, q["timeLimitSeconds"]),
    }


def session_result(conn, session, now):
    return {
        "sessionCode": session["session_code"], "status": session["status"],
        "isExamFinished": session["status"] == "completed",
        "currentQuestion": current_question(conn, session, now),
        "totalQuestions": total_questions(conn, session["session_code"]),
    }


def start(conn, user_id, exam_id, now):
    if not conn.execute("SELECT 1 FROM exams WHERE id = ? AND enabled = 1", (exam_id,)).fetchone():
        raise HTTPException(404, "试卷不存在或未开放")
    existing = conn.execute("SELECT * FROM exam_sessions WHERE user_id = ? AND exam_id = ?", (user_id, exam_id)).fetchone()
    if existing:
        return session_result(conn, existing, now)
    questions = conn.execute(
        "SELECT q.* FROM exam_questions eq JOIN questions q ON q.id = eq.question_id WHERE eq.exam_id = ? ORDER BY eq.position",
        (exam_id,),
    ).fetchall()
    if not questions:
        raise HTTPException(409, "试卷尚未配置题目")
    code = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO exam_sessions(session_code, user_id, exam_id, started_at, question_started_at) VALUES (?, ?, ?, ?, ?)",
        (code, user_id, exam_id, now, now),
    )
    for position, q in enumerate(questions, 1):
        snapshot = {
            "questionId": q["id"], "content": q["content"], "questionType": q["question_type"],
            "options": json.loads(q["options_json"]), "correctAnswer": q["correct_answer"],
            "timeLimitSeconds": q["time_limit_seconds"],
        }
        conn.execute("INSERT INTO session_questions VALUES (?, ?, ?, ?)", (code, position, q["id"], json.dumps(snapshot, ensure_ascii=False)))
    return session_result(conn, owned_session(conn, code, user_id), now)


def canonical_answer(value, q):
    if not value:
        return ""
    keys = value.split(",")
    if len(keys) != len(set(keys)) or any(k not in q["options"] for k in keys):
        raise HTTPException(400, "答案包含无效或重复的选项")
    if q["questionType"] == 0 and len(keys) != 1:
        raise HTTPException(400, "单选题只能选择一个选项")
    return ",".join(sorted(keys))


def submit(conn: sqlite3.Connection, user_id: int, body: AnswerRequest, now: float):
    session = owned_session(conn, body.sessionCode, user_id)
    if session["status"] != "in_progress":
        raise HTTPException(409, "考试已结束，不能修改答案")
    q = snapshot_at(conn, body.sessionCode, body.questionIndex)
    if q["questionId"] != body.questionId:
        raise HTTPException(400, "题号与题目不匹配")
    answer = canonical_answer(body.answer, q)
    if body.questionIndex != session["current_index"]:
        old = conn.execute("SELECT * FROM answers WHERE session_code = ? AND question_index = ?", (body.sessionCode, body.questionIndex)).fetchone()
        if old and (old["answer"] == answer or old["timed_out"]):
            # A lost-response retry must not advance the current question a second time.
            return {"isExamFinished": False, "nextQuestion": current_question(conn, session, now), "duplicate": True}
        raise HTTPException(409, "只能提交当前题目，已提交答案不能修改")
    timed_out = now >= session["question_started_at"] + q["timeLimitSeconds"]
    if not answer and not timed_out:
        raise HTTPException(400, "请选择答案；未超时不能提交空答案")
    # After the server deadline there is no evidence when a local selection was made.
    # Persist a timeout with an empty answer instead of accepting a late answer.
    saved = "" if timed_out else answer
    conn.execute(
        "INSERT INTO answers VALUES (?, ?, ?, ?, ?, ?, ?)",
        (body.sessionCode, body.questionIndex, body.questionId, saved, now, int(timed_out), int(saved == q["correctAnswer"])),
    )
    finished = body.questionIndex == total_questions(conn, body.sessionCode)
    if finished:
        conn.execute("UPDATE exam_sessions SET status = 'completed', finished_at = ?, finish_reason = 'normal' WHERE session_code = ?", (now, body.sessionCode))
    else:
        conn.execute("UPDATE exam_sessions SET current_index = current_index + 1, question_started_at = ? WHERE session_code = ?", (now, body.sessionCode))
    updated = owned_session(conn, body.sessionCode, user_id)
    return {"isExamFinished": finished, "nextQuestion": current_question(conn, updated, now), "timedOut": timed_out}


def finish(conn, user_id, code, now):
    session = owned_session(conn, code, user_id)
    if session["status"] == "in_progress":
        conn.execute("UPDATE exam_sessions SET status = 'completed', finished_at = ?, finish_reason = 'early' WHERE session_code = ?", (now, code))
    return {"sessionCode": code, "status": "completed", "isExamFinished": True}
