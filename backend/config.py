import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    database_path: Path = field(default_factory=lambda: Path(
        os.getenv("EXAM_DATABASE_PATH", str(ROOT / "backend/data/exam.sqlite3"))
    ).resolve())
    access_seconds: int = 30 * 60
    refresh_seconds: int = 7 * 24 * 60 * 60
    cookie_secure: bool = field(default_factory=lambda: os.getenv("COOKIE_SECURE", "false").lower() == "true")
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        value.strip() for value in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8003,http://127.0.0.1:8003",
        ).split(",") if value.strip()
    ))
    question_seconds: int = field(default_factory=lambda: int(os.getenv("QUESTION_TIME_LIMIT_SECONDS", "60")))

    def __post_init__(self):
        if self.question_seconds < 1 or self.access_seconds < 1 or self.refresh_seconds < 1:
            raise ValueError("Timeouts must be positive")
