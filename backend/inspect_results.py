"""Local operator CLI. Read-only SQLite access; never exposed as a candidate API."""
import argparse
import json
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

from backend.config import Settings

CHINA_TIME = timezone(timedelta(hours=8))


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(str(value))
    return " ".join(" ".join(parser.parts).split())


def timestamp(value):
    return datetime.fromtimestamp(value, CHINA_TIME).isoformat(timespec="seconds") if value is not None else None


def read_results(database: Path, *, phone=None, session=None, details=False):
    # mode=ro rejects writes and, unlike a normal sqlite connection, cannot create a missing DB.
    conn = sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA query_only = ON")
        conn.execute("BEGIN")  # Summary and details use one consistent snapshot during a live exam.
        where, params = "", []
        if phone is not None:
            where, params = "WHERE u.phone = ?", [phone]
        elif session is not None:
            where, params = "WHERE s.session_code = ?", [session]
        rows = conn.execute(
            "SELECT u.id AS user_id, u.phone, s.session_code, s.status, s.finish_reason, "
            "s.started_at, s.finished_at, e.title, "
            "(SELECT COUNT(*) FROM session_questions sq WHERE sq.session_code = s.session_code) AS total, "
            "(SELECT COUNT(*) FROM answers a WHERE a.session_code = s.session_code) AS submitted, "
            "(SELECT COUNT(*) FROM answers a WHERE a.session_code = s.session_code AND a.is_correct = 1) AS correct, "
            "(SELECT COUNT(*) FROM answers a WHERE a.session_code = s.session_code AND a.timed_out = 1) AS timed_out "
            "FROM users u LEFT JOIN exam_sessions s ON s.user_id = u.id "
            "LEFT JOIN exams e ON e.id = s.exam_id "
            + where + " ORDER BY u.id, s.started_at, s.session_code", params,
        ).fetchall()
        results = []
        for row in rows:
            item = {
                "userId": row["user_id"], "phone": row["phone"],
                "sessionCode": row["session_code"], "examTitle": row["title"],
                "status": row["status"] or "not_started", "finishReason": row["finish_reason"],
                "startedAt": timestamp(row["started_at"]), "finishedAt": timestamp(row["finished_at"]),
                "totalQuestions": row["total"], "submittedQuestions": row["submitted"],
                "correctQuestions": row["correct"], "timedOutQuestions": row["timed_out"],
            }
            if details:
                item["questions"] = []
                for q in conn.execute(
                    "SELECT sq.position, sq.question_id, sq.snapshot_json, "
                    "a.answer, a.submitted_at, a.timed_out, a.is_correct "
                    "FROM session_questions sq LEFT JOIN answers a "
                    "ON a.session_code = sq.session_code AND a.question_index = sq.position "
                    "WHERE sq.session_code = ? ORDER BY sq.position", (row["session_code"],),
                ):
                    snapshot = json.loads(q["snapshot_json"])
                    item["questions"].append({
                        "questionIndex": q["position"], "questionId": q["question_id"],
                        "content": plain(snapshot["content"]), "options": snapshot["options"],
                        "answer": q["answer"], "correctAnswer": snapshot["correctAnswer"],
                        "submittedAt": timestamp(q["submitted_at"]),
                        "timedOut": bool(q["timed_out"]) if q["submitted_at"] is not None else None,
                        "isCorrect": bool(q["is_correct"]) if q["submitted_at"] is not None else None,
                    })
            results.append(item)
        return {"database": str(database.resolve()), "results": results}
    finally:
        conn.close()


def print_results(report):
    print(f"数据库：{report['database']}")
    print("时间显示为北京时间（UTC+08:00）；只读查询，不修改考试数据。")
    if not report["results"]:
        print("没有找到匹配的用户或考试记录。")
        return
    status_names = {"not_started": "未开始", "in_progress": "进行中", "completed": "已结束"}
    reason_names = {"normal": "正常完成", "early": "提前交卷", None: "—"}
    for item in report["results"]:
        print(f"\n用户 {item['phone']}（ID {item['userId']}） | {status_names[item['status']]}")
        if not item["sessionCode"]:
            continue
        print(f"  试卷：{item['examTitle']} | 场次：{item['sessionCode']}")
        print(f"  已提交：{item['submittedQuestions']}/{item['totalQuestions']} | 正确：{item['correctQuestions']} | 超时：{item['timedOutQuestions']}")
        print(f"  开始：{item['startedAt']} | 结束：{item['finishedAt'] or '—'} | {reason_names[item['finishReason']]}")
        for q in item.get("questions", []):
            if q["submittedAt"] is None:
                result, selected = "未提交", "—"
            elif q["timedOut"]:
                result, selected = "超时空答", "空"
            else:
                result, selected = ("正确" if q["isCorrect"] else "错误"), q["answer"]
            print(f"  第{q['questionIndex']}题 [{q['questionId']}] {q['content']}")
            print(f"    提交：{selected} | 标准答案：{q['correctAnswer']} | {result} | 时间：{q['submittedAt'] or '—'}")
            if q["answer"]:
                print("    所选内容：" + "；".join(f"{key}: {plain(q['options'].get(key, ''))}" for key in q["answer"].split(",")))


def main():
    parser = argparse.ArgumentParser(description="本机只读查看用户考试提交结果（不需要登录、不对浏览器开放）")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--phone", help="按完整手机号查看逐题结果")
    group.add_argument("--session", help="按场次编号查看逐题结果")
    group.add_argument("--all", action="store_true", help="查看所有用户的逐题结果")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出，便于其他本机工具读取")
    args = parser.parse_args()
    try:
        report = read_results(Settings().database_path, phone=args.phone, session=args.session,
                              details=args.all or args.phone is not None or args.session is not None)
    except (sqlite3.Error, OSError) as exc:
        print(f"无法只读查询数据库：{exc}。请确认数据库已初始化且 EXAM_DATABASE_PATH 与后端一致。", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_results(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
