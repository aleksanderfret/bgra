from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from rag_engine.retrieval.pipeline import ChunkIndex, Reranker
from rag_engine.retrieval.rerank import CrossEncoderReranker

logger = logging.getLogger(__name__)


@dataclass
class RetrievalStack:
    reranker: Reranker
    open_index: Callable[[Path], ChunkIndex]


def lancedb_available() -> bool:
    try:
        import lancedb  # noqa: F401
    except ImportError:
        return False
    return True


def sentence_transformers_available() -> bool:
    try:
        import sentence_transformers  # noqa: F401
    except ImportError:
        return False
    return True


def open_chunk_index(storage_dir: Path) -> ChunkIndex | None:
    if not lancedb_available():
        return None
    from rag_engine.retrieval.index import LanceDbIndex

    return LanceDbIndex(storage_dir)


def try_load(reranker_id: str) -> RetrievalStack | None:
    if not lancedb_available() or not sentence_transformers_available():
        logger.info(
            "Retrieval extra is not installed; /ask will refuse until "
            "`uv sync --extra ingest --extra retrieval`."
        )
        return None
    from sentence_transformers import CrossEncoder

    logger.info("Loading reranker %s (first start can take several minutes).", reranker_id)
    print(
        f"Loading reranker {reranker_id}; first start can take several minutes...",
        flush=True,
    )
    model = CrossEncoder(reranker_id)
    print("Reranker ready.", flush=True)

    def open_index(storage_dir: Path) -> ChunkIndex:
        index = open_chunk_index(storage_dir)
        if index is None:
            raise RuntimeError("LanceDB is unavailable after the retrieval extra loaded.")
        return index

    return RetrievalStack(
        reranker=CrossEncoderReranker(model),
        open_index=open_index,
    )
