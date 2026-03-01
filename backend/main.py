"""
main.py — FastAPI application entry point for Maxcavator 2.0
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import IMAGES_DIR, PDFS_DIR
from database import init_db
from vector_store import init_vector_store
from routers.ingest import router as ingest_router
from routers.documents import router as documents_router
from routers.dataview import router as dataview_router
from routers.chat import router as chat_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    init_vector_store()
    yield
    # Shutdown — nothing to clean up


app = FastAPI(
    title="Maxcavator 2.0 API",
    version="2.0.0",
    description="Intelligent PDF data extraction and RAG system backed by MongoDB.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve extracted images statically
app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")
# Serve original PDFs statically
app.mount("/pdfs", StaticFiles(directory=str(PDFS_DIR)), name="pdfs")

app.include_router(ingest_router)
app.include_router(documents_router)
app.include_router(dataview_router)
app.include_router(chat_router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
