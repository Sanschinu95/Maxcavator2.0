"""
main.py — FastAPI application entry point.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from vector_store import init_vector_store
from routers.ingest import router as ingest_router
from routers.documents import router as documents_router
from routers.dataview import router as dataview_router
from routers.chat import router as chat_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    init_vector_store()
    yield
    # Shutdown — nothing to clean up for now


app = FastAPI(
    title="Maxcavator API",
    version="1.0.0",
    description="PDF ingestion and RAG chatbot backend.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router)
app.include_router(documents_router)
app.include_router(dataview_router)
app.include_router(chat_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
