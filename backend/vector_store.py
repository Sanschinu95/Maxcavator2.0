"""
vector_store.py — ChromaDB singleton with per-document collections.

Each document gets its own ChromaDB collection: doc-{document_id}.
This is cleaner than filtering a global collection and enables true per-doc isolation.
"""

from __future__ import annotations

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

from config import CHROMA_DIR, EMBEDDING_MODEL, TOP_K_CHUNKS

# --------------------------------------------------------------------------- #
# Singletons
# --------------------------------------------------------------------------- #
_client:  chromadb.PersistentClient | None = None
_embedder: SentenceTransformer      | None = None


def init_vector_store() -> None:
    """Call once at FastAPI startup."""
    global _client, _embedder
    _client  = chromadb.PersistentClient(
        path=str(CHROMA_DIR),
        settings=Settings(anonymized_telemetry=False),
    )
    _embedder = SentenceTransformer(EMBEDDING_MODEL)


def _get_client() -> chromadb.PersistentClient:
    if _client is None:
        raise RuntimeError("Vector store not initialised. Call init_vector_store() first.")
    return _client


def _get_embedder() -> SentenceTransformer:
    if _embedder is None:
        raise RuntimeError("Embedder not initialised. Call init_vector_store() first.")
    return _embedder


# --------------------------------------------------------------------------- #
# Per-document collection management
# --------------------------------------------------------------------------- #
def _collection_name(doc_id: str) -> str:
    # ChromaDB collection names must be 3-63 chars, alphanumeric + dash/underscore
    safe = doc_id.replace("-", "_")[:50]
    return f"doc_{safe}"


def get_or_create_doc_collection(doc_id: str) -> chromadb.Collection:
    client = _get_client()
    return client.get_or_create_collection(
        name=_collection_name(doc_id),
        metadata={"hnsw:space": "cosine"},
    )


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def embed_texts(texts: list[str]) -> list[list[float]]:
    embedder = _get_embedder()
    vecs = embedder.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    return vecs.tolist()


def upsert_chunks(doc_id: str, chunks: list[dict]) -> None:
    """
    chunks: list of {chunk_id, text, page_num, section_idx, chunk_index}
    """
    if not chunks:
        return
    collection = get_or_create_doc_collection(doc_id)
    texts      = [c["text"]     for c in chunks]
    ids        = [c["chunk_id"] for c in chunks]
    embeddings = embed_texts(texts)
    metadatas  = [
        {
            "doc_id":     doc_id,
            "page_num":   c.get("page_num", 0),
            "section_idx": c.get("section_idx", 0),
            "chunk_index": c.get("chunk_index", 0),
        }
        for c in chunks
    ]
    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
    )


def query_chunks(
    query: str,
    doc_id: str | None = None,
    n_results: int = TOP_K_CHUNKS,
) -> list[dict]:
    """
    Returns list of {text, page_num, section_idx, distance} sorted by relevance.
    If doc_id provided, queries that document's dedicated collection.
    If no doc_id, queries all collections (cross-doc search).
    """
    client        = _get_client()
    query_vec     = embed_texts([query])[0]
    results_out:  list[dict] = []

    if doc_id:
        col_name = _collection_name(doc_id)
        try:
            col   = client.get_collection(col_name)
        except Exception:
            return []
        total = col.count()
        if total == 0:
            return []
        res = col.query(
            query_embeddings=[query_vec],
            n_results=min(n_results, total),
            include=["documents", "metadatas", "distances"],
        )
        _collect_results(col, res, results_out)
    else:
        # Query all doc collections and merge
        all_cols = client.list_collections()
        per_col  = max(2, n_results // max(len(all_cols), 1))
        for col_info in all_cols:
            try:
                col   = client.get_collection(col_info.name)
                total = col.count()
                if total == 0:
                    continue
                res = col.query(
                    query_embeddings=[query_vec],
                    n_results=min(per_col, total),
                    include=["documents", "metadatas", "distances"],
                )
                _collect_results(col, res, results_out)
            except Exception:
                continue
        # Sort by distance and trim
        results_out.sort(key=lambda x: x["distance"])
        results_out = results_out[:n_results]

    return results_out


def _collect_results(col: chromadb.Collection, res: dict, out: list[dict]) -> None:
    if not res or not res.get("ids") or not res["ids"][0]:
        return
    for c_id, text, meta, dist in zip(
        res["ids"][0],
        res["documents"][0],
        res["metadatas"][0],
        res["distances"][0],
    ):
        doc_id = meta.get("doc_id", "")
        sec_idx = meta.get("section_idx", 0)
        c_idx = meta.get("chunk_index", 0)

        prev_id = f"{doc_id}_s{sec_idx}_c{c_idx - 1}"
        next_id = f"{doc_id}_s{sec_idx}_c{c_idx + 1}"

        expanded_text = text
        try:
            adj_res = col.get(ids=[prev_id, next_id])
            if adj_res and "ids" in adj_res and adj_res["ids"]:
                prev_text = ""
                next_text = ""
                for i, adj_id in enumerate(adj_res["ids"]):
                    if adj_id == prev_id:
                        prev_text = adj_res["documents"][i] + "\n\n"
                    elif adj_id == next_id:
                        next_text = "\n\n" + adj_res["documents"][i]
                expanded_text = f"{prev_text}{text}{next_text}"
        except Exception:
            pass

        out.append({
            "text":        expanded_text,
            "page_num":    meta.get("page_num", 0),
            "section_idx": meta.get("section_idx", 0),
            "distance":    round(dist, 4),
            "doc_id":      doc_id,
        })


def delete_document_chunks(doc_id: str) -> None:
    """Delete the entire per-document ChromaDB collection."""
    client   = _get_client()
    col_name = _collection_name(doc_id)
    try:
        client.delete_collection(col_name)
    except Exception:
        pass
