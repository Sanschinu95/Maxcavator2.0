"""
pipelines/rag.py — Pipeline B

Chunks section content (NOT raw pages) at 600 chars / 100 overlap,
embeds via MiniLM, and upserts to ChromaDB collection doc-{doc_id}.
Updates job rag_status / rag_progress as it goes.
"""

from __future__ import annotations

import asyncio
from functools import partial

from config import CHUNK_SIZE, CHUNK_OVERLAP
from database import get_document, update_job
from vector_store import upsert_chunks, get_or_create_doc_collection


def _sliding_chunks(text: str, section_idx: int, doc_id: str, page: int) -> list[dict]:
    """Split section content into overlapping chunks."""
    chunks: list[dict] = []
    text = text.strip()
    if not text:
        return chunks

    start     = 0
    chunk_idx = 0
    while start < len(text):
        end        = start + CHUNK_SIZE
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunk_id = f"{doc_id}_s{section_idx}_c{chunk_idx}"
            chunks.append({
                "chunk_id":     chunk_id,
                "text":         chunk_text,
                "page_num":     page,
                "section_idx":  section_idx,
                "chunk_index":  chunk_idx,
            })
            chunk_idx += 1
        start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


def _build_all_chunks(doc: dict) -> list[dict]:
    all_chunks: list[dict] = []
    doc_id   = doc["document_id"]
    sections = doc.get("sections", [])

    for si, section in enumerate(sections):
        content = section.get("content", "")
        # Prepend heading to each chunk for semantic richness
        heading = section.get("heading", "")
        if heading and content:
            full_text = f"{heading}\n\n{content}"
        else:
            full_text = content or heading
        page = section.get("page_start", 1)
        chunks = _sliding_chunks(full_text, si, doc_id, page)
        all_chunks.extend(chunks)

    return all_chunks


async def run_rag_pipeline(job_id: str, doc_id: str, _pdf_bytes: bytes = b"", **_kwargs) -> None:
    """
    Pipeline B: read structured sections from MongoDB → chunk → embed → upsert.
    We wait for the extract pipeline to finish writing the schema before proceeding.
    """
    try:
        update_job(job_id, rag_status="running", rag_progress=5)

        loop = asyncio.get_event_loop()

        # Wait until extract pipeline has saved the document schema
        max_wait_s = 300  # 5 minutes
        waited     = 0
        doc        = None
        while waited < max_wait_s:
            d = await loop.run_in_executor(None, partial(get_document, doc_id))
            if d and d.get("sections"):
                doc = d
                break
            await asyncio.sleep(2)
            waited += 2

        if not doc:
            raise RuntimeError("Extract pipeline did not finish in time or produced no sections.")

        update_job(job_id, rag_progress=20)

        # Build chunks from section content
        all_chunks = await loop.run_in_executor(None, partial(_build_all_chunks, doc))

        update_job(job_id, rag_progress=40)

        if not all_chunks:
            update_job(job_id, rag_status="done", rag_progress=100)
            return

        # Upsert to per-document ChromaDB collection in batches of 64
        BATCH = 64
        total = len(all_chunks)
        for i in range(0, total, BATCH):
            batch = all_chunks[i : i + BATCH]
            await loop.run_in_executor(
                None,
                partial(upsert_chunks, doc_id, batch)
            )
            progress = 40 + int((i + len(batch)) / total * 55)
            update_job(job_id, rag_progress=progress)

        update_job(job_id, rag_status="done", rag_progress=100)

    except Exception as exc:
        update_job(job_id, rag_status="error", rag_progress=0)
        from database import get_db
        db = get_db()
        db.jobs.update_one(
            {"job_id": job_id},
            {"$push": {"errors": {"pipeline": "rag", "error": str(exc)[:1000]}}},
        )
        raise
