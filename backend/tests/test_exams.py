from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from backend.main import PREFIX, create_app
from backend.tests.conftest import answer_body, post, register, start


def progress(client, session):
    response = client.get(PREFIX + "/exam/getExamProgress", params={"sessionCode": session["sessionCode"]})
    assert response.status_code == 200
    return response.json()["data"]


def test_complete_business_flow_and_closed_exam(client, app):
    register(client)
    post(client, "/auth/logout")
    post(client, "/auth/login", {"phone": "13800000001", "password": "Local-test-123!"})
    assert post(client, "/exam/getAvailableExams")["list"][0]["examId"] == "cognitive-demo"
    session = start(client)
    q = session["currentQuestion"]
    seen_types = set()
    for answer in ["C", "C,A", "A", "B", "A,C", "D"]:
        seen_types.add(q["questionType"])
        assert "correctAnswer" not in q
        result = post(client, "/exam/submitAnswer", answer_body(session, q, answer))
        q = result["nextQuestion"]
    assert seen_types == {0, 1}
    assert result["isExamFinished"] and q is None
    assert progress(client, session)["status"] == "completed"
    assert post(client, "/exam/resumeExam", {"sessionCode": session["sessionCode"]})["isExamFinished"]
    post(client, "/exam/submitAnswer", answer_body(session), expected=409)
    assert start(client)["sessionCode"] == session["sessionCode"]
    assert start(client)["isExamFinished"]
    with app.state.db.connect() as conn:
        rows = conn.execute("SELECT * FROM answers ORDER BY question_index").fetchall()
        assert len(rows) == 6 and all(r["is_correct"] for r in rows)
        assert rows[1]["answer"] == "A,C"
        assert conn.execute("SELECT finish_reason FROM exam_sessions").fetchone()[0] == "normal"


def test_early_finish_is_idempotent_and_freezes_answers(client, app):
    register(client)
    session = start(client)
    post(client, "/exam/submitAnswer", answer_body(session))
    post(client, "/exam/finishExam", {"sessionCode": session["sessionCode"]})
    with app.state.db.connect() as conn:
        before = dict(conn.execute("SELECT * FROM exam_sessions").fetchone())
    post(client, "/exam/finishExam", {"sessionCode": session["sessionCode"]})
    post(client, "/exam/submitAnswer", answer_body(session), expected=409)
    with app.state.db.connect() as conn:
        assert dict(conn.execute("SELECT * FROM exam_sessions").fetchone()) == before
        assert conn.execute("SELECT COUNT(*) FROM answers").fetchone()[0] == 1
        assert before["finish_reason"] == "early"


def test_users_have_independent_progress_and_cannot_access_each_other(client, app):
    register(client)
    a = start(client)
    post(client, "/exam/submitAnswer", answer_body(a))
    with TestClient(app, headers={"Content-Type": "application/json"}) as other:
        register(other, "13800000002")
        b = start(other)
        assert b["sessionCode"] != a["sessionCode"]
        assert progress(other, b)["answeredQuestions"] == 0
        assert progress(client, a)["answeredQuestions"] == 1
        for actor, target in [(other, a), (client, b)]:
            post(actor, "/exam/resumeExam", {"sessionCode": target["sessionCode"]}, expected=404)
            post(actor, "/exam/finishExam", {"sessionCode": target["sessionCode"]}, expected=404)
            post(actor, "/exam/submitAnswer", answer_body(target), expected=404)
            assert actor.get(PREFIX + "/exam/getExamProgress", params={"sessionCode": target["sessionCode"]}).status_code == 404
            records = post(actor, "/exam/getMyExamRecords")["list"]
            assert len(records) == 1 and records[0]["sessionCode"] != target["sessionCode"]


def test_refresh_and_server_restart_preserve_progress_deadline_and_cookie(client, app, settings, clock):
    register(client)
    session = start(client)
    post(client, "/exam/submitAnswer", answer_body(session, answer="C"))
    clock.advance(17)
    restored = post(client, "/exam/resumeExam", {"sessionCode": session["sessionCode"]})
    assert restored["currentQuestion"]["questionIndex"] == 2
    assert restored["currentQuestion"]["remainingSeconds"] == 43
    with TestClient(create_app(settings, clock), cookies=dict(client.cookies), headers={"Content-Type": "application/json"}) as restarted:
        assert restarted.get(PREFIX + "/auth/me").status_code == 200
        restored_again = post(restarted, "/exam/resumeExam", {"sessionCode": session["sessionCode"]})
        assert restored_again == restored
        assert progress(restarted, session)["answeredQuestions"] == 1
        post(restarted, "/auth/logout")
        post(restarted, "/auth/login", {"phone": "13800000001", "password": "Local-test-123!"})


def test_deadline_cannot_be_reset_and_timeout_records_blank(client, app, clock):
    register(client)
    session = start(client)
    clock.advance(60)
    for _ in range(2):
        restored = post(client, "/exam/resumeExam", {"sessionCode": session["sessionCode"]})
        assert restored["currentQuestion"]["remainingSeconds"] == 0
        assert start(client)["currentQuestion"]["remainingSeconds"] == 0
    result = post(client, "/exam/submitAnswer", answer_body(session, answer="C"))
    assert result["timedOut"]
    assert result["nextQuestion"]["questionIndex"] == 2
    assert result["nextQuestion"]["remainingSeconds"] == 60
    clock.advance(61)
    post(client, "/exam/submitAnswer", answer_body(session, result["nextQuestion"], ""))
    with app.state.db.connect() as conn:
        rows = conn.execute("SELECT * FROM answers").fetchall()
        assert len(rows) == 2
        assert all(r["answer"] == "" and r["timed_out"] and not r["is_correct"] for r in rows)


def test_duplicate_answer_retry_does_not_skip_question(client, app):
    register(client)
    session = start(client)
    first = post(client, "/exam/submitAnswer", answer_body(session))
    retry = post(client, "/exam/submitAnswer", answer_body(session))
    assert retry["duplicate"]
    assert first["nextQuestion"]["questionId"] == retry["nextQuestion"]["questionId"]
    post(client, "/exam/submitAnswer", answer_body(session, answer="B"), expected=409)
    assert progress(client, session)["answeredQuestions"] == 1


def test_concurrent_start_and_submission_are_atomic(client, app):
    register(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        sessions = list(pool.map(lambda _: start(client), range(2)))
    assert sessions[0]["sessionCode"] == sessions[1]["sessionCode"]
    body = answer_body(sessions[0])
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: post(client, "/exam/submitAnswer", body), range(2)))
    assert all(r["nextQuestion"]["questionIndex"] == 2 for r in results)
    with app.state.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM answers").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM exam_sessions").fetchone()[0] == 1


@pytest.mark.parametrize("patch,expected", [
    ({"answer": ""}, 400), ({"answer": "Z"}, 400),
    ({"answer": "A,B"}, 400), ({"answer": "A,A"}, 400),
    ({"questionId": "q2"}, 400),
    ({"questionId": "q2", "questionIndex": 2}, 409),
    ({"questionIndex": 0}, 422), ({"questionIndex": "1"}, 422),
    ({"questionIndex": 9999}, 409), ({"userId": 99}, 422),
])
def test_invalid_answer_does_not_change_state(client, patch, expected):
    register(client)
    session = start(client)
    post(client, "/exam/submitAnswer", {**answer_body(session), **patch}, expected=expected)
    assert progress(client, session)["answeredQuestions"] == 0
    assert progress(client, session)["questionIndex"] == 1


def test_question_snapshot_survives_question_bank_edit(client, app):
    register(client)
    session = start(client)
    with app.state.db.connect(write=True) as conn:
        conn.execute("UPDATE questions SET content = 'changed', correct_answer = 'D', time_limit_seconds = 1 WHERE id = 'q1'")
    restored = post(client, "/exam/resumeExam", {"sessionCode": session["sessionCode"]})
    assert restored["currentQuestion"] == session["currentQuestion"]
    post(client, "/exam/submitAnswer", answer_body(session, answer="C"))
    with app.state.db.connect() as conn:
        assert conn.execute("SELECT is_correct FROM answers").fetchone()[0] == 1


def test_seed_is_repeatable_and_pagination_validated(client, app):
    app.state.db.initialize()
    register(client)
    assert post(client, "/exam/getAvailableExams")["total"] == 1
    assert post(client, "/exam/getAvailableExams", {"curPage": 2, "pageSize": 1})["list"] == []
    post(client, "/exam/getAvailableExams", {"pageSize": 0}, expected=422)
    post(client, "/exam/startExam", {"examId": "missing"}, expected=404)
    with app.state.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0] == 6
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
