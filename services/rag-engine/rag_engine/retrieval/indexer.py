from __future__ import annotations

import logging
from pathlib import Path

from rag_engine.contract import DocumentKind
from rag_engine.engines.embed import INGEST_TIMEOUT_SECONDS, embed_texts_sync
from rag_engine.engines.llm import ModelNotInstalledError, OllamaUnreachableError
from rag_engine.ingest.models import ChunkRecord
from rag_engine.retrieval.service import open_chunk_index
from rag_engine.retrieval.types import RetrievedChunk

logger = logging.getLogger(__name__)


class IndexingError(RuntimeError):
    pass


def maybe_index_document(
    storage_dir: Path,
    *,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    chunks: list[ChunkRecord],
    indexed_at: str,
    ollama_url: str,
    embedding_model: str,
) -> None:
    index = open_chunk_index(storage_dir)
    if index is None:
        logger.warning(
            "Skipping search index for %s/%s: retrieval extra is not installed.",
            game_id,
            doc_key,
        )
        return
    if not chunks:
        index.delete_document(game_id, kind, doc_key)
        return
    try:
        vectors = embed_texts_sync(
            ollama_url,
            embedding_model,
            [chunk.text for chunk in chunks],
            timeout_seconds=INGEST_TIMEOUT_SECONDS,
        )
    except (OllamaUnreachableError, ModelNotInstalledError) as error:
        raise IndexingError(str(error)) from error
    if len(vectors) != len(chunks):
        raise IndexingError("Embedding count did not match chunk count.")
    expected_dim = len(vectors[0])
    scored: list[RetrievedChunk] = []
    for record, vector in zip(chunks, vectors, strict=True):
        if len(vector) != expected_dim:
            raise IndexingError("Embedding length changed between chunks.")
        scored.append(
            RetrievedChunk.from_record(record, indexed_at=indexed_at).model_copy(
                update={"vector": vector}
            )
        )
    index.delete_document(game_id, kind, doc_key)
    try:
        index.upsert(scored)
    except Exception as error:
        raise IndexingError(str(error)) from error
