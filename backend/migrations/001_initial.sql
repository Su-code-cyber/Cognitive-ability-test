CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE auth_sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    access_hash TEXT NOT NULL UNIQUE,
    refresh_hash TEXT NOT NULL UNIQUE,
    access_expires_at REAL NOT NULL,
    refresh_expires_at REAL NOT NULL
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);
CREATE TABLE questions (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    question_type INTEGER NOT NULL CHECK (question_type IN (0, 1)),
    options_json TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    time_limit_seconds INTEGER NOT NULL CHECK (time_limit_seconds > 0)
);
CREATE TABLE exam_questions (
    exam_id TEXT NOT NULL REFERENCES exams(id),
    position INTEGER NOT NULL CHECK (position > 0),
    question_id TEXT NOT NULL REFERENCES questions(id),
    PRIMARY KEY (exam_id, position),
    UNIQUE (exam_id, question_id)
);
CREATE TABLE exam_sessions (
    session_code TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    exam_id TEXT NOT NULL REFERENCES exams(id),
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
    current_index INTEGER NOT NULL DEFAULT 1,
    started_at REAL NOT NULL,
    question_started_at REAL NOT NULL,
    finished_at REAL,
    finish_reason TEXT CHECK (finish_reason IN ('normal', 'early')),
    UNIQUE (user_id, exam_id)
);
CREATE TABLE session_questions (
    session_code TEXT NOT NULL REFERENCES exam_sessions(session_code),
    position INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    PRIMARY KEY (session_code, position),
    UNIQUE (session_code, question_id)
);
CREATE TABLE answers (
    session_code TEXT NOT NULL,
    question_index INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    answer TEXT NOT NULL,
    submitted_at REAL NOT NULL,
    timed_out INTEGER NOT NULL CHECK (timed_out IN (0, 1)),
    is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
    PRIMARY KEY (session_code, question_index),
    FOREIGN KEY (session_code, question_index) REFERENCES session_questions(session_code, position)
);
INSERT INTO schema_migrations(version) VALUES (1);
