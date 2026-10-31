import json
import os
import sqlite3
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import PREFIX, create_app
from backend.tests.conftest import answer_body, post, register, start
from backend.tests.isolation import IsolationError, require_run


def test_runtime_is_under_vite_ignored_node_modules():
    run = require_run()
    directory = Path(run["directory"])
    assert directory.parent.parent.name == "node_modules"
    # Check the installed Vite's actual watcher rule, not just our directory name.
    vite = Path(run["workspace"]) / "node_modules/vite/dist/node/chunks/config.js"
    source = vite.read_text(encoding="utf-8")
    start_at = source.index("function resolveChokidarOptions(")
    assert '"**/node_modules/**"' in source[start_at:start_at + 1200]


def test_database_guard_rejects_live_database_before_open():
    run = require_run()
    protected = Path(run["workspace"]) / "backend/data/exam.sqlite3"
    for filename in (protected, protected.as_uri() + "?mode=ro"):
        with pytest.raises(IsolationError, match="运行目录以外"):
            sqlite3.connect(filename, uri=isinstance(filename, str))


def test_missing_or_forged_test_identity_fails_closed(monkeypatch):
    monkeypatch.setenv("EXAM_TEST_NONCE", "wrong-nonce")
    with pytest.raises(IsolationError, match="标识无效"):
        require_run()
    monkeypatch.delenv("EXAM_TEST_MODE")
    with pytest.raises(IsolationError, match="禁止测试回退"):
        require_run()


def test_cleanup_refuses_while_suite_is_running(tmp_path):
    run = require_run()
    canary = tmp_path / "do-not-delete.txt"
    canary.write_text("ongoing-test-data", encoding="utf-8")
    result = subprocess.run(
        ["node", str(Path(run["workspace"]) / "scripts/clean-tests.mjs"), "--run", run["id"]],
        cwd=run["source"], env=os.environ.copy(), capture_output=True, encoding="utf-8", timeout=10,
    )
    assert result.returncode != 0
    assert "已有测试或清理正在运行" in result.stderr
    assert canary.read_text(encoding="utf-8") == "ongoing-test-data"
    assert (Path(run["directory"]) / ".active.lock").exists()


def test_inherited_live_config_is_replaced_by_owned_test_config():
    run = require_run()
    module = (Path(run["workspace"]) / "scripts/test-env.mjs").as_uri()
    code = (
        f"const {{testEnvironment}} = await import({json.dumps(module)});"
        f"const e = testEnvironment({json.dumps(run)});"
        "console.log(JSON.stringify({db:e.EXAM_DATABASE_PATH,proxy:e.VITE_API_PROXY_TARGET,secure:e.COOKIE_SECURE,python:e.PYTHONPATH}));"
    )
    env = {**os.environ, "EXAM_DATABASE_PATH": "backend/data/exam.sqlite3", "VITE_API_PROXY_TARGET": "http://localhost:8003", "COOKIE_SECURE": "true"}
    result = subprocess.run(["node", "--input-type=module", "-e", code], env=env, capture_output=True, encoding="utf-8", timeout=10)
    assert result.returncode == 0, result.stderr
    actual = json.loads(result.stdout)
    assert actual == {"db": run["database"], "secure": "false", "python": run["source"]}


def test_cleanup_only_removes_finished_owned_directory():
    run = require_run()
    module = (Path(run["workspace"]) / "scripts/test-env.mjs").as_uri()
    code = f"""
      import {{existsSync}} from 'node:fs';
      const {{createRun, cleanableRun, finishRun, removeFinishedRun}} = await import({json.dumps(module)});
      const owned = createRun('guards');
      if (cleanableRun(owned.directory)) throw new Error('Active run was cleanable');
      let rejected = false;
      try {{ removeFinishedRun(owned.directory); }} catch {{ rejected = true; }}
      if (!rejected || !existsSync(owned.directory)) throw new Error('Active data was not protected');
      finishRun(owned, 'passed', 0);
      if (!cleanableRun(owned.directory)) throw new Error('Completed owned run was not cleanable');
      removeFinishedRun(owned.directory);
      if (existsSync(owned.directory)) throw new Error('Completed run was not removed');
      console.log('active-protected, completed-cleaned');
    """
    result = subprocess.run(["node", "--input-type=module", "-e", code], capture_output=True, encoding="utf-8", timeout=10)
    assert result.returncode == 0, result.stderr
    assert "active-protected, completed-cleaned" in result.stdout


def test_separate_test_database_restart_does_not_change_ongoing_session(client, clock, tmp_path):
    register(client)
    ongoing = start(client)
    post(client, "/exam/submitAnswer", answer_body(ongoing, answer="C"))
    before = client.get(PREFIX + "/exam/getExamProgress", params={"sessionCode": ongoing["sessionCode"]}).json()["data"]
    other_settings = Settings(database_path=tmp_path / "other-suite.sqlite3")
    with TestClient(create_app(other_settings, clock), headers={"Content-Type": "application/json"}) as other:
        register(other)
        session = start(other)
        q = session["currentQuestion"]
        for answer in ["C", "A,C", "A", "B", "A,C", "D"]:
            result = post(other, "/exam/submitAnswer", answer_body(session, q, answer))
            q = result["nextQuestion"]
        assert result["isExamFinished"]
    with TestClient(create_app(other_settings, clock), headers={"Content-Type": "application/json"}) as restarted:
        post(restarted, "/auth/login", {"phone": "13800000001", "password": "Local-test-123!"})
        assert post(restarted, "/exam/resumeExam", {"sessionCode": session["sessionCode"]})["isExamFinished"]
    assert client.get(PREFIX + "/auth/me").status_code == 200
    after = client.get(PREFIX + "/exam/getExamProgress", params={"sessionCode": ongoing["sessionCode"]}).json()["data"]
    assert before == after and after["status"] == "in_progress"
    restored = post(client, "/exam/resumeExam", {"sessionCode": ongoing["sessionCode"]})
    assert restored["currentQuestion"]["questionIndex"] == 2
    assert post(client, "/exam/submitAnswer", answer_body(ongoing, restored["currentQuestion"], "A,C"))["nextQuestion"]["questionIndex"] == 3
