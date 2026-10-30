import hashlib

import pytest
from fastapi.testclient import TestClient

from backend.main import ACCESS_COOKIE, PREFIX, REFRESH_COOKIE
from backend.tests.conftest import post, register


def test_registration_login_wrong_password_logout(client, app):
    assert register(client)["userInfo"]["phone"] == "13800000001"
    assert client.get(PREFIX + "/auth/me").json()["data"] == {"phone": "13800000001"}
    with app.state.db.connect() as conn:
        user = conn.execute("SELECT * FROM users").fetchone()
        assert user["password_hash"].startswith("scrypt$")
        assert "Local-test-123!" not in user["password_hash"]
        session = conn.execute("SELECT * FROM auth_sessions").fetchone()
        assert session["access_hash"] == hashlib.sha256(client.cookies.get(ACCESS_COOKIE).encode()).hexdigest()
        assert session["access_hash"] != client.cookies.get(ACCESS_COOKIE)
    stolen_cookies = dict(client.cookies)
    post(client, "/auth/logout")
    assert client.get(PREFIX + "/auth/me").status_code == 401
    with TestClient(app, headers={"Content-Type": "application/json"}, cookies=stolen_cookies) as revoked:
        assert revoked.get(PREFIX + "/auth/me").status_code == 401
        post(revoked, "/auth/refresh", expected=401)
    post(client, "/auth/login", {"phone": "13800000001", "password": "wrong-password"}, expected=401)
    post(client, "/auth/login", {"phone": "13900000009", "password": "wrong-password"}, expected=401)
    post(client, "/auth/login", {"phone": "13800000001", "password": "Local-test-123!"})
    assert client.get(PREFIX + "/auth/me").status_code == 200


def test_duplicate_registration_and_salted_passwords(client, app):
    register(client)
    post(client, "/auth/register", {"phone": "13800000001", "password": "different-password"}, expected=409)
    register(client, "13800000002")
    with app.state.db.connect() as conn:
        hashes = [r[0] for r in conn.execute("SELECT password_hash FROM users")]
        assert len(hashes) == 2 and hashes[0] != hashes[1]


@pytest.mark.parametrize("phone,password", [
    ("123", "long-enough"), ("12800000000", "long-enough"),
    ("13800000001", "short"), ("13800000001", " " * 8),
    ("13800000001", "x" * 129), ("13800000001' OR 1=1 --", "long-enough"),
])
def test_invalid_credentials_not_persisted(client, app, phone, password):
    response = client.post(PREFIX + "/auth/register", json={"phone": phone, "password": password})
    assert response.status_code == 422
    assert password not in response.text
    with app.state.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


def test_refresh_expiry_rotation_and_cookie_flags(client, clock, settings, app):
    response = client.post(PREFIX + "/auth/register", json={"phone": "13800000001", "password": "Local-test-123!"})
    cookies = response.headers.get_list("set-cookie")
    assert len(cookies) == 2
    assert all("HttpOnly" in c and "SameSite=lax" in c for c in cookies)
    access = client.cookies.get(ACCESS_COOKIE)
    refresh = client.cookies.get(REFRESH_COOKIE)
    clock.advance(settings.access_seconds + 1)
    assert client.get(PREFIX + "/auth/me").status_code == 401
    post(client, "/auth/refresh")
    assert client.cookies.get(ACCESS_COOKIE) != access
    assert client.cookies.get(REFRESH_COOKIE) == refresh
    assert client.get(PREFIX + "/auth/me").status_code == 200
    with TestClient(app, cookies={ACCESS_COOKIE: access}) as old:
        assert old.get(PREFIX + "/auth/me").status_code == 401
    clock.advance(settings.refresh_seconds)
    post(client, "/auth/refresh", expected=401)


def test_cross_origin_and_form_requests_rejected(client, app):
    response = client.post(PREFIX + "/auth/register", headers={"Origin": "https://attacker.example"}, json={"phone": "13800000001", "password": "Local-test-123!"})
    assert response.status_code == 403
    response = client.post(PREFIX + "/auth/register", headers={"Content-Type": "application/x-www-form-urlencoded"}, content="phone=13800000001&password=Local-test-123!")
    assert response.status_code == 415
    response = client.post(PREFIX + "/auth/register", headers={"Origin": "http://localhost:5173"}, json={"phone": "13800000001", "password": "Local-test-123!"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"


@pytest.mark.parametrize("method,path,body", [
    ("GET", "/auth/me", None),
    ("POST", "/exam/getAvailableExams", {}),
    ("POST", "/exam/getMyExamRecords", {}),
    ("POST", "/exam/startExam", {"examId": "cognitive-demo"}),
    ("POST", "/exam/resumeExam", {"sessionCode": "anything"}),
    ("GET", "/exam/getExamProgress?sessionCode=anything", None),
    ("POST", "/exam/submitAnswer", {"sessionCode": "anything", "questionId": "q1", "questionIndex": 1, "answer": "A"}),
    ("POST", "/exam/finishExam", {"sessionCode": "anything"}),
])
def test_unauthenticated_routes(client, method, path, body):
    response = client.get(PREFIX + path) if method == "GET" else client.post(PREFIX + path, json=body)
    assert response.status_code == 401
