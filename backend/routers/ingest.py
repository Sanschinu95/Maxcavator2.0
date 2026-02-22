"""
routers/ingest.py — POST /ingest, GET /status/{job_id}
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from config import UPLOADS_DIR
from database import insert_document, insert_job, get_job
from pipelines.extract import run_extract_pipeline
from pipelines.rag import run_rag_pipeline

router = APIRouter(tags=["ingest"])


# --------------------------------------------------------------------------- #
# Background task runner
# --------------------------------------------------------------------------- #
async def _run_both_pipelines(job_id: str, doc_id: str, pdf_bytes: bytes) -> None:
    """
    Run Pipeline A and Pipeline B in parallel.
    Each pipeline independently updates its own status column.
    If one fails, the other continues unaffected.
    """
    await asyncio.gather(
        run_extract_pipeline(job_id, doc_id, pdf_bytes),
        run_rag_pipeline(job_id, doc_id, pdf_bytes),
        return_exceptions=True,  # don't cancel the sibling on failure
    )


# --------------------------------------------------------------------------- #
# POST /ingest
# --------------------------------------------------------------------------- #
@router.post("/ingest")
async def ingest(
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(default=None),
    url: str | None = Form(default=None),
):
    """
    Accept either a file upload or a JSON body with {url}.
    Creates a document + job, then fires both pipelines as a background task.
    """
    if file is None and not url:
        raise HTTPException(status_code=400, detail="Provide either a PDF file or a URL.")

    doc_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    if file is not None:
        # ------------------------------------------------------------------- #
        # File upload path
        # ------------------------------------------------------------------- #
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

        pdf_bytes = await file.read()
        filename = file.filename or "upload.pdf"

        await insert_document(doc_id, filename, source_url=None)

    else:
        # ------------------------------------------------------------------- #
        # URL download path
        # ------------------------------------------------------------------- #
        url = url.strip()
        filename = url.split("/")[-1].split("?")[0] or "downloaded.pdf"
        if not filename.lower().endswith(".pdf"):
            filename += ".pdf"

        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                pdf_bytes = resp.content
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to download PDF: {exc}")

        if pdf_bytes[:4] != b"%PDF":
            raise HTTPException(status_code=422, detail="URL did not return a valid PDF.")

        await insert_document(doc_id, filename, source_url=url)

    await insert_job(job_id, doc_id)

    # Fire both pipelines in the background
    background_tasks.add_task(_run_both_pipelines, job_id, doc_id, pdf_bytes)

    return JSONResponse(
        status_code=202,
        content={"job_id": job_id, "doc_id": doc_id, "filename": filename},
    )


# --------------------------------------------------------------------------- #
# GET /status/{job_id}
# --------------------------------------------------------------------------- #
@router.get("/status/{job_id}")
async def get_status(job_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job
