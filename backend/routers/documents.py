"""
routers/documents.py — GET /documents, DELETE /documents/{doc_id}
"""

from fastapi import APIRouter, HTTPException

from database import get_all_documents, delete_document
from vector_store import delete_document_chunks

router = APIRouter(tags=["documents"])


@router.get("/documents")
async def list_documents():
    docs = await get_all_documents()
    return {"documents": docs}


@router.delete("/documents/{doc_id}")
async def remove_document(doc_id: str):
    docs = await get_all_documents()
    exists = any(d["id"] == doc_id for d in docs)
    if not exists:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Remove chunks from ChromaDB (best-effort — don't fail if already gone)
    try:
        delete_document_chunks(doc_id)
    except Exception:
        pass

    # Remove from SQLite (cascades to pages, doc_tables, jobs)
    await delete_document(doc_id)

    return {"deleted": doc_id}
