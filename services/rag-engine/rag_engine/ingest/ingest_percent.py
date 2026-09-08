from __future__ import annotations

from typing import Literal

IngestStage = Literal["saving", "reading", "drawing", "filing", "community", "indexing"]

STAGE_BANDS: dict[IngestStage, tuple[int, int]] = {
    "saving": (0, 8),
    "reading": (8, 38),
    "drawing": (38, 72),
    "filing": (72, 80),
    "community": (80, 84),
    "indexing": (84, 100),
}


def ingest_percent(stage: IngestStage, current: int | None, total: int | None) -> int:
    start, end = STAGE_BANDS[stage]
    if current is None or total is None or total <= 0:
        return start
    fraction = min(1.0, max(0.0, current / total))
    return round(start + (end - start) * fraction)
