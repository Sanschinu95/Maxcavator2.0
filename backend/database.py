"""
database.py — async SQLite helpers via aiosqlite.

Schema
------
documents   — one row per ingested PDF
jobs        — one row per ingest job (links to a document)
pages       — one row per page of extracted text
doc_tables  — one row per extracted table (HTML string)
"""

from __future__ import annotations

import json
import time
from typing import Any

import aiosqlite

from config import SQLITE_PATH

# --------------------------------------------------------------------------- #
# DDL
# --------------------------------------------------------------------------- #
_DDL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS documents (
    id          TEXT    PRIMARY KEY,
    filename    TEXT    NOT NULL,
    source_url  TEXT,
    page_count  INTEGER DEFAULT 0,
    word_count  INTEGER DEFAULT 0,
    metadata    TEXT    DEFAULT '{}',
    created_at  REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT    PRIMARY KEY,
    doc_id          TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    extract_status  TEXT    NOT NULL DEFAULT 'pending',
    rag_status      TEXT    NOT NULL DEFAULT 'pending',
    extract_error   TEXT,
    rag_error       TEXT,
    created_at      REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id      TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_num    INTEGER NOT NULL,
    text        TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_tables (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id      TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_num    INTEGER NOT NULL,
    html        TEXT    NOT NULL
);
"""


async def init_db() -> None:
    """Create all tables on startup."""
    async with aiosqlite.connect(SQLITE_PATH) as db:
        await db.executescript(_DDL)
        await db.commit()


# --------------------------------------------------------------------------- #
# Document helpers
# --------------------------------------------------------------------------- #
async def insert_document(doc_id: str, filename: str, source_url: str | None = None) -> None:
    async with aiosqlite.connect(SQLITE_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO documents (id, filename, source_url, created_at) VALUES (?,?,?,?)",
            (doc_id, filename, source_url, time.time()),
        )
        await db.commit()


async def update_document_stats(doc_id: str, page_count: int, word_count: int, metadata: dict) -> None:
    async with aiosqlite.connect(SQLITE_PATH) as db:
        await db.execute(
            "UPDATE documents SET page_count=?, word_count=?, metadata=? WHERE id=?",
            (page_count, word_count, json.dumps(metadata), doc_id),
        )
        await db.commit()


async def get_all_documents() -> list[dict]:
    async with aiosqlite.connect(SQLITE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT d.*, j.id AS job_id, j.extract_status, j.rag_status,
                   j.extract_error, j.rag_error
            FROM documents d
            LEFT JOIN jobs j ON j.doc_id = d.id
            ORDER BY d.created_at DESC
            """
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_document(doc_id: str) -> dict | None:
    async with aiosqlite.connect(SQLITE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM documents WHERE id=?", (doc_id,)) as cur:
            row = await cur.fetchone()
    return dict(row) if row else None


async def delete_document(doc_id: str) -> None:
    async with aiosqlite.connect(SQLITE_PATH) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("DELETE FROM documents WHERE id=?", (doc_id,))
        await db.commit()


# --------------------------------------------------------------------------- #
# Job helpers
# --------------------------------------------------------------------------- #
async def insert_job(job_id: str, doc_id: str) -> None:
    async with aiosqlite.connect(SQLITE_PATH) as db:
        await db.execute(
            "INSERT INTO jobs (id, doc_id, created_at) VALUES (?,?,?)",
            (job_id, doc_id, time.time()),
        )
        await db.commit()


async def update_job_status(
    job_id: str,
    *,
    extract_status: str | None = None,
    rag_status: str | None = None,
    extract_error: str | None = None,
    rag_error: str | None = None,
) -> None:
    updates: list[tuple[str, Any]] = []
    if extract_status is not None:
        updates.append(("extract_status", extract_status))
    if rag_status is not None:
        updates.append(("rag_status", rag_status))
    if extract_error is not None:
        updates.append(("extract_error", extract_error))
    if rag_error is not None:
        updates.append(("rag_error", rag_error))
    if not updates:
        return
    set_clause = ", ".join(f"{col}=?" for col, _ in updates)
    values = [v for _, v in updates] + [job_id]
    async with aiosqlite.connect(SQLITE_PATH) as db:
        await db.execute(f"UPDATE jobs SET {set_clause} WHERE id=?", values)
        await db.commit()


async def get_job(job_id: str) -> dict | None:
    async with aiosqlite.connect(SQLITE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)) as cur:
            row = await cur.fetchone()
    return dict(row) if row else None


# --------------------------------------------------------------------------- #
# Page helpers
# --------------------------------------------------------------------------- #
async def insert_pages(doc_id: str, pages: list[dict]) -> None:
    """pages: list of {page_num, text}"""
    async with aiosqlite.connect(SQLITE_PATH) as db:
        await db.executemany(
            "INSERT INTO pages (doc_id, page_num, text) VALUES (?,?,?)",
            [(doc_id, p["page_num"], p["text"]) for p in pages],
        )
        await db.commit()


async def get_page(doc_id: str, page_num: int) -> dict | None:
    async with aiosqlite.connect(SQLITE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM pages WHERE doc_id=? AND page_num=?", (doc_id, page_num)
        ) as cur:
            row = await cur.fetchone()
    return dict(row) if row else None


async def get_page_count(doc_id: str) -> int:
    async with aiosqlite.connect(SQLITE_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM pages WHERE doc_id=?", (doc_id,)
        ) as cur:
            row = await cur.fetchone()
    return row[0] if row else 0


# --------------------------------------------------------------------------- #
# Table helpers
# --------------------------------------------------------------------------- #
async def insert_tables(doc_id: str, tables: list[dict]) -> None:
    """tables: list of {page_num, html}"""
    async with aiosqlite.connect(SQLITE_PATH) as db:
        await db.executemany(
            "INSERT INTO doc_tables (doc_id, page_num, html) VALUES (?,?,?)",
            [(doc_id, t["page_num"], t["html"]) for t in tables],
        )
        await db.commit()


async def get_tables(doc_id: str) -> list[dict]:
    async with aiosqlite.connect(SQLITE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM doc_tables WHERE doc_id=? ORDER BY page_num", (doc_id,)
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_metadata(doc_id: str) -> dict | None:
    import json as _json
    doc = await get_document(doc_id)
    if not doc:
        return None
    raw = doc.get("metadata", "{}")
    try:
        return _json.loads(raw)
    except Exception:
        return {}
