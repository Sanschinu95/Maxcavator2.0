"""
routers/dataview.py — GET /data/{doc_id}/pages, /tables, /metadata
"""

from fastapi import APIRouter, HTTPException, Query

from database import get_page, get_page_count, get_tables, get_metadata, get_document

router = APIRouter(prefix="/data", tags=["dataview"])


@router.get("/{doc_id}/pages")
async def get_pages(doc_id: str, page: int = Query(default=1, ge=1)):
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    total_pages = await get_page_count(doc_id)
    if total_pages == 0:
        raise HTTPException(status_code=404, detail="No pages extracted yet — extract pipeline may still be running.")

    if page > total_pages:
        raise HTTPException(status_code=404, detail=f"Page {page} out of range (total: {total_pages}).")

    page_data = await get_page(doc_id, page)
    if not page_data:
        raise HTTPException(status_code=404, detail=f"Page {page} not found.")

    return {
        "doc_id": doc_id,
        "page": page,
        "total_pages": total_pages,
        "text": page_data["text"],
    }


@router.get("/{doc_id}/tables")
async def get_doc_tables(doc_id: str):
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    tables = await get_tables(doc_id)
    return {"doc_id": doc_id, "tables": tables}


@router.get("/{doc_id}/metadata")
async def get_doc_metadata(doc_id: str):
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    import json
    raw_meta = doc.get("metadata", "{}")
    try:
        meta = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
    except Exception:
        meta = {}

    return {
        "doc_id": doc_id,
        "filename": doc["filename"],
        "source_url": doc.get("source_url"),
        "page_count": doc.get("page_count", 0),
        "word_count": doc.get("word_count", 0),
        "created_at": doc.get("created_at"),
        **meta,
    }
