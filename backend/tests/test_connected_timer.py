"""Connected-time accounting must survive outages without spending unseen questions."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.db import Database
from backend.main import create_app
from backend.tests.conftest import answer_body, online_seconds, post, register, start


def timer_body(session, question=None):
    body = answer_body(session, question)
    del body["answer"]
    return body


def test_offline_refresh_longer_than_question_limit_never_skips(client, app, clock, settings):
    register(client)
    session = start(client)
    online_seconds(client, clock, session, 13)
    clock.advance(600)
    with TestClient(create_app(settings, clock), cookies=dict(client.cookies)) as restarted:
        restored = post(restarted, "/exam/resumeExam", {"sessionCode": session["sessionCode"]})
        q = restored["currentQuestion"]
        assert q["questionId"] == "q1" and q["remainingSeconds"] == 47
        # Repeated refresh/start cannot refill time or create a new attempt.
        for _ in range(3):
            assert start(restarted)["currentQuestion"] == q
        result = post(restarted, "/exam/submitAnswer", answer_body(session, q, "C"))
        assert not result["timedOut"] and result["nextQuestion"]["questionIndex"] == 2
    with app.state.db.connect() as conn:
        rows = conn.execute("SELECT * FROM answers").fetchall()
        assert len(rows) == 1 and rows[0]["answer"] == "C" and not rows[0]["timed_out"]


def test_short_disconnect_near_deadline_keeps_last_confirmed_second(client, clock):
    register(client)
    session = start(client)
    online_seconds(client, clock, session, 59)
    clock.advance(2)
    q = post(client, "/exam/resumeExam", {"sessionCode": session["sessionCode"]})["currentQuestion"]
    assert q["questionIndex"] == 1 and q["remainingSeconds"] == 1
    result = post(client, "/exam/submitAnswer", answer_body(session, q, "C"))
    assert not result["timedOut"]


def test_missing_heartbeat_pauses_even_without_explicit_resume(client, clock):
    register(client)
    session = start(client)
    online_seconds(client, clock, session, 9)
    clock.advance(120)
    q = post(client, "/exam/heartbeat", timer_body(session))["currentQuestion"]
    assert q["remainingSeconds"] == 51
    clock.advance(1)
    assert post(client, "/exam/heartbeat", timer_body(session))["currentQuestion"]["remainingSeconds"] == 50


def test_fractional_accounting_is_persistent_and_concurrent_ticks_do_not_double_charge(client, app, clock):
    register(client)
    session = start(client)
    for _ in range(3):
        clock.advance(0.4)
        post(client, "/exam/heartbeat", timer_body(session))
        post(client, "/exam/resumeExam", {"sessionCode": session["sessionCode"]})
    clock.advance(1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: post(client, "/exam/heartbeat", timer_body(session)), range(2)))
    assert all(r["currentQuestion"]["remainingSeconds"] == 58 for r in results)
    with app.state.db.connect() as conn:
        assert conn.execute("SELECT question_remaining_seconds FROM exam_sessions").fetchone()[0] == pytest.approx(57.8, abs=0.001)


def test_stale_and_closed_heartbeats_cannot_spend_next_question(client, app, clock):
    register(client)
    session = start(client)
    post(client, "/exam/submitAnswer", answer_body(session))
    clock.advance(3)
    post(client, "/exam/heartbeat", timer_body(session), expected=409)
    with app.state.db.connect() as conn:
        assert conn.execute("SELECT question_remaining_seconds FROM exam_sessions").fetchone()[0] == 60
    post(client, "/exam/finishExam", {"sessionCode": session["sessionCode"]})
    post(client, "/exam/heartbeat", timer_body(session), expected=409)


def test_offline_user_does_not_pause_other_user(client, app, clock):
    register(client)
    a = start(client)
    online_seconds(client, clock, a, 5)
    with TestClient(app) as other:
        register(other, "13800000002")
        b = start(other)
        online_seconds(other, clock, b, 60)
        result = post(other, "/exam/submitAnswer", answer_body(b, answer=""))
        assert result["timedOut"]
        restored = post(client, "/exam/resumeExam", {"sessionCode": a["sessionCode"]})
        assert restored["currentQuestion"]["remainingSeconds"] == 55
        assert restored["currentQuestion"]["questionIndex"] == 1


def test_v1_migration_preserves_answers_and_bootstraps_current_question_once(tmp_path):
    db = Database(Settings(database_path=tmp_path / "legacy.sqlite3"))
    migration = Path(__file__).resolve().parents[1] / "migrations/001_initial.sql"
    seed = json.loads(migration.parent.parent.joinpath("seed.json").read_text(encoding="utf-8"))
    with db.connect() as conn:
        conn.executescript(migration.read_text(encoding="utf-8"))
        conn.execute("INSERT INTO users VALUES (1, '13800000001', 'test-hash', 1)")
        conn.execute("INSERT INTO exams(id,title) VALUES ('cognitive-demo','legacy')")
        conn.execute("INSERT INTO exam_sessions(session_code,user_id,exam_id,current_index,started_at,question_started_at) VALUES ('legacy',1,'cognitive-demo',2,1,1)")
        for index, q in enumerate(seed["questions"][:2], 1):
            conn.execute("INSERT INTO session_questions VALUES ('legacy',?,?,?)", (index, q["id"], json.dumps({**q, "questionId": q["id"], "timeLimitSeconds": 60})))
        conn.execute("INSERT INTO answers VALUES ('legacy',1,'q1','C',2,0,1)")
        before = tuple(conn.execute("SELECT * FROM answers").fetchone())
    db.initialize()
    from backend.exams import resume, heartbeat
    from backend.schemas import QuestionTimerRequest
    with db.connect(write=True) as conn:
        assert conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0] == 2
        assert tuple(conn.execute("SELECT * FROM answers").fetchone()) == before
        q = resume(conn, 1, "legacy", 10000)["currentQuestion"]
        assert q["questionIndex"] == 2 and q["remainingSeconds"] == 60
        heartbeat(conn, 1, QuestionTimerRequest(sessionCode="legacy", questionId="q2", questionIndex=2), 10002)
    db.initialize()
    with db.connect(write=True) as conn:
        assert resume(conn, 1, "legacy", 20000)["currentQuestion"]["remainingSeconds"] == 58
