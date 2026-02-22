"""
pipelines/rag.py — Pipeline B
PyMuPDF → chunk text (600 chars / 100 overlap) → embed via MiniLM → upsert to ChromaDB
Updates job rag_status as it progresses.
"""

from __future__ import annotations

import io

import fitz  # PyMuPDF

from config import CHUNK_SIZE, CHUNK_OVERLAP
from database import update_job_status
from vector_store import upsert_chunks


def _sliding_window_chunks(text: str, page_num: int, doc_id: str, page_chunk_offset: int) -> list[dict]:
    """
    Split text into overlapping chunks of CHUNK_SIZE chars with CHUNK_OVERLAP.
    Returns a list of chunk dicts.
    """
    chunks = []
    start = 0
    idx = page_chunk_offset
    text = text.strip()
    if not text:
        return chunks

    while start < len(text):
        end = start + CHUNK_SIZE
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunk_id = f"{doc_id}_p{page_num}_c{idx}"
            chunks.append(
                {
                    "chunk_id": chunk_id,
                    "text": chunk_text,
                    "page_num": page_num,
                    "chunk_index": idx,
                }
            )
            idx += 1
        start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


async def run_rag_pipeline(job_id: str, doc_id: str, pdf_bytes: bytes) -> None:
    """
    Pipeline B: chunk + embed + upsert to ChromaDB.
    """
    try:
        await update_job_status(job_id, rag_status="running")

        doc = fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")

        all_chunks: list[dict] = []
        global_chunk_idx = 0

        for page_num, page in enumerate(doc, start=1):
            text = page.get_text("text")
            chunks = _sliding_window_chunks(text, page_num, doc_id, global_chunk_idx)
            all_chunks.extend(chunks)
            global_chunk_idx += len(chunks)

        doc.close()

        # Upsert in batches of 64 to keep memory usage bounded
        BATCH_SIZE = 64
        for i in range(0, len(all_chunks), BATCH_SIZE):
            batch = all_chunks[i : i + BATCH_SIZE]
            upsert_chunks(doc_id, batch)

        await update_job_status(job_id, rag_status="done")

    except Exception as exc:
        await update_job_status(
            job_id,
            rag_status="error",
            rag_error=str(exc)[:1000],
        )
        raise
