"""
database.py — MongoDB helpers via pymongo (synchronous, called from asyncio
              via run_in_executor where needed, and directly in sync pipelines).

Collections
-----------
documents  — full nested document schema (one doc per ingested PDF)
jobs       — pipeline progress tracking
"""

from __future__ import annotations

import time
from typing import Any

import certifi
import pymongo
from pymongo import MongoClient
from pymongo.collection import Collection

from config import MONGODB_URI, MONGODB_DB

# --------------------------------------------------------------------------- #
# Singleton client
# --------------------------------------------------------------------------- #
_client: MongoClient | None = None
_db = None


def get_db():
    global _client, _db
    if _client is None:
        try:
            _client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5_000, tlsCAFile=certifi.where())
            _db = _client[MONGODB_DB]
            # Ensure indexes (will raise if unreachable — caught in init_db)
            _db.documents.create_index("document_id", unique=True)
            _db.jobs.create_index("job_id", unique=True)
            _db.jobs.create_index("doc_id")
        except Exception:
            _client = None
            _db = None
            raise
    return _db


# --------------------------------------------------------------------------- #
# Document helpers
# --------------------------------------------------------------------------- #
def insert_document_record(doc_id: str, filename: str, source_url: str | None = None) -> None:
    db = get_db()
    db.documents.insert_one({
        "document_id": doc_id,
        "filename": filename,
        "metadata": {
            "title": filename,
            "author": "",
            "year": "",
            "source_url": source_url or "",
            "page_count": 0,
            "word_count": 0,
            "ingested_at": time.time(),
        },
        "sections":  [],
        "tables":    [],
        "images":    [],
        "links":     [],
        "raw_pages": [],
    })


def save_full_schema(doc_id: str, schema: dict) -> None:
    """Replace a document's full extracted schema."""
    db = get_db()
    db.documents.update_one(
        {"document_id": doc_id},
        {"$set": schema},
    )


def get_all_documents() -> list[dict]:
    db = get_db()
    # Join with latest job for each document
    pipeline = [
        {"$lookup": {
            "from": "jobs",
            "localField": "document_id",
            "foreignField": "doc_id",
            "as": "job",
        }},
        {"$addFields": {"job": {"$arrayElemAt": ["$job", 0]}}},
        {"$sort": {"metadata.ingested_at": -1}},
    ]
    docs = list(db.documents.aggregate(pipeline))
    result = []
    for d in docs:
        d.pop("_id", None)
        if "job" in d and d["job"]:
            d["job"].pop("_id", None)
        result.append(d)
    return result


def get_document(doc_id: str) -> dict | None:
    db = get_db()
    doc = db.documents.find_one({"document_id": doc_id}, {"_id": 0})
    return doc


def delete_document(doc_id: str) -> None:
    db = get_db()
    db.documents.delete_one({"document_id": doc_id})
    db.jobs.delete_many({"doc_id": doc_id})


# --------------------------------------------------------------------------- #
# Job helpers
# --------------------------------------------------------------------------- #
def insert_job(job_id: str, doc_id: str) -> None:
    db = get_db()
    db.jobs.insert_one({
        "job_id": job_id,
        "doc_id": doc_id,
        "extract_status":   "pending",
        "extract_progress": 0,
        "rag_status":       "pending",
        "rag_progress":     0,
        "errors":           [],
        "created_at":       time.time(),
    })


def update_job(job_id: str, **fields) -> None:
    db = get_db()
    db.jobs.update_one({"job_id": job_id}, {"$set": fields})


def get_job(job_id: str) -> dict | None:
    db = get_db()
    job = db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    return job


# --------------------------------------------------------------------------- #
# Async wrappers (thin — pymongo is fast enough for our load; avoid motor dep)
# --------------------------------------------------------------------------- #
import asyncio
from functools import partial


async def async_insert_document_record(doc_id: str, filename: str, source_url: str | None = None) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, partial(insert_document_record, doc_id, filename, source_url))


async def async_insert_job(job_id: str, doc_id: str) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, partial(insert_job, job_id, doc_id))


async def async_get_job(job_id: str) -> dict | None:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(get_job, job_id))


async def async_get_all_documents() -> list[dict]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_all_documents)


async def async_get_document(doc_id: str) -> dict | None:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(get_document, doc_id))


async def async_delete_document(doc_id: str) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, partial(delete_document, doc_id))


def init_db() -> None:
    """
    Call once at startup to pre-create the MongoClient singleton and indexes.
    Catches connection errors so FastAPI can still start even if MongoDB isn't
    reachable yet — actual queries will raise at the point of use.
    """
    try:
        get_db()
        print("[Maxcavator] ✓ MongoDB connected and indexes created.")
    except Exception as exc:
        print(f"[Maxcavator] ⚠ MongoDB not reachable at startup: {exc}")
        print("[Maxcavator]   → Start MongoDB, then the server will auto-reconnect on first request.")
