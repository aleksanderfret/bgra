# Architektura i audyt planu

Dokument ma dwie części: **audyt** pierwotnego planu (co się nie nadawało i dlaczego)
oraz **architekturę docelową** wraz z uzasadnieniem decyzji.

---

## 1. Werdykt

Zrąb planu jest dobry i został utrzymany: RAG zamiast dotrenowywania modelu,
rozdzielenie faktów od stylu nauczania, polyglot monorepo z Next.js na froncie i
Pythonem w warstwie AI, wszystko lokalnie na Apple Silicon. To trafne decyzje i nie
było powodu ich zmieniać.

Plan **nie nadawał się** natomiast do bezpośredniego przekazania agentowi. Zawierał
błędy, które zatrzymałyby wykonanie, oraz — co poważniejsze — luki, które dałyby
aplikację działającą, ale **udzielającą błędnych odpowiedzi o zasadach**. To drugie
jest groźniejsze, bo nie objawia się awarią.

---

## 2. Audyt: błędy blokujące

Te rzeczy wywaliłyby się przy pierwszym uruchomieniu.

| # | Problem w planie | Skutek | Rozwiązanie |
| --- | --- | --- | --- |
| 1 | `turbo.json` z kluczem `pipeline` | Turborepo 2.x odrzuca konfigurację; `pipeline` zniknął w wersji 2 | Klucz `tasks` |
| 2 | `"dev": "source .venv/bin/activate && uvicorn ..."` | `source` nie istnieje w `sh`, którym npm uruchamia skrypty | `uv run uvicorn ...` — bez aktywacji, bez `bash -c` |
| 3 | `YouTubeTranscriptApi.get_transcript(...)` | Metoda statyczna usunięta w `youtube-transcript-api` 1.x | Instancja + `.fetch()` (etap 2) |
| 4 | `response.status_status` w pobieraniu PDF | `AttributeError` | Kod napisany od nowa (etap 2) |
| 5 | `create-next-app --eslint` przy jednoczesnym wyborze Biome | Dwa konkurujące lintery; do tego brak `--no-tailwind` | `--biome --no-tailwind`, jeden lint w całym repo |
| 6 | `nomic-embed-text` jako model embeddingów | Model anglocentryczny. Polskie pytanie do angielskiej instrukcji **nie trafi** we właściwy fragment — cicha utrata trafności | `bge-m3`, wielojęzyczny, przeszukiwanie międzyjęzykowe |
| 7 | `whisper-cpp-py`, `kokoro-onnx` w `requirements.txt` | Pakiety niepewne w utrzymaniu; ryzyko przy instalacji | `mlx-whisper` (Apple MLX, natywne Metal) i `piper-tts` |
| 8 | `allow_origins=["*"]` razem z `allow_credentials=True` | Przeglądarka odrzuca tę kombinację ze specyfikacji | Brak CORS w ogóle — patrz decyzja D2 |
| 9 | Front wołał `http://localhost:8000` wprost, choć struktura przewidywała proxy | Niespójność: proxy istniało tylko na schemacie | Całość przez `/api/engine/*` |
| 10 | „BGG udostępnia API, z którego można wyciągnąć sekcję plików (Files/Rules)” | Nieprawda. XMLAPI2 nie udostępnia sekcji plików; automat do jej pobierania łamałby regulamin | Instrukcje pobierasz ręcznie z legalnych źródeł; repo dostarcza wczytywanie, nie masowe ściąganie |

Plan sam wyłapał wcześniej trzy rzeczy trafnie: zepsuty parser SSE, brak polskiego
fonemizera w Kokoro-TTS oraz brak awaryjnej ścieżki dla napisów z YouTube. Te
poprawki utrzymałem.

---

## 3. Audyt: luki architektoniczne

Tu nie chodzi o błędy składniowe, a o rzeczy, których brak daje **działającą
aplikację, która myli zasady**.

### 3.1. Brak zawężenia wyszukiwania do gry — luka nr 1

W planie wszystkie dokumenty trafiały do jednej bazy wektorowej bez obowiązkowego
filtra. Pytanie „ile kart dociągam w fazie walki?” przy dwudziestu wczytanych grach
wyciągnie fragmenty z kilku różnych instrukcji, a model połączy je w jedną
odpowiedź, która brzmi wiarygodnie i jest nieprawdziwa.

**Rozwiązanie:** `gameId` jest wymaganym polem żądania (`AskRequest`), walidowanym po
stronie serwera, a filtr metadanych stosuje się **przed** wyszukiwaniem, nie po.
Kontrakt wymusza to na poziomie typów, a test `test_ask_rejects_a_question_without_a_game`
tego pilnuje.

### 3.2. Brak hierarchii wiarygodności dokumentów

Errata istnieje właśnie dlatego, że instrukcja się myli. Plan traktował instrukcję,
FAQ i erratę jako równorzędny tekst, więc przy sprzeczności wygrywał ten fragment,
który akurat miał wyższy wynik podobieństwa.

**Rozwiązanie:** każdy fragment ma `documentKind`, a stała `DOCUMENT_AUTHORITY`
ustala porządek: `video_transcript < player_aid < rulebook < faq < errata`. Przy
konflikcie prompt każe modelowi trzymać się dokumentu o wyższej wiarygodności i
powiedzieć wprost, że errata zmieniła zasadę. Kolejność jest identyczna po obu
stronach — pilnuje tego `test_document_authority_order_matches`.

Transkrypcje z YouTube mają **najniższą** wiarygodność celowo: dostarczają stylu, a
nie zasad. Youtuber się myli albo gra ze starą erratą.

### 3.3. Znacznik `[SHOW_IMAGE: ścieżka]` w treści odpowiedzi

To był najpoważniejszy błąd projektowy. Plan kazał modelowi wypisywać ścieżkę do
pliku wewnątrz generowanego tekstu. Model językowy **wymyśla ścieżki** — to dokładnie
ten rodzaj danych, w którym halucynuje najchętniej. Front wyświetlałby wtedy losowy
obrazek albo pustą ramkę, a znacznik potrafi też zostać rozerwany między dwa tokeny
strumienia.

**Rozwiązanie:** obrazy są kontrolowane przez backend, nie przez model.

1. Backend wysyła ramkę `sources` **przed** pierwszym tokenem — to zamknięta lista
   dowodów wraz z ich identyfikatorami i adresami obrazów.
2. Model może wskazać figurę tylko przez jej identyfikator, w osobnej ramce `figure`.
3. Front wyświetla obraz **wyłącznie** wtedy, gdy identyfikator występuje w otrzymanej
   liście `sources` i ma przypisany obraz. Wymyślone odwołanie jest odrzucane i
   zliczane w `rejectedFigureCount`.

Wymyślona ścieżka nie jest więc „obsługiwana” — jest **niemożliwa do wyświetlenia**.
Gwarancję opisują testy w `apps/web/features/rules-chat/answer-state.test.ts`.

### 3.4. Brak reranku i wyszukiwania hybrydowego

Plan miał jeden krok: podobieństwo wektorowe, `top_k` fragmentów, koniec. Dla pytań o
zasady to za mało z dwóch powodów:

- **Instrukcje są pełne nazw własnych** („Faza Odrodzenia”, „kafelek Zaopatrzenia”).
  Wyszukiwanie znaczeniowe gubi dokładne dopasowania; potrzebny jest też klasyczny
  BM25. LanceDB obsługuje jedno i drugie, więc wyniki łączymy.
- **Podobieństwo ≠ trafność.** Cross-encoder (`bge-reranker-v2-m3`) przelicza pary
  pytanie–fragment i przestawia kolejność. To pojedynczo największy zysk jakości w
  RAG-u nad dokumentami technicznymi.

Stąd trzy etapy: pobierz ~40 kandydatów hybrydowo → przesiej rerankerem → zostaw 6.
Wartości są w konfiguracji (`retrieval_candidates`, `retrieval_top_k`).

### 3.5. Brak progu istotności i stanu „nie wiem”

Plan mówił modelowi „odpowiadaj tylko na podstawie fragmentów”, ale nic nie
sprawdzało, czy fragmenty w ogóle są sensowne. Wyszukiwanie **zawsze** coś zwróci,
choćby najlepszy wynik był kompletnie nie na temat — a model dostawszy nieadekwatny
kontekst i tak sformułuje odpowiedź.

**Rozwiązanie:** `min_relevance_score` odcina słabe trafienia, a `Groundedness`
(`grounded` / `partial` / `insufficient_evidence`) jest częścią kontraktu i osobnym
komunikatem w interfejsie. Brak pokrycia to wynik, nie błąd.

### 3.6. Brak zbioru ewaluacyjnego — największy brak w całym planie

W planie nie było **żadnego** sposobu stwierdzenia, czy asystent odpowiada poprawnie.
Przy takim systemie każda zmiana promptu, rozmiaru fragmentu czy modelu jest
zgadywaniem: poprawiasz jedno pytanie, psujesz trzy inne i nigdy się o tym nie
dowiadujesz.

**Rozwiązanie:** etap 6 to zbiór 30–50 pytań na grę z ręcznie wpisaną poprawną
odpowiedzią i numerem strony. Mierzymy trzy rzeczy:

- **trafność wyszukiwania** — czy właściwa strona znalazła się w wynikach,
- **zgodność odpowiedzi** — czy odpowiedź nie sprzeczna ze wzorcem,
- **poprawne „nie wiem”** — pytania spoza instrukcji, na które asystent **musi** odmówić.

Ta trzecia grupa jest najważniejsza i najczęściej pomijana.

### 3.7. Ekstrakcja obrazów z PDF

Plan poprawił naiwne `page.get_images()` filtrem rozmiaru, co jest dobrym początkiem,
ale nadal wyciąga elementy tła i pomija schematy złożone z wektorów (a takie są
niemal wszystkie diagramy przygotowania gry).

**Rozwiązanie warstwowe:** podstawą jest **render całej strony** do PNG w 150 DPI —
zawsze poprawny i zawsze wystarczający do pokazania „patrz tutaj”, bo mamy numer
strony. Kadrowanie pojedynczych figur to ulepszenie na później, nie fundament.

### 3.8. Ciężkie parsery PDF

`Marker` i `Unstructured` ciągną PyTorch i kilka GB modeli, po to, by radzić sobie ze
skanami. Instrukcje wydawców to prawie zawsze PDF-y z warstwą tekstową.

**Rozwiązanie:** domyślnie `pymupdf4llm` (lekki, zwraca Markdown z nagłówkami, bez
żadnego modelu). Ciężki parser z OCR włączamy tylko dla konkretnego skanu.

### 3.9. Warstwa głosowa

Plan wysyłał całe nagranie po zakończeniu wypowiedzi i czekał na całą odpowiedź.
Przy stole to zbyt wolne, a przy gwarze — zawodne.

**Rozwiązanie:** *push-to-talk* jako domyślny tryb (odporny na hałas, przewidywalny),
strumieniowanie TTS zdanie po zdaniu zamiast czekania na pełną odpowiedź, oraz
widoczna transkrypcja pytania, żeby przesłyszenie było natychmiast widać.

### 3.10. Mikrofon przy dostępie z tabletu

Jeśli asystent ma być używany z tabletu w sieci lokalnej, `getUserMedia` **nie
zadziała** po zwykłym HTTP — przeglądarka wymaga bezpiecznego kontekstu. Plan tego
nie uwzględniał. Rozwiązanie (lokalny certyfikat albo tunel) należy do etapu 5 i
zależy od odpowiedzi na pytanie otwarte O3.

---

## 4. Architektura docelowa

```
┌──────────────────────────────────────────────────────────────────┐
│  apps/web — Next.js 16, React 19, Mantine 9, TypeScript 7        │
│                                                                  │
│  push-to-talk ──► POST /api/engine/ask ──► SSE                   │
│  odpowiedź ◄── reduktor stanu ◄── dekoder ramek                  │
│                     │                                            │
│                     └─► obraz TYLKO z listy `sources`            │
└───────────────────────────────┬──────────────────────────────────┘
                                │ jeden origin, bez CORS
┌───────────────────────────────▼──────────────────────────────────┐
│  services/rag-engine — FastAPI, Python 3.13                      │
│                                                                  │
│  Whisper (mlx) ──► tekst pytania                                 │
│         │                                                        │
│         ▼                                                        │
│  wyszukiwanie:  filtr gameId ──► BM25 + wektory ──► reranker     │
│         │                              │                         │
│         │                              ▼                         │
│         │                    próg istotności ──► „nie wiem”      │
│         ▼                                                        │
│  LLM (Ollama) z promptem: tylko kontekst + hierarchia dokumentów │
│         │                                                        │
│         ▼                                                        │
│  Piper TTS (głos polski) ──► strumień audio zdanie po zdaniu     │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│  Wczytywanie (uruchamiane ręcznie, nie przy starcie)             │
│  PDF ──► pymupdf4llm ──► Markdown + render stron                 │
│  YouTube ──► napisy, awaryjnie yt-dlp + Whisper                  │
│  ──► podział po nagłówkach ──► LanceDB (wektory + BM25)          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Dziennik decyzji

**D1 — Kontrakt API jako osobny pakiet.**
`packages/api-contract` zawiera typy TypeScript i referencyjny dekoder SSE; Python
odzwierciedla je w `contract.py`. Test parzystości czyta plik `.ts` i porównuje oba
zbiory zdarzeń. Bez tego dodanie zdarzenia po jednej stronie objawia się jako
strumień, który przeglądarka po cichu ignoruje.

**D2 — Wszystko przez proxy Next.js, zero CORS.**
Przeglądarka nie zna adresu silnika. Zyskujemy: brak konfiguracji CORS, jeden origin
dla obrazów i audio, port Pythona nadal tylko na `127.0.0.1`, i jedno miejsce na
kontrolę dostępu, gdy dojdzie tablet w sieci lokalnej.

**D3 — Profile modeli w konfiguracji, nie w kodzie.**
Budujesz na 32 GB, docelowo masz 64 GB. Profil to nazwany zestaw modeli
(`starter-32gb`, `full-64gb`) wybierany zmienną `BGA_MODEL_PROFILE`. Przenosiny na
nowy komputer to zmiana jednej linii.

**D4 — Model MoE jako główny na docelowym sprzęcie.**
Dla rozmowy głosowej liczy się czas do pierwszego dźwięku, nie wynik w benchmarku.
Qwen3 30B-A3B aktywuje ~3 mld parametrów na token, więc odpowiada szybko przy
jakości bliskiej modelowi 30B. Model 70B zmieściłby się w 64 GB, ale nie zostawia
zapasu na cache kontekstu, Whisper i TTS jednocześnie — dlatego zamiast tego jest
`llm_arbiter`: mocniejszy model uruchamiany wyłącznie do rozstrzygania sporów, gdzie
kilka sekund dłużej nie przeszkadza.

**D5 — Ciężkie zależności w opcjonalnych grupach.**
`uv sync` dla harnessu trwa sekundy. `ingest`, `retrieval` i `speech` doinstalowujesz
wchodząc w dany etap. Na dysku 1 TB to wygoda; na obecnym, z 74 GB wolnego —
konieczność.

**D6 — Biome zamiast ESLint (a nie tylko dla szybkości).**
TypeScript 7.0 nie udostępnia jeszcze programmatic API (ma dojść w 7.1), co
**blokuje** `typescript-eslint`. Biome nie używa tego API, więc wybór Biome jest tym,
co czyni stack TS 7 spójnym dziś. Next.js 16.3 uruchamia typowanie przez lokalne
`tsc` CLI — sprawdzenie typów całej aplikacji zajmuje ~300 ms.

**D7 — Zaślepka `/ask` mówi „nie wiem”.**
Domyślnym zachowaniem pustego systemu jest `insufficient_evidence`. To nie atrapa dla
atrapy: front da się w całości zbudować i przetestować, zanim na dysku znajdzie się
pierwszy model, a najważniejsza ścieżka — uczciwa odmowa — jest sprawdzana od
pierwszego dnia.

---

## 6. Ustalenia zakresu

Poniższe decyzje są podjęte i wiążą kolejne etapy.

**Z1 — Instrukcje mieszane: polskie i angielskie, pytania zawsze po polsku.**
Wyszukiwanie międzyjęzykowe przestaje być opcją. Konsekwencje:

- `bge-m3` do embeddingów i `bge-reranker-v2-m3` do reranku są **wymagane** — oba są
  wielojęzyczne i przeszukują między językami. Model anglocentryczny jest tu
  wykluczony, bo polskie pytanie nie trafiłoby w angielski fragment.
- Prompt musi nakazywać odpowiedź po polsku **z zachowaniem oryginalnego terminu w
  nawiasie**, gdy źródło jest angielskie. To nie kosmetyka: nazwy faz i elementów są
  wydrukowane po angielsku na kartach i planszy, więc „faza zaopatrzenia
  (Supply Phase)” jest użyteczna przy stole, a samo tłumaczenie — nie.
- Zbiór ewaluacyjny (etap 6) musi zawierać polskie pytania do angielskich instrukcji,
  bo to najtrudniejszy przypadek dla wyszukiwania.

**Z2 — Tekst jest trybem podstawowym, głos wchodzi na etapie 5.**
Arbiter zasad na tekście jest użyteczny sam z siebie i dowozi się szybciej.

**Z3 — Obrazy: na start render całej strony wraz z numerem.**
Zawsze poprawny i wystarczający do „patrz tutaj”. Kadrowanie pojedynczych schematów
zostaje w etapie 7 jako ulepszenie.

**Z4 — Dostęp z tabletu w sieci domowej jest w zakresie.**
To ma trzy skutki, których pierwotny plan nie uwzględniał:

- `getUserMedia` **nie działa** po zwykłym HTTP poza `localhost`, więc etap 5 wymaga
  lokalnego certyfikatu (`mkcert`) albo tunelu. Bez tego mikrofon na tablecie
  pozostanie niedostępny — i nie jest to problem do obejścia po stronie kodu.
- Next.js musi nasłuchiwać na `0.0.0.0`, ale silnik Pythona **nadal tylko** na
  `127.0.0.1`. Decyzja D2 (wszystko przez proxy) właśnie się opłaca: jest jedno
  miejsce, przez które wchodzi ruch z sieci.
- Skoro aplikacja staje się dostępna z sieci lokalnej, dochodzi prosta kontrola
  dostępu w proxy — dziś jej nie ma i nie jest potrzebna.

**Z5 — Start na dwóch–trzech grach, w tym jednej prostej i jednej złożonej.**
Wiele gier w bazie od początku pozwala wcześnie wykryć mieszanie zasad między grami
(audyt 3.1) — przy jednej grze ten błąd jest niewidoczny aż do momentu, gdy staje się
kosztowny w naprawie.
