import time
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import PREFIX, create_app
from backend.tests.isolation import IsolationError, install_sqlite_guard, require_run


def pytest_configure(config):
    try:
        run = require_run()
        directory = Path(run["directory"])
        if not config.option.basetemp or Path(config.option.basetemp).resolve() != directory / "cases":
            raise IsolationError("pytest 临时数据库目录必须由隔离启动器指定")
        if Path(config.getini("cache_dir")).resolve() != directory / "pytest-cache":
            raise IsolationError("pytest 缓存必须位于本轮测试目录")
        config._exam_original_connect = install_sqlite_guard()
    except (IsolationError, OSError, ValueError, KeyError) as exc:
        raise pytest.UsageError(str(exc)) from exc


def pytest_unconfigure(config):
    if hasattr(config, "_exam_original_connect"):
        sqlite3.connect = config._exam_original_connect


@dataclass
class Clock:
    now: float

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


@pytest.fixture
def clock():
    return Clock(time.time())


@pytest.fixture
def settings(tmp_path):
    return Settings(database_path=tmp_path / "exam.sqlite3")


@pytest.fixture
def app(settings, clock):
    return create_app(settings, clock)


@pytest.fixture
def client(app):
    with TestClient(app, headers={"Content-Type": "application/json"}) as client:
        yield client


def post(client, path, body=None, expected=200):
    response = client.post(PREFIX + path, json=body if body is not None else {})
    assert response.status_code == expected, response.text
    assert response.json()["code"] == expected
    return response.json().get("data")


def register(client, phone="13800000001", password="Local-test-123!"):
    return post(client, "/auth/register", {"phone": phone, "password": password})


def start(client):
    return post(client, "/exam/startExam", {"examId": "cognitive-demo"})


def answer_body(session, question=None, answer="A"):
    q = question or session["currentQuestion"]
    return {"sessionCode": session["sessionCode"], "questionId": q["questionId"], "questionIndex": q["questionIndex"], "answer": answer}
