"""
pipelines/rag.py — Pipeline B

Chunks section content (NOT raw pages) at 600 chars / 100 overlap,
embeds via MiniLM, and upserts to ChromaDB collection doc-{doc_id}.
Updates job rag_status / rag_progress as it goes.

Also computes bounding box coordinates for each chunk via PyMuPDF
page.search_for() for PDF citation highlighting.
"""

from __future__ import annotations

import asyncio
import io
from functools import partial

import fitz  # PyMuPDF

from config import CHUNK_SIZE, CHUNK_OVERLAP
from database import get_document, update_job
from vector_store import upsert_chunks, get_or_create_doc_collection


def _compute_bbox(fitz_doc: fitz.Document | None, page_num: int, chunk_text: str) -> list[float] | None:
    """Use PyMuPDF search_for to find approximate bounding rect of chunk text on its page."""
    if fitz_doc is None or not chunk_text:
        return None
    page_idx = page_num - 1
    if page_idx < 0 or page_idx >= fitz_doc.page_count:
        return None

    page = fitz_doc[page_idx]
    # Search for first ~80 chars of the chunk
    search_text = chunk_text[:80].strip()
    if not search_text:
        return None

    try:
        rects = page.search_for(search_text)
    except Exception:
        return None

    if not rects:
        # Try shorter snippet
        try:
            rects = page.search_for(chunk_text[:40].strip())
        except Exception:
            return None

    if not rects:
        return None

    # Union all hit rectangles
    union = rects[0]
    for r in rects[1:]:
        union = union | r  # fitz.Rect union operator

    return [round(union.x0, 2), round(union.y0, 2), round(union.x1, 2), round(union.y1, 2)]


def _sliding_chunks(text: str, section_idx: int, doc_id: str, page: int,
                    fitz_doc: fitz.Document | None = None) -> list[dict]:
    """Split section content into overlapping chunks with optional bbox."""
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

            bbox = _compute_bbox(fitz_doc, page, chunk_text)

            chunks.append({
                "chunk_id":      chunk_id,
                "text":          chunk_text,
                "page_num":      page,
                "section_idx":   section_idx,
                "chunk_index":   chunk_idx,
                "bbox":          bbox,
                "chunk_preview": chunk_text[:80],
            })
            chunk_idx += 1
        start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


def _build_all_chunks(doc: dict, pdf_bytes: bytes = b"") -> list[dict]:
    all_chunks: list[dict] = []
    doc_id   = doc["document_id"]
    sections = doc.get("sections", [])

    # Open PDF for bbox computation if bytes available
    fitz_doc = None
    if pdf_bytes:
        try:
            fitz_doc = fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")
        except Exception:
            fitz_doc = None

    for si, section in enumerate(sections):
        content = section.get("content", "")
        heading = section.get("heading", "")
        if heading and content:
            full_text = f"{heading}\n\n{content}"
        else:
            full_text = content or heading
        page = section.get("page_start", 1)
        chunks = _sliding_chunks(full_text, si, doc_id, page, fitz_doc)
        all_chunks.extend(chunks)

    if fitz_doc:
        fitz_doc.close()

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

        # Build chunks from section content (with bbox from PDF)
        all_chunks = await loop.run_in_executor(None, partial(_build_all_chunks, doc, _pdf_bytes))

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
