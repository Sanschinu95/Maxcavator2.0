"""
routers/documents.py — GET /documents, DELETE /documents/{doc_id}
"""

from fastapi import APIRouter, HTTPException

import os
from database import async_get_all_documents, async_delete_document, async_get_document
from vector_store import delete_document_chunks
from config import PDFS_DIR

router = APIRouter(tags=["documents"])


@router.get("/documents")
async def list_documents():
    docs = await async_get_all_documents()
    return {"documents": docs}


@router.delete("/documents/{doc_id}")
async def remove_document(doc_id: str):
    doc = await async_get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Remove per-doc ChromaDB collection
    try:
        delete_document_chunks(doc_id)
    except Exception:
        pass

    # Remove PDF file
    pdf_path = PDFS_DIR / f"{doc_id}.pdf"
    if pdf_path.exists():
        try:
            os.remove(pdf_path)
        except Exception:
            pass

    # Remove from MongoDB (document + jobs records)
    await async_delete_document(doc_id)

    return {"deleted": doc_id}
