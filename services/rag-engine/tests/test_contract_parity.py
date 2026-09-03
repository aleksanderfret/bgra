"""Parity: an event added on one side only becomes a stream the browser ignores."""

import re
from typing import get_args

from pydantic.alias_generators import to_camel

from rag_engine.contract import (
    DOCUMENT_AUTHORITY,
    GAME_ID_PATTERN,
    AnswerMode,
    AskRequest,
    AssistantEvent,
    DocumentKind,
    Groundedness,
    HealthReport,
    PipelineStage,
    RetrievedSource,
)
from rag_engine.settings import SERVICE_ROOT

TYPES_TS = SERVICE_ROOT.parent.parent / "packages" / "api-contract" / "src" / "types.ts"


def _source() -> str:
    return TYPES_TS.read_text(encoding="utf-8")


def _declaration(source: str, anchor: str) -> str:
    """A top-level declaration in `types.ts` ends at a blank line or EOF."""
    start = source.index(anchor)
    try:
        end = source.index("\n\n", start)
    except ValueError:
        end = len(source)
    return source[start:end]


def _quoted(text: str) -> set[str]:
    return set(re.findall(r"'([^']+)'", text))


def _interface_fields(source: str, name: str) -> set[str]:
    block = _declaration(source, f"export interface {name} {{")
    return set(re.findall(r"^\s{2}(\w+)\??:", block, re.MULTILINE))


def test_types_file_is_where_we_expect() -> None:
    assert TYPES_TS.is_file(), f"Contract not found at {TYPES_TS}"


def test_document_kinds_match() -> None:
    ts_kinds = _quoted(_declaration(_source(), "export type DocumentKind ="))

    assert ts_kinds == set(get_args(DocumentKind))


def test_document_authority_order_matches() -> None:
    block = _declaration(_source(), "export const DOCUMENT_AUTHORITY")
    ts_order = re.findall(r"'([^']+)'", block.split("[", 1)[1])

    assert tuple(ts_order) == DOCUMENT_AUTHORITY


def test_game_id_pattern_matches() -> None:
    block = _declaration(_source(), "export const GAME_ID_PATTERN")
    ts_pattern = block.split("=", 1)[1].strip().rstrip(";").strip("/")

    # A slug accepted on one side and rejected on the other is a game that
    # indexes and then cannot be asked about.
    assert ts_pattern == GAME_ID_PATTERN


def test_answer_modes_match() -> None:
    ts_modes = _quoted(_declaration(_source(), "export type AnswerMode ="))

    assert ts_modes == set(get_args(AnswerMode))


def test_pipeline_stages_match() -> None:
    ts_stages = _quoted(_declaration(_source(), "export type PipelineStage ="))

    assert ts_stages == set(get_args(PipelineStage))


def test_groundedness_values_match() -> None:
    ts_values = _quoted(_declaration(_source(), "export type Groundedness ="))

    assert ts_values == set(get_args(Groundedness))


def test_every_event_exists_on_both_sides() -> None:
    block = _declaration(_source(), "export type AssistantEvent =")
    ts_events = set(re.findall(r"type:\s*'([^']+)'", block))

    union = get_args(AssistantEvent)[0]
    python_events = {
        get_args(member.model_fields["type"].annotation)[0] for member in get_args(union)
    }

    assert ts_events == python_events


def test_retrieved_source_fields_match() -> None:
    ts_fields = _interface_fields(_source(), "RetrievedSource")
    python_fields = {to_camel(name) for name in RetrievedSource.model_fields}

    assert ts_fields == python_fields


def test_ask_request_fields_match() -> None:
    ts_fields = _interface_fields(_source(), "AskRequest")
    python_fields = {to_camel(name) for name in AskRequest.model_fields}

    assert ts_fields == python_fields


def test_health_report_fields_match() -> None:
    ts_fields = _interface_fields(_source(), "HealthReport")
    python_fields = {to_camel(name) for name in HealthReport.model_fields}

    assert ts_fields == python_fields
