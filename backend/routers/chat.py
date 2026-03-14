"""
routers/chat.py — POST /chat

RAG chat endpoint using Groq (llama-3.3-70b-versatile) with SSE streaming.

Request body:
  { "query": str, "doc_id": str | null, "history": [{role, content}] }

SSE event types:
  { "type": "sources", "content": [...] }
  { "type": "token",   "content": "..." }
  { "type": "done"  }
  { "type": "error",   "content": "..." }
"""

from __future__ import annotations

import asyncio
import json
from functools import partial

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import GROQ_API_KEY, GROQ_MODEL, TOP_K_CHUNKS
from database import get_document
from vector_store import query_chunks

router = APIRouter(tags=["chat"])

# --------------------------------------------------------------------------- #
# Request schema
# --------------------------------------------------------------------------- #
class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    query: str
    doc_id: str | None = None
    history: list[Message] = []


# --------------------------------------------------------------------------- #
# SSE helpers
# --------------------------------------------------------------------------- #
def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


# --------------------------------------------------------------------------- #
# POST /chat
# --------------------------------------------------------------------------- #
@router.post("/chat")
async def chat(req: ChatRequest):
    return StreamingResponse(
        _stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def _stream(req: ChatRequest):
    try:
        # ── 1. Retrieve context chunks ─────────────────────────────────────
        loop = asyncio.get_event_loop()
        chunks = await loop.run_in_executor(
            None, partial(query_chunks, req.query, req.doc_id, TOP_K_CHUNKS)
        )

        # ── 2. Emit sources event first (with bbox for PDF highlighting) ────
        # Pre-fetch document for section headings
        doc_data = None
        if req.doc_id:
            doc_data = await loop.run_in_executor(
                None, partial(get_document, req.doc_id)
            )

        sources = []
        for c in chunks:
            section_heading = ""
            if c.get("section_idx") is not None:
                d = doc_data
                if not d and c.get("doc_id"):
                    d = await loop.run_in_executor(
                        None, partial(get_document, c["doc_id"])
                    )
                if d:
                    secs = d.get("sections", [])
                    idx = c.get("section_idx", 0)
                    if 0 <= idx < len(secs):
                        section_heading = secs[idx].get("heading", "")

            source_entry = {
                "text":            c["text"][:400],
                "doc_id":          c["doc_id"],
                "page_num":        c["page_num"],
                "section_idx":     c.get("section_idx"),
                "distance":        c.get("distance", 0.0),
                "bbox":            c.get("bbox"),
                "chunk_preview":   c.get("chunk_preview", ""),
                "section_heading": section_heading,
            }
            sources.append(source_entry)

        yield _sse({"type": "sources", "content": sources})

        # ── 3. Build context block ─────────────────────────────────────────
        ctx_parts = []
        for i, c in enumerate(chunks, 1):
            heading = ""
            if c.get("section_idx") is not None:
                d = doc_data
                if not d and c.get("doc_id"):
                    d = await loop.run_in_executor(
                        None, partial(get_document, c["doc_id"])
                    )
                if d:
                    secs = d.get("sections", [])
                    idx  = c.get("section_idx", 0)
                    if 0 <= idx < len(secs):
                        heading = secs[idx].get("heading", "")
            ctx_parts.append(
                f"[{i}] {f'({heading}) ' if heading else ''}Page {c['page_num']}:\n{c['text']}"
            )

        context_block = "\n\n---\n\n".join(ctx_parts)

        system_prompt = (
            "You are Maxcavator, an expert AI assistant specialising in analysing "
            "and answering questions about PDF documents. "
            "You have access to relevant excerpts from the document(s) below. "
            "Answer clearly and concisely, citing the excerpt numbers [1], [2] etc. "
            "when you reference them. If the context doesn't contain enough information, "
            "say so honestly rather than guessing.\n\n"
            f"--- DOCUMENT CONTEXT ---\n{context_block}\n--- END CONTEXT ---"
        )

        # ── 4. Build message list for Groq ────────────────────────────────
        messages = [{"role": "system", "content": system_prompt}]
        for m in req.history[-10:]:    # keep last 10 turns to stay within token limit
            messages.append({"role": m.role, "content": m.content})
        messages.append({"role": "user", "content": req.query})

        # ── 5. Stream from Groq ───────────────────────────────────────────
        from groq import Groq  # imported here to keep startup fast

        client = Groq(api_key=GROQ_API_KEY)

        def _groq_stream():
            return client.chat.completions.create(
                model=GROQ_MODEL,
                messages=messages,
                stream=True,
                temperature=0.35,
                max_tokens=2048,
            )

        stream = await loop.run_in_executor(None, _groq_stream)

        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield _sse({"type": "token", "content": delta.content})
                await asyncio.sleep(0)    # allow other coroutines to run

        yield _sse({"type": "done"})

    except Exception as exc:
        yield _sse({"type": "error", "content": str(exc)})
        yield _sse({"type": "done"})
