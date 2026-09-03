from rag_engine.contract import DoneEvent, RetrievedSource, SourcesEvent, TokenEvent
from rag_engine.sse import encode_comment, encode_event


def test_frame_ends_with_a_blank_line() -> None:
    frame = encode_event(TokenEvent(text="Dobierasz"))

    assert frame.startswith("data: ")
    assert frame.endswith("\n\n")
    assert frame.count("\n\n") == 1


def test_payload_uses_camel_case_on_the_wire() -> None:
    frame = encode_event(DoneEvent(answer_id="abc", groundedness="grounded"))

    assert '"answerId":"abc"' in frame
    assert "answer_id" not in frame


def test_nested_models_are_serialized_with_aliases() -> None:
    frame = encode_event(
        SourcesEvent(
            sources=[
                RetrievedSource(
                    id="azul:rulebook:p04:c02",
                    game_id="azul",
                    document_title="Azul",
                    document_kind="rulebook",
                    page=4,
                    image_url="/static/assets/azul/p04.png",
                )
            ]
        )
    )

    assert '"gameId":"azul"' in frame
    assert '"documentKind":"rulebook"' in frame
    assert '"imageUrl":"/static/assets/azul/p04.png"' in frame


def test_newlines_in_text_cannot_break_out_of_a_frame() -> None:
    # A raw newline would end the frame early and desynchronise the decoder.
    frame = encode_event(TokenEvent(text="pierwsza\n\ndruga"))

    assert frame.count("\n\n") == 1
    assert "\\n\\n" in frame


def test_comment_frame_carries_no_data() -> None:
    assert encode_comment() == ": keep-alive\n\n"
