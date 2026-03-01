"""
pipelines/extract.py — Pipeline A

Calls the structurer to build the full document schema,
then saves it to MongoDB and updates job progress.
"""

from __future__ import annotations

import asyncio
from functools import partial
from pathlib import Path

from config import IMAGES_DIR
from database import save_full_schema, update_job
from pipelines.structurer import structure_document


async def run_extract_pipeline(job_id: str, doc_id: str, pdf_bytes: bytes, filename: str = "", source_url: str | None = None) -> None:
    """
    Pipeline A: structure PDF → save full schema to MongoDB.
    Runs structurer in a thread pool to avoid blocking the event loop.
    """
    try:
        update_job(job_id, extract_status="running", extract_progress=5)

        loop = asyncio.get_event_loop()

        # Run the CPU-bound structurer in a thread pool
        schema = await loop.run_in_executor(
            None,
            partial(
                structure_document,
                doc_id,
                pdf_bytes,
                filename,
                source_url,
                Path(IMAGES_DIR),
            ),
        )

        update_job(job_id, extract_progress=80)

        # Save to MongoDB (also in executor to avoid blocking)
        await loop.run_in_executor(None, partial(save_full_schema, doc_id, schema))

        update_job(job_id, extract_status="done", extract_progress=100)

    except Exception as exc:
        update_job(
            job_id,
            extract_status="error",
            extract_progress=0,
        )
        # Append error to job errors list (best-effort, do not raise again just log)
        from database import get_db
        db = get_db()
        db.jobs.update_one(
            {"job_id": job_id},
            {"$push": {"errors": {"pipeline": "extract", "error": str(exc)[:1000]}}},
        )
        raise
