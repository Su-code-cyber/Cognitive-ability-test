"""A real HTTP server process is stopped and restarted against the same SQLite file."""
import os
import socket
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path

import httpx

from backend.main import PREFIX


@contextmanager
def server(database, port, log):
    root = Path(__file__).resolve().parents[2]
    env = {**os.environ, "EXAM_DATABASE_PATH": str(database), "PYTHONDONTWRITEBYTECODE": "1"}
    with log.open("ab") as output:
        process = subprocess.Popen(
            [sys.executable, "-B", "-m", "uvicorn", "backend.main:create_app", "--factory", "--host", "127.0.0.1", "--port", str(port)],
            cwd=root, env=env, stdout=output, stderr=output,
        )
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{port}", trust_env=False, timeout=2) as probe:
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise AssertionError(log.read_text(encoding="utf-8", errors="replace"))
                    try:
                        if probe.get("/health").status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    time.sleep(0.1)
                else:
                    raise AssertionError("HTTP server did not start")
            yield
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def test_real_process_restart(tmp_path):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    db = tmp_path / "persistent.sqlite3"
    log = tmp_path / "server.log"
    with httpx.Client(base_url=f"http://127.0.0.1:{port}", trust_env=False) as client:
        with server(db, port, log):
            r = client.post(PREFIX + "/auth/register", json={"phone": "13800000999", "password": "Local-test-123!"})
            assert r.status_code == 200
            session = client.post(PREFIX + "/exam/startExam", json={"examId": "cognitive-demo"}).json()["data"]
            code = session["sessionCode"]
            q = session["currentQuestion"]
            r = client.post(PREFIX + "/exam/submitAnswer", json={"sessionCode": code, "questionId": q["questionId"], "questionIndex": 1, "answer": "C"})
            assert r.status_code == 200
        with server(db, port, log):
            assert client.get(PREFIX + "/auth/me").status_code == 200
            r = client.post(PREFIX + "/exam/resumeExam", json={"sessionCode": code})
            assert r.status_code == 200
            assert r.json()["data"]["currentQuestion"]["questionIndex"] == 2
            r = client.get(PREFIX + "/exam/getExamProgress", params={"sessionCode": code})
            assert r.json()["data"]["answeredQuestions"] == 1
