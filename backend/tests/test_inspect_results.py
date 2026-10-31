import hashlib
import sqlite3

import pytest

from backend import inspect_results
from backend.config import Settings
from backend.db import Database
from backend.exams import finish, start, submit
from backend.schemas import AnswerRequest


def test_read_only_results_keep_users_snapshots_timeouts_and_unsubmitted_separate(tmp_path, monkeypatch):
    database = tmp_path / "results.sqlite3"
    db = Database(Settings(database_path=database))
    db.initialize()
    now = 1800000000
    with db.connect(write=True) as conn:
        for user_id in range(1, 4):
            conn.execute("INSERT INTO users VALUES (?, ?, ?, ?)", (user_id, f"1380000000{user_id}", "test-only-hash", now))
        a = start(conn, 1, "cognitive-demo", now)
        b = start(conn, 2, "cognitive-demo", now)
        for code, answer in [(a["sessionCode"], "C"), (b["sessionCode"], "A")]:
            submit(conn, 1 if code == a["sessionCode"] else 2, AnswerRequest(
                sessionCode=code, questionId="q1", questionIndex=1, answer=answer,
            ), now + 1)
        submit(conn, 1, AnswerRequest(sessionCode=a["sessionCode"], questionId="q2", questionIndex=2, answer="A,C"), now + 61)
        finish(conn, 1, a["sessionCode"], now + 62)
        conn.execute("UPDATE questions SET content = 'changed', correct_answer = 'D' WHERE id = 'q1'")

    before = hashlib.sha256(database.read_bytes()).hexdigest()
    real_connect = sqlite3.connect

    def checked_read_only_connect(*args, **kwargs):
        conn = real_connect(*args, **kwargs)
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            conn.execute("DELETE FROM users")
        conn.rollback()  # The rejected write attempt may still have opened an implicit transaction.
        return conn

    monkeypatch.setattr(inspect_results.sqlite3, "connect", checked_read_only_connect)
    report = inspect_results.read_results(database, phone="13800000001", details=True)
    assert len(report["results"]) == 1
    result = report["results"][0]
    assert result["status"] == "completed" and result["finishReason"] == "early"
    assert result["submittedQuestions"] == 2 and result["correctQuestions"] == 1
    assert result["timedOutQuestions"] == 1
    q1, q2, q3 = result["questions"][:3]
    assert q1["answer"] == q1["correctAnswer"] == "C" and q1["isCorrect"]
    assert q1["content"] != "changed" and "<p>" not in q1["content"]
    assert q2["answer"] == "" and q2["timedOut"] and q2["isCorrect"] is False
    assert q3["answer"] is None and q3["timedOut"] is None and q3["submittedAt"] is None
    assert q1["submittedAt"].endswith("+08:00")
    assert "password_hash" not in str(report) and "test-only-hash" not in str(report)
    other = inspect_results.read_results(database, session=b["sessionCode"], details=True)["results"][0]
    assert other["phone"] == "13800000002"
    assert other["questions"][0]["answer"] == "A" and not other["questions"][0]["isCorrect"]
    summary = inspect_results.read_results(database)["results"]
    assert len(summary) == 3 and all("questions" not in user for user in summary)
    assert summary[2]["status"] == "not_started" and summary[2]["sessionCode"] is None
    assert inspect_results.read_results(database, phone="13800000999")["results"] == []
    assert hashlib.sha256(database.read_bytes()).hexdigest() == before


def test_read_only_query_does_not_create_missing_database(tmp_path):
    database = tmp_path / "missing.sqlite3"
    with pytest.raises(sqlite3.OperationalError):
        inspect_results.read_results(database)
    assert not database.exists()
