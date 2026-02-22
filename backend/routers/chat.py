"""
routers/chat.py — POST /chat  (SSE stream)

Uses Groq SDK (OpenAI-compatible) with llama-3.3-70b-versatile.

SSE event sequence:
  data: {"type":"token","content":"..."}   — repeated for each token
  data: {"type":"sources","content":[...]} — one event with all source chunks
  data: {"type":"done"}                    — final terminator
  data: {"type":"error","content":"..."}   — on failure
"""

from __future__ import annotations

import json
from typing import AsyncGenerator

from groq import Groq
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import GROQ_API_KEY, GROQ_MODEL, TOP_K_CHUNKS
from database import get_all_documents
from vector_store import query_chunks

router = APIRouter(tags=["chat"])

# Single Groq client instance
_client = Groq(api_key=GROQ_API_KEY)

SYSTEM_PROMPT = """You are Maxcavator, an expert document analysis assistant.

Rules:
1. Answer ONLY using information from the provided context chunks.
2. When citing information, mention the page number (e.g., "According to page 3...").
3. If the answer is not found in the provided context, say: "I could not find that information in the provided document."
4. Be concise, precise, and analytical. Use markdown formatting where helpful.
5. Never fabricate information not present in the context.
"""


class ChatMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    query: str
    doc_id: str | None = None
    history: list[ChatMessage] = []


def _build_context_block(chunks: list[dict]) -> str:
    if not chunks:
        return "No relevant context found in the document."
    parts = []
    for i, chunk in enumerate(chunks, start=1):
        parts.append(f"[Context {i} — Page {chunk['page_num']}]\n{chunk['text']}")
    return "\n\n".join(parts)


def _build_messages(request: ChatRequest, chunks: list[dict]) -> list[dict]:
    """
    Build OpenAI-style messages list for Groq:
    system → [history turns] → user (current query with context)
    """
    context_block = _build_context_block(chunks)

    # System message with RAG rules
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]

    # Last 6 turns of history (12 messages max)
    recent_history = list(request.history)[-12:]
    for msg in recent_history:
        role = "user" if msg.role == "user" else "assistant"
        messages.append({"role": role, "content": msg.content})

    # Current user query, with context appended
    user_content = (
        f"{request.query}\n\n"
        f"--- RETRIEVED DOCUMENT CONTEXT ---\n{context_block}"
    )
    messages.append({"role": "user", "content": user_content})

    return messages


async def _stream_sse(request: ChatRequest) -> AsyncGenerator[str, None]:
    def _event(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    try:
        # ------------------------------------------------------------------- #
        # Validate doc + rag_status if doc_id provided
        # ------------------------------------------------------------------- #
        if request.doc_id:
            docs = await get_all_documents()
            doc_row = next((d for d in docs if d["id"] == request.doc_id), None)
            if not doc_row:
                yield _event({"type": "error", "content": "Document not found."})
                yield _event({"type": "done"})
                return
            if doc_row.get("rag_status") != "done":
                status = doc_row.get("rag_status", "unknown")
                yield _event({
                    "type": "error",
                    "content": (
                        f"The RAG pipeline for this document is still '{status}'. "
                        "Please wait until it finishes before chatting."
                    ),
                })
                yield _event({"type": "done"})
                return

        # ------------------------------------------------------------------- #
        # Retrieve relevant chunks from ChromaDB
        # ------------------------------------------------------------------- #
        chunks = query_chunks(
            query=request.query,
            doc_id=request.doc_id,
            n_results=TOP_K_CHUNKS,
        )

        # ------------------------------------------------------------------- #
        # Call Groq with streaming
        # ------------------------------------------------------------------- #
        messages = _build_messages(request, chunks)

        stream = _client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            temperature=0.2,
            max_tokens=2048,
            stream=True,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta
            text = delta.content or ""
            if text:
                yield _event({"type": "token", "content": text})

        # ------------------------------------------------------------------- #
        # Emit sources then done
        # ------------------------------------------------------------------- #
        yield _event({"type": "sources", "content": chunks})
        yield _event({"type": "done"})

    except Exception as exc:
        yield _event({"type": "error", "content": str(exc)})
        yield _event({"type": "done"})


@router.post("/chat")
async def chat(request: ChatRequest):
    return StreamingResponse(
        _stream_sse(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
