"""
routers/dataview.py — Explore endpoints

GET /explore/{doc_id}/sections
GET /explore/{doc_id}/tables
GET /explore/{doc_id}/images
GET /explore/{doc_id}/links
GET /explore/{doc_id}/json
"""

from fastapi import APIRouter, HTTPException
from database import async_get_document

router = APIRouter(prefix="/explore", tags=["explore"])


async def _get_doc_or_404(doc_id: str) -> dict:
    doc = await async_get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


@router.get("/{doc_id}/sections")
async def get_sections(doc_id: str):
    doc = await _get_doc_or_404(doc_id)
    return {
        "doc_id":   doc_id,
        "title":    doc.get("metadata", {}).get("title", doc.get("filename", "")),
        "sections": doc.get("sections", []),
    }


@router.get("/{doc_id}/tables")
async def get_tables(doc_id: str):
    doc = await _get_doc_or_404(doc_id)
    return {
        "doc_id": doc_id,
        "tables": doc.get("tables", []),
    }


@router.get("/{doc_id}/images")
async def get_images(doc_id: str):
    doc = await _get_doc_or_404(doc_id)
    return {
        "doc_id": doc_id,
        "images": doc.get("images", []),
    }


@router.get("/{doc_id}/links")
async def get_links(doc_id: str):
    doc = await _get_doc_or_404(doc_id)
    return {
        "doc_id": doc_id,
        "links":  doc.get("links", []),
    }


@router.get("/{doc_id}/json")
async def get_full_json(doc_id: str):
    doc = await _get_doc_or_404(doc_id)
    # Exclude raw_pages from full json to keep response size manageable
    # but include everything else
    return doc
