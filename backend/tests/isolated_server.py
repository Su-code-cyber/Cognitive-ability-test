from backend.main import create_app
from backend.tests.isolation import install_sqlite_guard, require_run


def create_test_app():
    run = require_run()
    install_sqlite_guard()
    app = create_app()

    @app.middleware("http")
    async def identify_test_service(request, call_next):
        response = await call_next(request)
        response.headers["X-Exam-Test-Run"] = run["nonce"]
        return response

    # No production route, time override API or test identity is added to backend.main.
    return app
