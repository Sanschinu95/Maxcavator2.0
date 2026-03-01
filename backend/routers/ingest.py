"""
routers/ingest.py — POST /ingest, GET /status/{job_id}
"""

from __future__ import annotations

import asyncio
import uuid

import httpx
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from database import async_insert_document_record, async_insert_job, async_get_job
from pipelines.extract import run_extract_pipeline
from pipelines.rag import run_rag_pipeline
from config import PDFS_DIR

router = APIRouter(tags=["ingest"])


# --------------------------------------------------------------------------- #
# Background task runner — pipelines run in parallel
# --------------------------------------------------------------------------- #
async def _run_both_pipelines(
    job_id: str,
    doc_id: str,
    pdf_bytes: bytes,
    filename: str,
    source_url: str | None,
) -> None:
    """
    Pipeline A (extract) and Pipeline B (RAG) run concurrently.
    Pipeline B internally waits for A to write sections before chunking.
    """
    await asyncio.gather(
        run_extract_pipeline(job_id, doc_id, pdf_bytes, filename, source_url),
        run_rag_pipeline(job_id, doc_id),
        return_exceptions=True,
    )


# --------------------------------------------------------------------------- #
# POST /ingest
# --------------------------------------------------------------------------- #
@router.post("/ingest")
async def ingest(
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(default=None),
    url:  str        | None = Form(default=None),
):
    """Accept either a file upload or {url} form field. Returns job_id + doc_id."""
    if file is None and not url:
        raise HTTPException(status_code=400, detail="Provide either a PDF file or a URL.")

    doc_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    if file is not None:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
        pdf_bytes  = await file.read()
        filename   = file.filename or "upload.pdf"
        source_url = None
    else:
        url        = url.strip()
        filename   = url.split("/")[-1].split("?")[0] or "downloaded.pdf"
        if not filename.lower().endswith(".pdf"):
            filename += ".pdf"
        source_url = url
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                pdf_bytes = resp.content
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to download PDF: {exc}")
        if pdf_bytes[:4] != b"%PDF":
            raise HTTPException(status_code=422, detail="URL did not return a valid PDF.")

    await async_insert_document_record(doc_id, filename, source_url)
    await async_insert_job(job_id, doc_id)

    # Save PDF to disk
    pdf_path = PDFS_DIR / f"{doc_id}.pdf"
    with open(pdf_path, "wb") as f:
        f.write(pdf_bytes)

    background_tasks.add_task(
        _run_both_pipelines, job_id, doc_id, pdf_bytes, filename, source_url
    )

    return JSONResponse(
        status_code=202,
        content={"job_id": job_id, "doc_id": doc_id, "filename": filename},
    )


# --------------------------------------------------------------------------- #
# GET /status/{job_id}
# --------------------------------------------------------------------------- #
@router.get("/status/{job_id}")
async def get_status(job_id: str):
    job = await async_get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job
