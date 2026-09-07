"""Decide which language the answer has to be written in.

The language must be named outright in the prompt. Telling the model to "answer
in the language of the question" loses to six passages quoted in the other
language — measured, not assumed. Only the two shipped languages (Z6) are told
apart, and Polish wins a tie because it is the language of the table.

Function words only: rules vocabulary is borrowed in both directions, so a
question can say "gracz" or "Trade Agreement" in either language. Words that
exist in both ("a", "i", "to", "on", "by", "no") are in neither list.
"""

from __future__ import annotations

import re
from typing import Literal

AnswerLanguage = Literal["pl", "en"]

LANGUAGE_NAMES: dict[AnswerLanguage, str] = {"pl": "Polish", "en": "English"}

_WORD_RE = re.compile(r"[^\W\d_]+")


def _words(listing: str) -> frozenset[str]:
    return frozenset(listing.split())


# Diacritics are often dropped when typing quickly, so the bare forms count too.
_POLISH_WORDS = _words(
    "czy jak jaki jaka jakie jakiej ile co kto gdzie kiedy dlaczego "
    "mogę moge można mozna muszę musze mam mi mnie mój moj moja moje "
    "się sie jest są sa nie tak oraz albo lub ale więc wiec tylko "
    "żeby zeby jeśli jesli jeżeli jezeli gdy wtedy jako podczas "
    "tego tej ten ta te tym którym ktorym która ktora które ktore "
    "za przez przy dla bez przed między miedzy jeszcze już juz"
)

_ENGLISH_WORDS = _words(
    "the an what which how when where why who whose "
    "can could do does did is are was were be been "
    "if my me of and or but not with for from at in "
    "that this these those there it its you your we they them "
    "than then only still must should may have has had"
)


def answer_language(question: str) -> AnswerLanguage:
    words = set(_WORD_RE.findall(question.casefold()))
    return "en" if len(words & _ENGLISH_WORDS) > len(words & _POLISH_WORDS) else "pl"
