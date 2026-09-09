"""Build a teaching syllabus from indexed section catalogues (not inventing topics).

Order usually follows the rulebook. Soft spine hints may pull goal/setup-like
sections earlier. Adjacent sections with the same spine hint may merge; a hard
cap keeps long books teachable. Every unit must cite at least one real section_ref.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from rag_engine.contract import DocumentKind, LessonSpineHint, LessonSyllabusUnit
from rag_engine.ingest.models import BLOCK_KIND_CATALOGUE
from rag_engine.lesson.documents import iter_document_chunks

# Soft cap so a dense rulebook does not become a 40-step lesson.
_MAX_SYLLABUS_UNITS = 12


class LessonPlanError(ValueError):
    """No usable section catalogue for the active game set."""


@dataclass(frozen=True)
class _Section:
    ref: str
    title: str
    page: int | None
    kind: DocumentKind
    spine: LessonSpineHint | None


_GOAL_WORDS = (
    "goal",
    "object of the game",
    "overview",
    "introduction",
    "setup",
    "components",
    "cel gry",
    "przygotowanie",
    "wstęp",
    "przegląd",
)
_THEME_WORDS = ("theme", "story", "setting", "klimat", "temat", "historia")
_MECHANICS_WORDS = (
    "action",
    "actions",
    "mechanic",
    "rules",
    "how to play",
    "akcje",
    "zasady",
    "mechanika",
)
_TURN_WORDS = ("turn", "round", "phase", "tura", "runda", "faza")
_SAMPLE_WORDS = ("example", "sample", "example turn", "przykład", "sample move")


def _spine_for_title(title: str) -> LessonSpineHint | None:
    lowered = title.casefold()
    checks: list[tuple[tuple[str, ...], LessonSpineHint]] = [
        (_SAMPLE_WORDS, "sample_move"),
        (_GOAL_WORDS, "goal"),
        (_THEME_WORDS, "theme"),
        (_TURN_WORDS, "turn"),
        (_MECHANICS_WORDS, "mechanics"),
    ]
    for words, hint in checks:
        if any(word in lowered for word in words):
            return hint
    return None


def _section_ref(game_id: str, doc_key: str, section_id: str) -> str:
    return f"{game_id}/{doc_key}/{section_id}"


def collect_sections(storage_dir: Path, game_ids: list[str]) -> list[_Section]:
    """Unique named sections in reading order across the active game set."""
    chunks = iter_document_chunks(storage_dir, game_ids)
    sections: list[_Section] = []
    seen: set[str] = set()
    for chunk in chunks:
        if chunk.block_kind == BLOCK_KIND_CATALOGUE:
            continue
        section_id = chunk.section_id.strip()
        title = chunk.heading.strip()
        if not section_id or not title:
            continue
        ref = _section_ref(chunk.game_id, chunk.doc_key, section_id)
        if ref in seen:
            continue
        seen.add(ref)
        sections.append(
            _Section(
                ref=ref,
                title=title,
                page=chunk.page,
                kind=chunk.document_kind,
                spine=_spine_for_title(title),
            )
        )
    return sections


def _promote_goal_sections(sections: list[_Section]) -> list[_Section]:
    """Keep book order, but move the first goal/setup-like section to the front."""
    if not sections:
        return sections
    first_goal: _Section | None = None
    for section in sections:
        if section.spine == "goal":
            first_goal = section
            break
    if first_goal is None:
        return sections
    rest = [section for section in sections if section is not first_goal]
    return [first_goal, *rest]


def _merge_adjacent_same_spine(sections: list[_Section]) -> list[list[_Section]]:
    """Group consecutive sections that share a non-null spine hint."""
    if not sections:
        return []
    groups: list[list[_Section]] = [[sections[0]]]
    for section in sections[1:]:
        previous = groups[-1][-1]
        if (
            section.spine is not None
            and previous.spine is not None
            and section.spine == previous.spine
        ):
            groups[-1].append(section)
        else:
            groups.append([section])
    return groups


def _cap_groups(groups: list[list[_Section]], limit: int) -> list[list[_Section]]:
    """If still too many units, merge neighbouring groups until under the cap."""
    capped = [list(group) for group in groups]
    while len(capped) > limit and len(capped) >= 2:
        # Merge the two shortest adjacent groups (prefer middle of the book).
        best_i = 0
        best_size = len(capped[0]) + len(capped[1])
        for index in range(1, len(capped) - 1):
            size = len(capped[index]) + len(capped[index + 1])
            if size < best_size:
                best_size = size
                best_i = index
        capped[best_i] = [*capped[best_i], *capped[best_i + 1]]
        del capped[best_i + 1]
    return capped


def build_syllabus(storage_dir: Path, game_ids: list[str]) -> list[LessonSyllabusUnit]:
    """Deterministic syllabus from named sections (merged/capped for length).

    Raises LessonPlanError when no sections exist (empty library / no catalogue).
    """
    sections = _promote_goal_sections(collect_sections(storage_dir, game_ids))
    if not sections:
        raise LessonPlanError("No named sections found for this game set.")

    groups = _cap_groups(_merge_adjacent_same_spine(sections), _MAX_SYLLABUS_UNITS)
    units: list[LessonSyllabusUnit] = []
    for index, group in enumerate(groups):
        title = group[0].title if len(group) == 1 else " · ".join(item.title for item in group)
        spine = group[0].spine
        if any(item.spine != spine for item in group):
            spine = None
        slug = group[0].ref.split("/")[-1]
        unit_id = f"u{index:02d}-{slug}"[:64]
        units.append(
            LessonSyllabusUnit(
                unit_id=unit_id,
                title=title,
                section_refs=[item.ref for item in group],
                spine_hint=spine,
            )
        )
    if any(not unit.section_refs for unit in units):
        raise LessonPlanError("Syllabus unit missing section refs.")
    return units
