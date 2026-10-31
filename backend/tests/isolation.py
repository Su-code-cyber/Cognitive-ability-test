"""Fail-closed guards used only by test processes, never by the live application."""
import json
import os
import sqlite3
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import url2pathname

MARKER = "question-isolated-tests-v1"


class IsolationError(RuntimeError):
    pass


def require_run():
    if os.environ.get("EXAM_TEST_MODE") != "1" or not os.environ.get("EXAM_TEST_RUN_DIR"):
        raise IsolationError("请通过 npm run test:api 或 npm run test:e2e 启动；禁止测试回退到开发数据库。")
    directory = Path(os.environ["EXAM_TEST_RUN_DIR"]).resolve()
    if (directory.parent.name != "test-runs" or directory.parent.parent.name != "node_modules"
            or directory.parent.parent.parent.name != ".runtime"):
        raise IsolationError("测试目录必须位于项目 .runtime/node_modules/test-runs 中以隔离开发文件监听")
    run = json.loads((directory / "run.json").read_text(encoding="utf-8"))
    if (run.get("marker") != MARKER or Path(run["directory"]).resolve() != directory
            or Path(run["workspace"]).resolve() != directory.parent.parent.parent.parent
            or run.get("nonce") != os.environ.get("EXAM_TEST_NONCE")
            or run.get("status") != "running" or not (directory / ".active.lock").is_file()):
        raise IsolationError("测试运行标识无效或已经结束")
    guard_database(os.environ.get("EXAM_DATABASE_PATH", ""), directory)
    return run


def guard_database(filename, directory=None):
    directory = Path(directory or os.environ["EXAM_TEST_RUN_DIR"]).resolve()
    value = os.fspath(filename)
    if value == ":memory:":
        return
    if value.startswith("file:"):
        parts = urlsplit(value)
        if parts.netloc not in ("", "localhost"):
            raise IsolationError("不允许网络数据库文件路径")
        value = url2pathname(parts.path)
    if not value:
        raise IsolationError("测试数据库路径不能为空")
    database = Path(value).resolve()
    if not database.is_relative_to(directory) or database == directory:
        raise IsolationError("拒绝测试访问运行目录以外的数据库")
    if database.exists() and database.stat().st_nlink > 1:
        raise IsolationError("拒绝访问存在硬链接别名的测试数据库")
    return database


def install_sqlite_guard():
    original = sqlite3.connect

    def guarded_connect(database, *args, **kwargs):
        guard_database(database)
        return original(database, *args, **kwargs)

    sqlite3.connect = guarded_connect
    return original
