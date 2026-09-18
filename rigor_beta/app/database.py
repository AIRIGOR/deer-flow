from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS testers (
    tester_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    session_hash TEXT PRIMARY KEY,
    tester_id TEXT NOT NULL REFERENCES testers(tester_id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    workspace_id TEXT PRIMARY KEY,
    tester_id TEXT NOT NULL UNIQUE REFERENCES testers(tester_id) ON DELETE CASCADE,
    current_session INTEGER NOT NULL DEFAULT 1,
    completed_sessions TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shows (
    show_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    show_name TEXT NOT NULL,
    artist TEXT NOT NULL,
    venue TEXT NOT NULL,
    city TEXT NOT NULL,
    show_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PREPRODUCTION'
);

CREATE TABLE IF NOT EXISTS documents (
    document_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    status TEXT NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    source_kind TEXT NOT NULL DEFAULT 'DEMO',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requirements (
    requirement_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    department TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    status TEXT NOT NULL,
    owner TEXT,
    due_at TEXT,
    document_name TEXT NOT NULL,
    page_number INTEGER,
    excerpt TEXT NOT NULL,
    source_kind TEXT NOT NULL DEFAULT 'DEMO'
);

CREATE TABLE IF NOT EXISTS conflicts (
    conflict_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    department TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,
    left_value TEXT NOT NULL,
    right_value TEXT NOT NULL,
    left_source TEXT NOT NULL,
    right_source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    resolution TEXT,
    owner TEXT,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    department TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
    incident_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    department TEXT NOT NULL,
    summary TEXT NOT NULL,
    severity TEXT NOT NULL,
    resolution TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
    feedback_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    session_number INTEGER NOT NULL,
    useful_score INTEGER NOT NULL,
    trust_score INTEGER NOT NULL,
    comments TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
    event_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requirements_workspace
ON requirements(workspace_id, department, status);

CREATE INDEX IF NOT EXISTS idx_conflicts_workspace
ON conflicts(workspace_id, status, severity);
"""


class Database:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA)

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def rows(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self.connect() as connection:
            return [dict(row) for row in connection.execute(query, params).fetchall()]

    def row(self, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self.connect() as connection:
            result = connection.execute(query, params).fetchone()
            return dict(result) if result else None

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> None:
        with self.connect() as connection:
            connection.execute(query, params)

    def log(self, workspace_id: str, event_id: str, event_type: str, payload: dict[str, Any], created_at: str) -> None:
        self.execute(
            "INSERT INTO activity_log VALUES (?, ?, ?, ?, ?)",
            (event_id, workspace_id, event_type, json.dumps(payload), created_at),
        )

