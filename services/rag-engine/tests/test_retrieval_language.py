import pytest

from rag_engine.retrieval.language import answer_language


@pytest.mark.parametrize(
    "question",
    [
        "Co daje akcja Handel i ile transakcji mogę wykonać?",
        "Czy moge zbudowac baze bez umowy handlowej?",
        "Jak kończy się gra?",
        "Czy Military Base pozwala mi przesuwać znaczniki do tego regionu?",
    ],
)
def test_polish_questions(question: str) -> None:
    assert answer_language(question) == "pl"


@pytest.mark.parametrize(
    "question",
    [
        "What does the Trade action do and how many transactions can I make?",
        "How does the game end and who wins?",
        "Can I build a base if I have no trade agreement?",
        "What happens to the Umocnienie się token at the end of a round?",
    ],
)
def test_english_questions(question: str) -> None:
    assert answer_language(question) == "en"


def test_polish_wins_a_question_with_no_function_words() -> None:
    # Polish is the language of the table, so it is the fallback (Z6).
    assert answer_language("Handel?") == "pl"
    assert answer_language("Trade action") == "pl"
