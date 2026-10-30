import time
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import PREFIX, create_app


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
