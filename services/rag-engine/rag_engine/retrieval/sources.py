from rag_engine.contract import RetrievedSource
from rag_engine.retrieval.types import RetrievedChunk

EXCERPT_MAX = 240


def excerpt_text(text: str) -> str:
    collapsed = " ".join(text.split())
    if len(collapsed) <= EXCERPT_MAX:
        return collapsed
    return collapsed[:EXCERPT_MAX]


def to_retrieved_source(chunk: RetrievedChunk) -> RetrievedSource:
    return RetrievedSource(
        id=chunk.id,
        game_id=chunk.game_id,
        document_title=chunk.document_title,
        document_kind=chunk.document_kind,
        page=chunk.page,
        score=chunk.score,
        excerpt=excerpt_text(chunk.text),
        image_url=chunk.image_url,
    )
