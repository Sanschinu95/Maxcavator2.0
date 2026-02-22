"""
vector_store.py — ChromaDB singleton for chunk upsert, query, and deletion.
"""

from __future__ import annotations

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

from config import CHROMA_DIR, CHROMA_COLLECTION, EMBEDDING_MODEL, TOP_K_CHUNKS

# --------------------------------------------------------------------------- #
# Singletons — initialized once at startup via init_vector_store()
# --------------------------------------------------------------------------- #
_client: chromadb.PersistentClient | None = None
_collection: chromadb.Collection | None = None
_embedder: SentenceTransformer | None = None


def init_vector_store() -> None:
    """Call once at FastAPI startup."""
    global _client, _collection, _embedder

    _client = chromadb.PersistentClient(
        path=str(CHROMA_DIR),
        settings=Settings(anonymized_telemetry=False),
    )
    _collection = _client.get_or_create_collection(
        name=CHROMA_COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )
    _embedder = SentenceTransformer(EMBEDDING_MODEL)


def _get_collection() -> chromadb.Collection:
    if _collection is None:
        raise RuntimeError("Vector store not initialized. Call init_vector_store() first.")
    return _collection


def _get_embedder() -> SentenceTransformer:
    if _embedder is None:
        raise RuntimeError("Embedder not initialized. Call init_vector_store() first.")
    return _embedder


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def embed_texts(texts: list[str]) -> list[list[float]]:
    embedder = _get_embedder()
    vecs = embedder.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    return vecs.tolist()


def upsert_chunks(doc_id: str, chunks: list[dict]) -> None:
    """
    chunks: list of {chunk_id, text, page_num, chunk_index}
    """
    if not chunks:
        return
    collection = _get_collection()
    texts = [c["text"] for c in chunks]
    embeddings = embed_texts(texts)
    ids = [c["chunk_id"] for c in chunks]
    metadatas = [
        {"doc_id": doc_id, "page_num": c["page_num"], "chunk_index": c["chunk_index"]}
        for c in chunks
    ]
    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
    )


def query_chunks(query: str, doc_id: str | None = None, n_results: int = TOP_K_CHUNKS) -> list[dict]:
    """
    Returns list of {text, page_num, chunk_index, distance} sorted by relevance.
    If doc_id is provided, filters to that document only.
    """
    collection = _get_collection()
    total = collection.count()
    if total == 0:
        return []

    query_embedding = embed_texts([query])[0]

    where = {"doc_id": doc_id} if doc_id else None
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, total),
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    chunks = []
    if results and results["ids"] and results["ids"][0]:
        for text, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            chunks.append(
                {
                    "text": text,
                    "page_num": meta.get("page_num", 0),
                    "chunk_index": meta.get("chunk_index", 0),
                    "distance": round(dist, 4),
                }
            )
    return chunks


def delete_document_chunks(doc_id: str) -> None:
    """Remove all chunks for a document from ChromaDB."""
    collection = _get_collection()
    results = collection.get(where={"doc_id": doc_id}, include=[])
    if results and results["ids"]:
        collection.delete(ids=results["ids"])
