import secrets
import sqlite3
import time
from contextlib import asynccontextmanager
from typing import Annotated, Callable

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend import exams
from backend.config import Settings
from backend.db import Database
from backend.schemas import AnswerRequest, Credentials, PageRequest, QuestionTimerRequest, SessionRequest, StartRequest
from backend.security import hash_password, new_token, token_hash, verify_password

PREFIX = "/api/blue/bluecommonservice"
ACCESS_COOKIE = "exam_access"
REFRESH_COOKIE = "exam_refresh"


def ok(data=None):
    return {"code": 200, "message": "成功", "data": data if data is not None else {}}


def create_app(settings: Settings | None = None, clock: Callable[[], float] = time.time):
    settings = settings or Settings()
    db = Database(settings)

    @asynccontextmanager
    async def lifespan(app):
        db.initialize()
        yield

    app = FastAPI(title="认知能力测试 API", version="1.0.0", lifespan=lifespan)
    app.state.db = db
    app.state.settings = settings
    app.state.clock = clock
    app.add_middleware(
        CORSMiddleware, allow_origins=list(settings.allowed_origins),
        allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
    )

    @app.middleware("http")
    async def request_guards(request: Request, call_next):
        if request.url.path.startswith(PREFIX) and request.method == "POST":
            origin = request.headers.get("origin")
            if origin is not None and origin not in settings.allowed_origins:
                return JSONResponse({"code": 403, "message": "不允许的请求来源", "data": None}, status_code=403)
            if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
                return JSONResponse({"code": 415, "message": "请求必须使用 application/json", "data": None}, status_code=415)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        return JSONResponse({"code": exc.status_code, "message": str(exc.detail), "data": None}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Do not echo passwords or other raw request values into error responses.
        return JSONResponse({"code": 422, "message": "参数格式错误：手机号须为11位有效格式，密码须为8至128位，其他参数请检查接口文档", "data": None}, status_code=422)

    def require_user(request: Request):
        token = request.cookies.get(ACCESS_COOKIE)
        if not token:
            raise HTTPException(401, "未登录或登录已过期")
        with db.connect() as conn:
            user = conn.execute(
                "SELECT u.id, u.phone FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.access_hash = ? AND s.access_expires_at > ? AND s.refresh_expires_at > ?",
                (token_hash(token), clock(), clock()),
            ).fetchone()
        if user is None:
            raise HTTPException(401, "未登录或登录已过期")
        return dict(user)

    User = Annotated[dict, Depends(require_user)]

    def set_cookies(response, access, refresh=None):
        response.set_cookie(ACCESS_COOKIE, access, max_age=settings.access_seconds, httponly=True, secure=settings.cookie_secure, samesite="lax", path=PREFIX)
        if refresh:
            response.set_cookie(REFRESH_COOKIE, refresh, max_age=settings.refresh_seconds, httponly=True, secure=settings.cookie_secure, samesite="lax", path=PREFIX + "/auth")

    def issue_session(conn, user_id, response):
        access, refresh = new_token(), new_token()
        now = clock()
        conn.execute(
            "INSERT INTO auth_sessions(user_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, token_hash(access), token_hash(refresh), now + settings.access_seconds, now + settings.refresh_seconds),
        )
        set_cookies(response, access, refresh)

    @app.get("/health")
    def health():
        with db.connect() as conn:
            conn.execute("SELECT 1").fetchone()
        return ok({"status": "ok"})

    @app.post(PREFIX + "/auth/register")
    def register(body: Credentials, response: Response):
        if not body.password.strip():
            raise HTTPException(422, "密码不能全为空白")
        password_hash = hash_password(body.password)
        try:
            with db.connect(write=True) as conn:
                result = conn.execute("INSERT INTO users(phone, password_hash, created_at) VALUES (?, ?, ?)", (body.phone, password_hash, clock()))
                issue_session(conn, result.lastrowid, response)
        except sqlite3.IntegrityError:
            raise HTTPException(409, "该手机号已注册") from None
        return ok({"userInfo": {"phone": body.phone}})

    # A fixed dummy hash ensures nonexistent accounts also pay the password-check cost.
    dummy_hash = hash_password(secrets.token_urlsafe(32))

    @app.post(PREFIX + "/auth/login")
    def login(body: Credentials, response: Response):
        with db.connect() as conn:
            user = conn.execute("SELECT * FROM users WHERE phone = ?", (body.phone,)).fetchone()
        valid = verify_password(body.password, user["password_hash"] if user else dummy_hash)
        if not user or not valid:
            raise HTTPException(401, "手机号或密码错误")
        with db.connect(write=True) as conn:
            issue_session(conn, user["id"], response)
        return ok({"userInfo": {"phone": user["phone"]}})

    @app.get(PREFIX + "/auth/me")
    def me(user: User):
        return ok({"phone": user["phone"]})

    @app.post(PREFIX + "/auth/refresh")
    def refresh(request: Request, response: Response):
        token = request.cookies.get(REFRESH_COOKIE)
        if not token:
            raise HTTPException(401, "登录已过期，请重新登录")
        with db.connect(write=True) as conn:
            row = conn.execute("SELECT * FROM auth_sessions WHERE refresh_hash = ? AND refresh_expires_at > ?", (token_hash(token), clock())).fetchone()
            if not row:
                raise HTTPException(401, "登录已过期，请重新登录")
            access = new_token()
            conn.execute("UPDATE auth_sessions SET access_hash = ?, access_expires_at = ? WHERE id = ?", (token_hash(access), min(clock() + settings.access_seconds, row["refresh_expires_at"]), row["id"]))
            set_cookies(response, access)
        return ok()

    @app.post(PREFIX + "/auth/logout")
    def logout(request: Request, response: Response):
        with db.connect(write=True) as conn:
            conn.execute("DELETE FROM auth_sessions WHERE access_hash = ? OR refresh_hash = ?", (
                token_hash(request.cookies.get(ACCESS_COOKIE, "")), token_hash(request.cookies.get(REFRESH_COOKIE, "")),
            ))
        response.delete_cookie(ACCESS_COOKIE, path=PREFIX)
        response.delete_cookie(REFRESH_COOKIE, path=PREFIX + "/auth")
        return ok()

    @app.post(PREFIX + "/exam/getAvailableExams")
    def available(body: PageRequest, user: User):
        with db.connect() as conn:
            total = conn.execute("SELECT COUNT(*) FROM exams WHERE enabled = 1").fetchone()[0]
            rows = conn.execute("SELECT id, title FROM exams WHERE enabled = 1 ORDER BY id LIMIT ? OFFSET ?", (body.pageSize, (body.curPage - 1) * body.pageSize)).fetchall()
        return ok({"list": [{"examId": r["id"], "title": r["title"]} for r in rows], "total": total})

    @app.post(PREFIX + "/exam/startExam")
    def start(body: StartRequest, user: User):
        with db.connect(write=True) as conn:
            return ok(exams.start(conn, user["id"], body.examId, clock()))

    @app.post(PREFIX + "/exam/getMyExamRecords")
    def records(body: PageRequest, user: User):
        with db.connect() as conn:
            total = conn.execute("SELECT COUNT(*) FROM exam_sessions WHERE user_id = ?", (user["id"],)).fetchone()[0]
            rows = conn.execute(
                "SELECT session_code, exam_id, status, current_index, started_at, finished_at FROM exam_sessions WHERE user_id = ? ORDER BY started_at DESC, session_code LIMIT ? OFFSET ?",
                (user["id"], body.pageSize, (body.curPage - 1) * body.pageSize),
            ).fetchall()
        return ok({"list": [{"sessionCode": r["session_code"], "examId": r["exam_id"], "status": r["status"], "questionIndex": r["current_index"], "startedAt": r["started_at"], "finishedAt": r["finished_at"]} for r in rows], "total": total})

    @app.post(PREFIX + "/exam/resumeExam")
    def resume(body: SessionRequest, user: User):
        with db.connect(write=True) as conn:
            return ok(exams.resume(conn, user["id"], body.sessionCode, clock()))

    @app.post(PREFIX + "/exam/heartbeat")
    def heartbeat(body: QuestionTimerRequest, user: User):
        with db.connect(write=True) as conn:
            return ok(exams.heartbeat(conn, user["id"], body, clock()))

    @app.get(PREFIX + "/exam/getExamProgress")
    def progress(user: User, sessionCode: Annotated[str, Query(min_length=1, max_length=100)]):
        with db.connect() as conn:
            session = exams.owned_session(conn, sessionCode, user["id"])
            answered = conn.execute("SELECT COUNT(*) FROM answers WHERE session_code = ?", (sessionCode,)).fetchone()[0]
            return ok({"totalQuestions": exams.total_questions(conn, sessionCode), "answeredQuestions": answered, "questionIndex": session["current_index"], "status": session["status"]})

    @app.post(PREFIX + "/exam/submitAnswer")
    def submit(body: AnswerRequest, user: User):
        with db.connect(write=True) as conn:
            return ok(exams.submit(conn, user["id"], body, clock()))

    @app.post(PREFIX + "/exam/finishExam")
    def finish(body: SessionRequest, user: User):
        with db.connect(write=True) as conn:
            return ok(exams.finish(conn, user["id"], body.sessionCode, clock()))

    return app
