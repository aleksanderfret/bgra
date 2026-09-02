# Plan wykonawczy

Etapy są uporządkowane tak, by **każdy kończył się czymś uruchamialnym**, a nie
kolejną warstwą bez efektu. Kryteria odbioru są napisane jako sprawdzalne fakty —
można je przekazać agentowi jako definicję ukończenia.

Zasada obowiązująca na każdym etapie: `pnpm verify` musi przechodzić przed
zamknięciem etapu.

---

## Etap 0 — Repozytorium i harness ✅ **ukończony**

Monorepo, interfejs, przepływ strumienia i kontrakt API.

- pnpm workspaces + Turborepo, jedna komenda `pnpm dev` uruchamia oba procesy
- Next.js 16.3 · React 19 · Mantine 9 · TypeScript 7 · Vitest 4 · Biome 2.5
- FastAPI · Python 3.13 · uv, z `mypy --strict` i `ruff`
- Wspólny kontrakt z referencyjnym dekoderem SSE i testem parzystości
- 46 testów, w tym gwarancja odrzucania wymyślonych odwołań do obrazów

---

## Etap 1 — Uruchomienie modeli lokalnie

**Cel:** silnik faktycznie rozmawia z modelem; `/health` mówi prawdę.

- `scripts/pull-models.sh` pobiera modele z aktywnego profilu i **zatrzymuje się z
  czytelnym błędem**, gdy tag nie istnieje w rejestrze Ollamy (etykiety modeli
  zmieniają się między wydaniami — to jednorazowa weryfikacja)
- Klient Ollamy w `rag_engine/engines/llm.py`, ze strumieniowaniem tokenów
- `/health` sprawdza obecność **konkretnych** modeli z profilu, nie tylko czy Ollama
  odpowiada
- Endpoint `/ask` strumieniuje odpowiedź prawdziwego modelu, jeszcze bez wyszukiwania

**Odbiór:** `curl` na `/ask` zwraca odpowiedź generowaną przez model, token po
tokenie; `/health` zgłasza `degraded` z nazwą brakującego modelu, gdy któregoś nie ma.

---

## Etap 2 — Wczytywanie dokumentów

**Cel:** z PDF-a i filmu powstaje uporządkowany, zaadresowany materiał.

- `uv sync --extra ingest`
- PDF → Markdown przez `pymupdf4llm`, z **zachowaniem numerów stron** (bez nich nie ma
  cytowań)
- Render każdej strony do PNG 150 DPI do `storage/assets/<gameId>/pNN.png`
- Podział po nagłówkach Markdown; fragment nigdy nie przekracza granicy sekcji
- Napisy z YouTube: `youtube-transcript-api` (API instancyjne, `.fetch()`), awaryjnie
  `yt-dlp` + Whisper, gdy autor wyłączył napisy
- Rejestr gier w `storage/games.json` zgodny z `GameSummary`
- CLI: `uv run python -m rag_engine.ingest add --game azul --kind rulebook plik.pdf`

**Odbiór:** po wczytaniu jednej gry `/games` zwraca ją z niezerowym `chunkCount`, a
`storage/assets/<gameId>/` zawiera renderowane strony.

---

## Etap 3 — Wyszukiwanie

**Cel:** odpowiedzi oparte na dokumentach, z cytowaniem strony.

- `uv sync --extra retrieval`; LanceDB w `storage/index`
- Schemat fragmentu: `id`, `gameId`, `documentKind`, `page`, `text`, `heading`, wektor
- **Obowiązkowy** filtr `gameId` przed wyszukiwaniem (patrz audyt 3.1)
- Wyszukiwanie hybrydowe: BM25 + wektorowe, wyniki łączone
- Rerank cross-encoderem, `retrieval_candidates` → `retrieval_top_k`
- Próg `min_relevance_score`; poniżej → `insufficient_evidence` bez wołania modelu
- Prompt z hierarchią `DOCUMENT_AUTHORITY` i zakazem wychodzenia poza kontekst
- Ramka `sources` wysyłana **przed** pierwszym tokenem

**Odbiór:** pytanie o zasadę z wczytanej instrukcji daje odpowiedź z poprawnym
numerem strony; pytanie o grę niewczytaną daje odmowę, nie zmyśloną regułę; pytanie o
grę A nigdy nie zwraca fragmentów gry B.

---

## Etap 4 — Tryb nauczania

**Cel:** asystent uczy, a nie tylko odpowiada.

- Osobne prompty dla `teach` i `arbitrate`
- Styl nauczania z transkrypcji tutoriali podawany jako przykład w prompcie
  systemowym, **z oznaczeniem, że nie jest źródłem zasad**
- Stan sesji po `sessionId`: model pamięta, w którym miejscu lekcji jesteście
- Struktura lekcji: cel → klimat → mechaniki → tura → przykładowy ruch, z pytaniem
  sprawdzającym po każdym module

**Odbiór:** rozmowa „naucz mnie tej gry” prowadzi przez kolejne moduły bez zalewania
wiedzą, a przejście w tryb `arbitrate` w środku sesji daje krótką odpowiedź z cytatem.

---

## Etap 5 — Głos

**Cel:** rozmowa bez klawiatury.

- `uv sync --extra speech`
- Push-to-talk w przeglądarce (`MediaRecorder`), transkrypcja przez `mlx-whisper`
- Ramka `transcript` pokazuje, co usłyszał, zanim odpowie
- Piper z głosem polskim, audio strumieniowane **zdanie po zdaniu** — nie po
  wygenerowaniu całej odpowiedzi
- Jeśli asystent ma działać z tabletu: lokalny HTTPS, bez niego przeglądarka nie
  udostępni mikrofonu (pytanie otwarte O3)

**Odbiór:** pytanie zadane głosem daje odpowiedź mówioną; pierwszy dźwięk pojawia się
zanim model dokończy generowanie.

---

## Etap 6 — Ewaluacja

**Cel:** możliwość stwierdzenia, czy zmiana poprawiła jakość. Najważniejszy etap dla
wiarygodności całości.

- `eval/<gameId>.yaml`: 30–50 pytań z poprawną odpowiedzią i numerem strony
- Osobna grupa pytań **spoza** instrukcji, na które poprawna odpowiedź to odmowa
- `uv run python -m rag_engine.eval` raportuje trafność wyszukiwania, zgodność
  odpowiedzi i odsetek poprawnych odmów
- Wynik zapisywany historycznie, żeby regresja była widoczna

**Odbiór:** zmiana promptu lub rozmiaru fragmentu daje liczbę, o którą jakość wzrosła
albo spadła.

---

## Etap 7 — Obrazy i dopracowanie

**Cel:** „połóż karty tutaj” z pokazaniem miejsca.

- Kadrowanie figur ze stron zamiast całych renderów
- Opcjonalny model wizyjny opisuje wycięte schematy przy wczytywaniu
- Ramka `figure` wysyłana przez backend na podstawie **faktycznie pobranych** źródeł
- Podgląd cytatu po kliknięciu w źródło

**Odbiór:** pytanie o przygotowanie gry pokazuje właściwy schemat, a licznik
`rejectedFigureCount` pozostaje zerowy przy poprawnym działaniu.

---

## Kolejność, jeśli chcesz efekt najszybciej

Etapy 1 → 2 → 3 dają **działającego arbitra zasad na tekście** i to jest naturalny
punkt zatrzymania. Etap 6 warto wykonać zaraz po 3 — zanim zaczniesz stroić prompty,
bo inaczej stroisz na wyczucie. Głos (5) i obrazy (7) są dopracowaniem doświadczenia,
nie warunkiem użyteczności.
