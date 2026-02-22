"""
pipelines/extract.py — Pipeline A
PyMuPDF → extract pages (text) + tables (HTML) + metadata → SQLite
Updates job extract_status as it progresses.
"""

from __future__ import annotations

import io
import json

import fitz  # PyMuPDF

from database import (
    insert_pages,
    insert_tables,
    update_document_stats,
    update_job_status,
)


def _chunk_text_for_word_count(text: str) -> int:
    return len(text.split())


async def run_extract_pipeline(job_id: str, doc_id: str, pdf_bytes: bytes) -> None:
    """
    Pipeline A: extract structured data from PDF into SQLite.
    """
    try:
        await update_job_status(job_id, extract_status="running")

        doc = fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")

        # ------------------------------------------------------------------- #
        # Extract PDF-level metadata
        # ------------------------------------------------------------------- #
        raw_meta = doc.metadata or {}
        metadata = {
            "title": raw_meta.get("title", ""),
            "author": raw_meta.get("author", ""),
            "subject": raw_meta.get("subject", ""),
            "creator": raw_meta.get("creator", ""),
            "producer": raw_meta.get("producer", ""),
            "creation_date": raw_meta.get("creationDate", ""),
            "mod_date": raw_meta.get("modDate", ""),
            "page_count": doc.page_count,
        }

        pages_to_insert: list[dict] = []
        tables_to_insert: list[dict] = []
        total_words = 0

        for page_num, page in enumerate(doc, start=1):
            # ---------------------------------------------------------------- #
            # Page text
            # ---------------------------------------------------------------- #
            text = page.get_text("text")
            pages_to_insert.append({"page_num": page_num, "text": text})
            total_words += _chunk_text_for_word_count(text)

            # ---------------------------------------------------------------- #
            # Tables (via PyMuPDF table finder)
            # ---------------------------------------------------------------- #
            try:
                table_finder = page.find_tables()
                for table in table_finder.tables:
                    df = table.to_pandas()
                    html = df.to_html(index=False, border=0, classes="extracted-table")
                    tables_to_insert.append({"page_num": page_num, "html": html})
            except Exception:
                # Table extraction is best-effort
                pass

        doc.close()

        # ------------------------------------------------------------------- #
        # Persist to SQLite
        # ------------------------------------------------------------------- #
        await insert_pages(doc_id, pages_to_insert)
        if tables_to_insert:
            await insert_tables(doc_id, tables_to_insert)
        await update_document_stats(doc_id, len(pages_to_insert), total_words, metadata)

        await update_job_status(job_id, extract_status="done")

    except Exception as exc:
        await update_job_status(
            job_id,
            extract_status="error",
            extract_error=str(exc)[:1000],
        )
        raise
