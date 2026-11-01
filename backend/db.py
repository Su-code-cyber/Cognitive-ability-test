import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from backend.config import Settings


class Database:
    def __init__(self, settings: Settings):
        self.settings = settings

    @contextmanager
    def connect(self, *, write=False):
        conn = sqlite3.connect(self.settings.database_path, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            if write:
                # Serialize state transitions, including concurrent submissions from tabs.
                conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def initialize(self):
        self.settings.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
            version = conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").fetchone()[0]
            if version > 2:
                raise RuntimeError("Database schema is newer than this application")
            if version < 1:
                migration = Path(__file__).with_name("migrations") / "001_initial.sql"
                conn.executescript("BEGIN IMMEDIATE;\n" + migration.read_text(encoding="utf-8") + "\nCOMMIT;")
            if version < 2:
                migration = Path(__file__).with_name("migrations") / "002_connected_timer.sql"
                conn.executescript("BEGIN IMMEDIATE;\n" + migration.read_text(encoding="utf-8") + "\nCOMMIT;")
        self.seed()

    def seed(self):
        seed = json.loads(Path(__file__).with_name("seed.json").read_text(encoding="utf-8"))
        with self.connect(write=True) as conn:
            if conn.execute("SELECT 1 FROM exams WHERE id = ?", (seed["examId"],)).fetchone():
                return
            conn.execute("INSERT INTO exams(id, title) VALUES (?, ?)", (seed["examId"], seed["title"]))
            for position, q in enumerate(seed["questions"], 1):
                conn.execute(
                    "INSERT INTO questions VALUES (?, ?, ?, ?, ?, ?)",
                    (q["id"], q["content"], q["questionType"], json.dumps(q["options"], ensure_ascii=False),
                     q["correctAnswer"], self.settings.question_seconds),
                )
                conn.execute("INSERT INTO exam_questions VALUES (?, ?, ?)", (seed["examId"], position, q["id"]))


if __name__ == "__main__":
    settings = Settings()
    Database(settings).initialize()
    print(f"Database initialized: {settings.database_path}")
