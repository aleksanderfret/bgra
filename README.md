# BGA — lokalny asystent zasad gier planszowych

Prywatny, działający w całości offline asystent, który **uczy zasad gier planszowych** i
**rozstrzyga wątpliwości przy stole** — na podstawie instrukcji, FAQ i errat, które sam
wrzucisz na dysk. Docelowo rozmawiasz z nim głosowo, a on pokazuje na ekranie właściwy
fragment instrukcji.

Żadne pytanie ani dokument nie opuszcza Twojego komputera.

---

## Do czego to służy

Dwa scenariusze, celowo różne:

| Tryb | Kiedy | Zachowanie |
| --- | --- | --- |
| **Naucz mnie gry** | Rozpakowałeś nową grę | Prowadzi lekcję: cel gry → klimat → mechaniki → tura → przykładowy ruch, małymi porcjami, z pytaniami sprawdzającymi |
| **Rozstrzygnij zasadę** | Spór w trakcie rozgrywki | Krótka, precyzyjna odpowiedź z podaniem strony instrukcji |

## Jak to działa

Model **nie uczy się zasad na pamięć**. Zamiast tego przy każdym pytaniu przeszukuje
Twoją lokalną bazę dokumentów i odpowiada wyłącznie na podstawie znalezionych
fragmentów. To wzorzec **RAG** (Retrieval-Augmented Generation).

```
                      ┌─────────────────────────────────────┐
  mikrofon ──────────►│ 1. Rozpoznanie mowy (Whisper)       │
                      └──────────────┬──────────────────────┘
                                     ▼
                      ┌─────────────────────────────────────┐
                      │ 2. Wyszukiwanie w bazie dokumentów  │
                      │    • zawężone do JEDNEJ gry         │
                      │    • hybrydowe: słowa + znaczenie   │
                      │    • przesiew przez reranker        │
                      └──────────────┬──────────────────────┘
                                     ▼
                      ┌─────────────────────────────────────┐
                      │ 3. Generowanie odpowiedzi (LLM)     │
                      │    tylko z dostarczonych fragmentów │
                      └──────┬───────────────────┬──────────┘
                             ▼                   ▼
              ┌──────────────────────┐  ┌──────────────────────┐
              │ 4. Synteza mowy      │  │ 5. Obraz z instrukcji│
              │    (Piper, po polsku)│  │    + numer strony    │
              └──────────────────────┘  └──────────────────────┘
```

### Dwa filary: fakty i styl

To rozdzielenie jest fundamentem całego projektu:

- **Fakty** pochodzą z bazy dokumentów (instrukcja, FAQ, errata). Model nie ma prawa
  wyjść poza to, co znalazł. Jeśli nie znalazł — mówi, że nie wie.
- **Styl nauczania** pochodzi z promptu systemowego i transkrypcji dobrych tutoriali
  z YouTube. Transkrypcje uczą modelu *jak* tłumaczyć (kolejność, analogie, prosty
  język), a **nigdy** nie służą jako źródło zasad.

Dzięki temu asystent mówi przystępnie jak youtuber, ale podaje zasady zgodne z
instrukcją.

### Czego asystent celowo nie robi

Odpowiedź „w tych dokumentach nie ma tej zasady” jest **poprawnym wynikiem**, nie
awarią. Dla arbitra zasad zmyślona reguła jest znacznie gorsza niż przyznanie się do
niewiedzy — dlatego brak pokrycia w źródłach jest osobnym, widocznym stanem w
interfejsie.

---

## Wymagania sprzętowe

Wszystko liczy się w **pamięci zunifikowanej** (Unified Memory) i przepustowości
pamięci — na Apple Silicon to one decydują o szybkości, nie liczba rdzeni.

| Profil | Sprzęt | Model główny | Dysk | Realne odczucie |
| --- | --- | --- | --- | --- |
| `starter-32gb` | M1/M2 Pro, 32 GB | Qwen3 14B (Q4) | ~12 GB | Sprawnie; buduj na tym pipeline |
| `full-64gb` | M4/M5 Pro/Max, 64 GB | Qwen3 30B-A3B (MoE) | ~48 GB | Docelowa jakość i płynna rozmowa |

Profil `full-64gb` używa modelu **mixture-of-experts**: ma 30 mld parametrów, ale na
każdy token aktywuje tylko ~3 mld. Odpowiada więc z szybkością małego modelu,
rozumując jak duży — to najlepszy kompromis dla rozmowy głosowej, w której liczy się
czas do pierwszego dźwięku.

Profil zmieniasz **jedną zmienną środowiskową**, bez dotykania kodu:

```bash
export BGA_MODEL_PROFILE=full-64gb
```

Definicje profili: [`services/rag-engine/rag_engine/settings.py`](services/rag-engine/rag_engine/settings.py).

### Ile miejsca na dysku

| Element | Rozmiar |
| --- | --- |
| Model LLM (14B / 30B, Q4) | 9–20 GB |
| Model wizyjny (opcjonalny) | ~6 GB |
| Embeddingi + reranker | ~3 GB |
| Rozpoznawanie mowy (Whisper turbo) | ~1,6 GB |
| Głos polski (Piper) | ~60 MB |
| Jedna gra: instrukcja + obrazy + indeks | 20–80 MB |

Modele nigdy nie trafiają do repozytorium — są pobierane lokalnie.

---

## Uruchomienie

### Wymagane narzędzia

```bash
node --version   # ≥ 22
corepack enable  # udostępnia pnpm z package.json
brew install uv  # menedżer środowiska Python (sam zainstaluje Python 3.13)
```

Silniki AI dochodzą na późniejszych etapach — **harness działa bez nich**:

```bash
brew install ollama          # etap 3: model językowy i embeddingi
./scripts/pull-models.sh     # pobiera modele z aktywnego profilu
```

### Instalacja i start

```bash
pnpm install
pnpm dev
```

To uruchamia równolegle **oba** procesy:

- interfejs: <http://localhost:3000>
- silnik + dokumentacja API: <http://localhost:8000/docs>

Przeglądarka rozmawia wyłącznie z Next.js, który przekazuje żądania do Pythona pod
`/api/engine/*`. Jeden origin, zero konfiguracji CORS, a port silnika nie jest
wystawiony na sieć.

### Komendy

| Komenda | Działanie |
| --- | --- |
| `pnpm dev` | Interfejs + silnik równolegle |
| `pnpm verify` | Typy, testy, lint i build w całym repo |
| `pnpm test` | Testy wszystkich pakietów |
| `pnpm typecheck` | TypeScript 7 + mypy (strict) |
| `pnpm check:fix` | Formatowanie i naprawialne reguły Biome |

---

## Struktura repozytorium

Polyglot monorepo (pnpm workspaces + Turborepo): TypeScript tam, gdzie liczy się
interfejs, Python tam, gdzie jest dojrzały ekosystem AI.

```
bga/
├── apps/web/                 Next.js 16 · React 19 · Mantine 9 · TypeScript 7
│   ├── app/                  routing, layout, proxy do silnika
│   └── features/rules-chat/  logika odpowiedzi i strumieniowania
├── packages/api-contract/    wspólny kontrakt TS + referencyjny dekoder SSE
├── services/rag-engine/      FastAPI · Python 3.13 · uv
│   ├── rag_engine/           API, konfiguracja, profile modeli
│   └── storage/              Twoje dokumenty i indeks (poza gitem)
└── docs/                     architektura i plan wykonawczy
```

## Co już działa, a co nie

**Działa dziś:** monorepo, interfejs, pełna ścieżka strumieniowania odpowiedzi
(przeglądarka → Next.js → FastAPI), kontrakt API pilnowany testem parzystości,
46 testów, lint i typy w trybie strict.

**Jeszcze nie:** wczytywanie PDF-ów, wyszukiwanie, podłączony model, głos. Do tego
czasu `/ask` zwraca poprawnie ukształtowaną odpowiedź ze stanem
`insufficient_evidence` — czyli dokładnie to, co powinien zwracać przy pustej bazie.

Kolejność prac i kryteria odbioru każdego etapu: [`docs/ROADMAP.md`](docs/ROADMAP.md).
Uzasadnienie decyzji i audyt architektury: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Materiały źródłowe

Instrukcje pobierasz sam, z legalnych źródeł (strony wydawców udostępniają PDF-y do
pobrania) i trzymasz lokalnie, na własny użytek. Repozytorium ich nie zawiera i nie
zawiera automatu do masowego pobierania z serwisów, których regulamin tego zabrania.
