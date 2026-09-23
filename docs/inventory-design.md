# Work Equipment Inventory — Design Study

Status: **design complete. Approved by your manager. Ready to build.** Version 19, 20 Aug 2026.

**Nothing is blocked.** One IT request is outstanding (the `inventaire` share, §6.0) and you're asking tomorrow. It blocks step 5, not step 1.

---

## 0. What changed since v18 — the probe answered, and one answer was bad

**`tool_choice` forcing is not reliable on LongCat.** The same forced-tool request at `temperature: 0`, run three times, called the tool once and returned plain prose twice. Had the pipeline been built on forced tool calls — the design I would have reached for — roughly two thirds of jobs would have returned prose where structured arguments were expected. **Forced tool calls are now excluded** (D48).

**`response_format: {type:"json_schema"}` is real enforcement — now proven.** Given a prompt demanding a forbidden `notes` field, the model's own `reasoning_content` shows it deciding to include `notes` and to use its preferred key `numbers`; the emitted `content` contained neither. It wanted to break the schema and could not. That is constrained decoding, so off-schema output is impossible rather than unlikely — and it lets us push enums and script patterns into the schema too (D52).

**`temperature: 0` is not deterministic here** — two identical calls produced structurally different guides. We can never assume repeat calls match.

The layered design in `spec/output-contract.md` is what makes this survivable rather than fatal: validation isn't belt-and-braces, it is load-bearing.

---

## 0b. What changed since v17 — output enforcement, and Arabic

**Arabic joins the native-sourcing rule (D49).** Where a manual contains Arabic — the Bosch does — the guide is written from the manufacturer's own Arabic, not translated. Manufacturer-grade terminology, `native` tier, and less review work for you.

**Output predictability is now specified rather than assumed** — see `spec/output-contract.md`. The short version: we do not "handle" variable output, we shrink the space where the model is allowed to vary (D47). Everything deterministic is code; the model only writes prose from text we hand it. On top of that sits API-level enforcement, validation before any write, a repair loop, and a loud failure (D48).

LongCat's docs don't state whether it supports JSON-schema mode or native tool calling, so the spec includes a 10-minute probe to find out. **Nothing depends on the answer** — the enforcement ladder degrades gracefully.

---

## 0c. What changed since v16 — **P0.3 has run, and native sourcing wins**

Researched against all 12 machines. **9 of 12 can get French, German, Italian and Portuguese from manufacturer-authored text, with no translation at all.** Two are partial (Husqvarna 115iHD45 is DE-only; Kraftronic is German-only) and exactly one is a genuine gap — the STIHL FS 86, discontinued and absent from every current STIHL site. **Translation is now the exception.**

Pattern A turned out to dominate: Makita, DeWalt, Bosch, Einhell and MAXX all ship one multilingual PDF for Europe, where our languages are simply page ranges. Husqvarna and STIHL are the pattern-B exceptions with genuine per-locale documents.

**Two traps found, and the first would have been damaging:**

- **A locale swap returning 200 does not mean a different manual.** Bosch and Einhell serve byte-identical PDFs across `/fr/`, `/de/`, `/it/` and `/pt/`. A pipeline trusting the status code would fetch the *English* document from a French URL and label the resulting guide `native` — "the manufacturer's own French text" — when it is nothing of the kind. That badge is shown to workers. **A false `native` is worse than an honest `auto`.** Now D45.
- **Model slugs don't transfer between markets** — and the support path word is itself translated. A 404 is normal and means "search properly here". Now D46.

**Bonus:** the Bosch manual lists Arabic among its languages. Some European manuals carry Arabic natively, which means manufacturer-grade Arabic and less review work for you.

Full results in `06-RESULTS-P03.md`.

---

## 0d. What changed since v14 — **extract, don't translate**

Your observation reshapes the translation half of this project: **European manuals are already multilingual.** A single manufacturer PDF routinely carries German, French, Italian, Spanish, Portuguese, Polish — sometimes Arabic. Our own test proved it without either of us noticing: the DeWalt manual was a 160-page multilingual PDF whose *English* section ran pages 32–42.

So for most languages we should never translate at all. We should **write the guide from the manufacturer's own text in that language** (D43). That text is legally vetted, uses correct trade terminology, and cannot contain a translation error — which also dissolves the Arabic naming problem from v14 wherever Arabic is available.

**Checked, and it turns out there are two patterns, not one:**

| | Pattern | Example | How we get it |
|---|---|---|---|
| **A** | One multilingual PDF | DeWalt — 160 pages, English on 32–42 | Detect language sections inside the file |
| **B** | One manual per locale | Husqvarna — `ca-en` is English-only, `be-fr` is a full 112-page French manual | **Swap the locale in the URL** and re-fetch |

Pattern B is the better outcome — a complete manual in the language, not a compressed section — and it's systematic enough to script. Husqvarna is four of your twelve machines, so this matters immediately.

Translation becomes the *fallback*, not the default. And Tigrinya, which is never in any manual, becomes the one language that genuinely needs the full translate-and-cross-check machinery.

Guides now carry a visible trust tier (D44): `native` > `verified` > `cross-checked` > `auto`.

---

## 0e. What changed since v13 — Arabic terminology

Your Arabic review found the translation **exact** — including negations, which is what makes the instructions safe. But exactness also produces literal *names*: a maintenance-free battery rendered as "battery without maintenance" rather than the **dry battery** everyone actually says.

You judged this non-critical for instructions, and that's right. It is consequential in one place: **the search box indexes names**, so a literal-only name means a worker typing the real trade term finds nothing.

Fixed without touching what already works — display name idiomatic, index holds both (D42), and terminology corrected through a **glossary that grows as you review** rather than by telling the model to translate more loosely (D41). That distinction matters: a general "be more natural" instruction would also loosen the exact rendering of *don't* you just praised.

---

## 0f. What changed since v12 — translation engine settled

**DeepL was considered and rejected for production**, for one decisive reason: it does not support Tigrinya. It would have improved the five languages that already passed and done nothing for the one that failed. Its free 1M is also a *lifetime* allocation (~80 machines), not monthly.

**Google Cloud Translation does support Tigrinya** — so it becomes the independent second engine for that language. Two different engines translating in parallel and being compared is real evidence; one engine checking itself is not. That directly attacks the P0.2 failure (D35).

**Arabic is settled: you are the checker** (D40). DeepL's 1M gets spent once as a calibration audit of the European languages rather than on production (D39).

Detail in `translation-engine-note.md`.

---

## 0g. What changed since v11 — **P0.2 has run**

Twelve real machines through the pipeline. **11 of 12 guides written, all judged usable** — English guides and sourcing passed convincingly. The gate result is elsewhere.

**Tigrinya failed.** Of 11 guides: 5 clean, 5 with meaning-level errors, 1 delivered in Latin letters instead of Ge'ez. The errors include `"Always wear eye protection"` → `"Always DON'T wear eye protection"` and `"extremely hot"` → `"very cold"`. A ~50% error rate — and optimistic, because the model checked its own work.

The back-translation check caught all of it, so it is now permanent (D35), runs on **every** unverified language including **Arabic** (never checked, and the same drift shows in the Bosch output), and a failed check is flagged rather than auto-fixed (D37).

Also new: JSON output instead of files (D34 — fixes the format inconsistency by construction), script validation (D36), and three search improvements from your observations (D38).

Full analysis in `04-RESULTS.md`.

---

## 0h. What changed since v10

A hand pre-scan of 12 real machines from the workshop, before running anything, found two things the design had wrong:

- **The "no-name" tools are not unfindable — they're findable in the wrong place.** Kraftronic and MAXX manuals exist, but only on aggregators like ManualsLib, in German, under differently-spaced model numbers. The manufacturer-domain-only rule would have marked them `introuvable` while a usable manual sat one click away. Now **D33**: aggregators accepted, source labelled.
- **Model-number noise is a first-class problem, not an edge case.** `KT-AS18LI` vs `KT-AS 18 Li`; `-QS` regional suffixes; and `M14 125mm` copied off a sticker as if it were a model number when it's the spindle thread and disc size. There was no normalisation step in the pipeline. Now **D32** — likely the largest single source of false `introuvable` across 400 items.

One live OCR case also surfaced: the MAXX manual is a scanned PDF with no text layer, so extraction returns nothing. That's now an explicit outcome rather than a silent failure.

---

## 0i. What changed since v9

**No Tigrinya checker exists in the company** — nobody who reads Tigrinya also reads French well enough to verify a translation. That breaks the verification gate as written, and it generalises: §5.4 now requires a named checker per language, with Tigrinya verified by *comprehension testing* instead. See the separate **Tigrinya decision brief** for the management choice.

---

## 0j. What changed in v9

- **Manager approved**, including the safety rule in §11.
- **Pictogram list is a placeholder you fill in as you go** — agreed, with one safety caveat that changes how it's built. §7.5.
- **One or two workshop colleagues** available for capture (§5.7). That was the biggest open risk and it's now closed.
- All other open questions answered; §10 is now just the IT request and the things you'll learn by doing.

---

## 0k. What changed in v8

Your PowerShell output identified the infrastructure completely. **It is not a NAS** — it's a Windows Server, and that's better news than a NAS would have been.

| | Finding |
|---|---|
| **A** | **The server is called `SERVER`, in a Windows domain called `ENS`.** So `\\SERVER\secretariat` works today — the IP-change risk is solved with no IT request at all. §6.0. |
| **B** | **Port 443 is Altaro backup software, not a web server.** No IIS is running. Web hosting is not available today. The `file://` design stands as primary, exactly as built for. §6.0. |
| **C** | **Your files are probably already backed up.** Altaro is running on the machine holding the share. If `secretariat` is in its backup scope, the inventory inherits professional backup for free — worth one question to IT. §6.0. |
| **D** | **Kaspersky is intercepting TLS on your PC**, and is therefore also scanning files. That confirms a risk I had listed as theoretical: file locking during writes to the share. §6.4. |
| **E** | Carried from v7: cost settled at ≈$3 (§2.1), PPE pictograms (§7.5), consumable logging deferred (§4.6), and the safety consequence of you working in the office (§5.7). |

---

## 1. Decisions (source of truth)

| # | Decision |
|---|---|
| D1 | Guides are **AI-written from the official publication**. Source stored as **plain text, never a clickable link**. |
| D2 | Bulk capture runs **online** (free cloud tier). |
| D3 | Then: **read-only page for workers** + **separate admin page**. |
| D5 | Translations **pre-generated and stored**. |
| D6 | Bulk capture by **you + a few colleagues**. |
| D7 | Plain number labels; no QR *on items* for now. |
| D9 | Categories, locations, statuses are **user-managed lists**. |
| D10 | **7 languages**: **EN (source)**, FR, AR, DE, TI, PT, IT. |
| D11 | **Model + unit** structure. |
| D12 | 100–500 units, plus consumables. Distinct model count unknown — no longer matters (D26). |
| D13 | External AI approved. |
| D14 | **No inventory data in browser storage.** Exceptions: display language, folder permission token. |
| D15 | **Editing a guide must not rebuild the site.** |
| D16 | **A non-technical colleague must run this after you leave.** |
| D17 | **Admin is a plain HTML page**, writing via File System Access. No install. |
| D18 | **AI only during the bulk phase.** Nothing local, no key. |
| D19 | **"No mode d'emploi" is a normal state.** |
| D20 | **Three item shapes**: tracked units, quantity items, consumables. |
| D21 | **Status changes logged** with reporter name, reason, date/time. **No accounts.** |
| D22 | **QR codes** so workers take the manual to their own phone. |
| D23 | **Kiosk**: Edge `--app`, fullscreen, no browser visible. |
| D24 | Storage: **`\\SERVER\secretariat`** (10.0.0.10), Windows Server in domain `ENS`. SMB and write access confirmed. **No web server available** — 443 belongs to Altaro backup. |
| **D25** | **Dual-mode build**: identical files work from `file://` and over HTTP. No rewrite to switch. |
| **D26** | **Cost is not a constraint.** Token pack covers everything. |
| **D27** | **PPE and safety pictograms** on every relevant item. The set starts small and **grows as you learn what's needed** — it's an editable list, not code (§7.5). |
| **D28** | Consumables: **names and quantities only, no photos.** Movement logging decided *after* the list exists. |
| **D29** | No breakdown-contact needed on the worker page — small company, everyone knows. |
| **D30** | **"No pictogram shown" must never mean "no protection needed."** An unreviewed item says *"équipement de protection à définir"*, not nothing. §7.5. |
| **D31** | **Every language has a named checker or is labelled unverified.** Tigrinya has none available — verified by *comprehension testing* instead (§5.4). Pictograms, not text, carry safety for unverified languages. |
| **D32** | **Model numbers are normalised before searching.** Hand-typed stickers produce spacing, case, suffix and spec-vs-model errors; without this step they become false `introuvable`. |
| **D33** | **Two accepted source tiers.** Manufacturer sites *and* manual aggregators are accepted; the tier and source are shown to the reader. Forums and shop listings are rejected. |
| **D34** | **The model returns ONE JSON object against a fixed schema — never files.** Our code writes the files. Format inconsistency is designed out, not prompted against. |
| **D35** | **Every language without a human checker is verified independently.** For **Tigrinya**: a *second engine* (Google Cloud Translation, which supports `ti`) translates in parallel and the two are compared — cross-engine agreement, not self-back-translation. For other unverified languages: back-translation by a different model. Self-checking is the weakest verification and the P0.2 run proved it. |
| **D39** | **DeepL is not adopted for production translation** — it does not support Tigrinya, and its free 1M is a lifetime allocation (~80 machines), not monthly. It is used once, as a **calibration audit** of the European languages. See `translation-engine-note.md`. |
| **D40** | **Arabic has a named checker: you.** That settles Arabic without an engine change and is stronger than any automated check. |
| **D41** | **Literal translation is kept for instructions; terminology is fixed with a glossary, not by loosening the prompt.** Telling the model to "be more natural" would degrade the exact rendering of *don't* that makes instructions safe. A growing term list (`data/glossaire.js`) targets naming only. |
| **D42** | **Search indexes synonyms; display shows the idiomatic term.** Each model carries `search_terms` per language, so a worker finds the item whether they type the trade term or the literal one. |
| **D43** | **Prefer NATIVE SOURCING over translation.** Where the manufacturer publishes in a language we need, the guide is written **from their own text in that language**. Two patterns, both confirmed: **(A) one multilingual PDF** with a section per language (DeWalt: 160 pages, English on 32–42) and **(B) one manual per locale** (Husqvarna: `be-fr` gives a 112-page French manual; `ca-en` the English one). Pattern B is found by **swapping the locale in the URL**, which is systematic and scriptable. Manufacturer wording is legally vetted, uses correct trade terminology, and cannot contain a translation error. |
| **D44** | **Four trust tiers per language**, shown to the reader: `native` (from the manufacturer's own text) > `verified` (translated, checked by a named person) > `cross-checked` (two engines agree) > `auto` (unverified machine translation). |
| **D45** | **A locale swap counts as native only if the file actually differs.** HTTP 200 does not mean a different manual — Bosch and Einhell serve byte-identical PDFs across every locale. Verify by size/hash **and** by detecting the language of the extracted text. Without this the pipeline would label an English document as `native` French. |
| **D46** | **Model slugs are market-specific; a 404 means "search this locale", not "no manual".** `/de/beratung/115ihd45/` resolves while `/fr/assistance/115ihd45/` 404s, and the support path word is itself translated (assistance / beratung / supporto / suporte). A locale swap is a search, not a string substitution. |
| **D47** | **Everything deterministic is code, not the model.** Search, fetch, PDF extraction, page-range detection, language detection, file hashing, script validation, ID assignment and file writing are all code. The model only writes prose from supplied text. Variance can only occur where a decision is delegated — so almost nothing is. |
| **D48** | **Output shape is enforced by `response_format: json_schema`, then validated in code, then repaired, then failed loudly.** Probed 20 Aug: schema mode works; **`tool_choice` forcing does NOT — 2 of 3 calls ignored it** — so forced tool calls are never relied on. `temperature: 0` is set but is **not deterministic** on this provider. Nothing is written unless it validates; a failed item stays `pending` and appears on the dashboard. |
| **D49** | **Arabic is sourced natively where the manual contains it** (the Bosch does). Manufacturer-grade Arabic, `native` tier, and less review work — same rule as the European languages. |
| **D50** | **Every model call carries three independent stops: `max_tokens`, a client timeout, and a job timeout.** A prompt/schema conflict made LongCat hang rather than fail — and a hung job blocks the queue until the free-plan message expires and the item vanishes silently. Hitting any stop is a normal `failed` outcome, recorded and visible. **Never an infinite wait.** |
| **D51** | **`max_tokens` budgets reasoning + output, and `finish_reason:"length"` is its own failure class.** LongCat spent 199 of a 200-token budget on reasoning and emitted no content at all — the `content` key was absent, not empty. Budget ~2 500–3 000 per guide; a length failure retries with a doubled budget rather than entering the repair loop, since repairing text that was never generated is meaningless. Parsers must tolerate a missing `content` key. |
| **D52** | **Constrain values in the schema, not just shape.** `json_schema` is proven to be constrained decoding — the model tried to emit a forbidden field and could not — so enums (`manual_state`, `epi` ids, `epi_source`), required section keys and Unicode-range patterns go INTO the schema. Invented categories and the P0.2 Latin-script Tigrinya failure become unrepresentable. Code checks stay as backup, since a loosened pattern would otherwise silently give up the guarantee. |
| **D36** | **Script validation.** Output must fall in the expected Unicode block — Ge'ez for Tigrinya, Arabic for Arabic. Latin transliteration is auto-rejected, never published. |
| **D37** | **A failed back-translation is never auto-fixed by the same model.** It is flagged. A self-detected, self-corrected, unverified fix is not a verified translation. |
| **D38** | **Search tries model families** (STIHL FS 81/86/106 share one manual), **appends "pdf"/"download"**, and **evaluates several candidates** rather than taking the first result. |

---

## 2. The AI side (Phase A only)

**LongCat 2.0 is text-only, no built-in web search.** You type the model number, so no vision needed; but the pipeline needs its own search **and** a fetch/extract step — real 40-page manufacturer PDFs, sometimes scanned and needing OCR. That step remains the fragile one.

```
brand + model n°
   → [NORMALISE]      candidate spellings + model families        (D32/D38)
   → [SEARCH]         "... user manual pdf|download", several candidates
   → [FETCH+EXTRACT]  download page/PDF, extract text        ← fragile
   → [NATIVE HUNT]    multilingual sections + locale-swapped manuals (D43)
   → [LongCat]        write the guide in ENGLISH, from that text only
   → [LongCat] ×n     NATIVE where the manual has the language;
                      translate only what is missing (usually just TI)
   → [2nd ENGINE]     Google `ti` in parallel; compare, don't self-check (D35)
   → [VALIDATE]       correct script? flagged errors? JSON?   (D36/D37/D34)
```

**English as source** is right — manuals are richest in English. Trade-off: French is now translation #1 rather than the original, so it's the language to review first, being the one you can judge.

### 2.1 Cost, with your token pack

$1.80 for 50M tokens with **cache hits free** changes the picture completely.

| | |
|---|---|
| Estimated need | ~350 models × (~30k in + ~9k out across 7 languages) ≈ **15–20M tokens** |
| Covered by | the pack you already have, with over half left |
| Web search (separate) | ~$0.007 × models needing a manual ≈ **$1–2** |
| **Total project cost** | **≈ $3**, most already spent |

Two consequences worth acting on:

- **Feed whole manuals, not excerpts.** Truncating input was a cost optimisation; it isn't needed, and full context gives better guides.
- **Structure prompts so the fixed instructions come first**, identical across every call, so they hit the free cache. The variable part (the manual text) goes last.

Cost is now a non-issue. **Quality control is the only real constraint.**

---

## 3. Architecture

```
PHASE A — ONLINE (temporary)      PHASE B — LOCAL (permanent, no AI, no cloud)
┌────────────────────────┐        ┌──────────────────────────────────────┐
│ Phone web app          │        │  \\SERVER\inventaire\                │
│ photo + type + model n°│        │   Inventaire.html      ← workers     │
└──────────┬─────────────┘        │   Administration.html  ← you         │
           │                      │   data/ photos/ manuels/ pictos/     │
┌──────────▼─────────────┐ EXPORT └──────────────────────────────────────┘
│ Cloud: DB + AI queue   │ ─────►   ▲ read-only     ▲ writes
└────────────────────────┘          kiosk: Edge --app, fullscreen
   archived, not deleted             ↑ inside the existing Altaro backup
```

---

## 4. Data model

### 4.1 Three item shapes (D20)

Two independent settings per model rather than three rigid types:

| Example | `suivi` | `mouvements` | Result |
|---|---|---|---|
| Tondeuse, écran, perceuse | `unites` | — | `TONDEUSE-002`, own status and history |
| 15 brosses identiques | `quantite` | `non` | One entry, counts per location |
| Gants, vis, huile | `quantite` | *later* (§4.6) | Counts per location |

Adding a 16th brush edits a number. Adding a third mower creates a record with its own service history.

### 4.2 Fields

**MODEL** — `model_id`, `type`, `brand`, `model_number`, `category`, `photo`, `photo_plaque`, `source_ref`, `source_url`, `epi[]`, `dangers[]`, **`epi_confirme`** (§7.5, D30), `safety_flag`, `manual_state`, `suivi`, `mouvements`, `versions[]`, plus:

```
names:        { en, fr, ar, de, ti, pt, it }          ← idiomatic term, displayed
search_terms: { ar: ["بطارية جافة", "بطارية بدون صيانة"], … }  ← both, indexed
guides:       { en: { text, status, verified_by, verified_at, edited_by, edited_at }, … }
```

**Why `search_terms` exists (D42).** Translation of *instructions* is reliably literal, which is exactly what we want — "don't" comes out as "don't". But *names* come out literal too, and the literal name is often not the trade term: a maintenance-free battery is known in Arabic as a **dry battery**, not "a battery without maintenance". Displaying the literal name is a minor oddity; **indexing only the literal name breaks search**, because the worker types what they actually call it. So the display name is idiomatic and the index holds both.

**UNIT** — `unit_id`, `model_id`, `photo`, `location`, `status`, `notes`, `historique[]`.
**STOCK** — counts per location `{ Atelier: 10, "Camionnette 2": 5 }`, plus `mouvements[]` if enabled later.

### 4.3 IDs and lists

`TYPE-NNN` → `ECRAN-005`, **assigned by the server at submit time** (two colleagues capturing at once would otherwise both get `ECRAN-005`).

**Category** = what kind of thing (on the model). **Location** = where it is now (on the unit or the count). Both editable lists, never free-typed.

### 4.4 The "no mode d'emploi" states (D19)

| State | Worker sees | Admin |
|---|---|---|
| `disponible` | The guide | — |
| `sans_objet` — no manual needed | *"Ne nécessite pas de mode d'emploi."* | **Done.** Never on the to-do list |
| `introuvable` — searched, nothing found | *"Mode d'emploi non disponible."* + photo, brand, model | Optional: write one, or scan the paper manual |
| `a_rediger` — needed, not written | Same calm message | On the to-do list |

A brush with no manual is **finished**, not incomplete. Default `sans_objet` for whole categories, so you tick nothing.

### 4.5 Status and history (D21)

Changing status opens a small form: new status, **signalé par** (free text — no accounts), reason, and the date/time is recorded automatically. Appended to the unit's history, never overwritten.

**Workers see the current status and its reason**: a red band reading *"HORS SERVICE — Le moteur ne démarre plus"*. Someone walking to fetch a machine learns it's broken from the screen instead of from the machine.

Reporting stays human — worker tells supervisor, supervisor tells you, you record it (D29).

### 4.6 Consumable movements — deferred, deliberately (D28)

You said nobody can answer which consumables matter until the listing exists. That's correct, and it's also the right sequencing:

- **Phase A captures** names, quantities and locations. No photos (D28). Fast.
- **After the list exists**, you look at it and tick which items deserve a movement log. Probably ten, not two hundred.
- **Then** logging is switched on for those, with an opening `Inventaire initial` entry.

This removes an unanswerable question from the critical path instead of guessing at it now. The data model already carries the flag, so switching it on later costs nothing.

**The warning still stands for when you get there.** A stock number is only as good as its worst week; once it's wrong twice, people stop believing it, and then it's worse than nothing because it looks authoritative. Track few things, use a paper sheet by the cupboard entered weekly, and always display *"dernier mouvement il y a 3 jours"* so a stale number admits it.

---

## 5. Phase A — online capture

### 5.1 Hosting

**Cloudflare Workers + D1 + R2 + Queues + Access.** Free tier fits, **doesn't auto-pause** (Supabase's sleeps after ~a week). Email-code login for colleagues. Nothing to install.

**Trap:** free-plan queued messages expire after 24 hours. Models carry a `pending` state in the database with a daily re-queue sweep. The queue is a convenience; the database is the truth.

### 5.2 Capture flow

1. Pick **type** → provisional number; real ID assigned on submit.
2. Shape: **appareil suivi** / **quantité** / **consommable**, pre-set per category.
3. **Two photos**: the item, and the nameplate close-up — the second is what lets you fix a bad guide months later without walking back to the machine. *(Consumables: no photo, D28.)*
4. **Brand + model number**, or tick **"pas besoin de mode d'emploi"** and skip the AI. Most hand tools take this path.
5. Known model → "unit #5 of a known model", seconds, no AI.
6. Category, location, counts, **and PPE pictograms** (§7.5).
7. Submit → saved immediately, AI queued. **You never wait.**

Submissions queue on the phone when the network drops.

### 5.3 The AI job

```
0. NORMALISE the model number and generate 3-5 candidate spellings  ← NEW, D32
     "KT-AS18LI" → "KT-AS 18 Li";  drop regional suffixes (-QS, -QX);
     reject specs typed as models (M14 = spindle thread, not a model)
1. search "<brand> <model> user manual" — in EN, DE and FR
2. classify the source by tier (D33):
     tier 1 = manufacturer's own site      → accept
     tier 2 = manual aggregator / dealer   → accept, label the source
     tier 3 = forum, shop listing, blog    → reject
     nothing → manual_state = introuvable, STOP. Nothing invented.
3. download page/PDF, extract text (OCR if scanned)
     scanned with no text layer → say so; never describe an unread manual — full text, not excerpts
4. FIND NATIVE-LANGUAGE SOURCES — two patterns, both real     (D43)
     A) multilingual PDF  → detect which languages are inside
                            (DeWalt: 160 pages, EN on 32-42)
     B) per-locale manual → search that locale (slug differs! D46)
                            husqvarna.com/fr/assistance/... etc.
                            VERIFY the file actually differs (D45) —
                            Bosch and Einhell return 200 with the SAME pdf
5. LongCat writes the EN guide FROM THAT TEXT ONLY:
     What it's for · Safety before use · Starting up ·
     Normal use · Shutting down and storing · Common problems
   and PROPOSES the PPE pictograms it finds in the manual
6. FOR EACH of FR/DE/IT/PT/AR:
     native source found → write the guide FROM IT
                           (manufacturer's own wording, tier `native`)
     none found          → translate from English (tier `auto`)
7. TIGRINYA is never in the manual → always translated, always
     cross-checked against a second engine
8. VERIFY every language lacking a human checker (D35):
     Tigrinya  → second engine (Google `ti`) translates in parallel;
                 compare. Agreement = confidence. Disagreement = flag.
     others    → back-translation by a different model
     Errors are flagged, never auto-fixed (D37)
9. VALIDATE THE SCRIPT — Ge'ez for TI, Arabic for AR. Latin
     transliteration is rejected outright (D36)
10. return ONE JSON object; our code writes the files (D34)
11. store all seven + source_ref (text) + source_url (QR)
```

`introuvable` is a **successful outcome**, expected on old machines and no-name tools.

**Anti-hallucination is the core risk.** No source → no guide, ever. Source reference always visible. `safety_flag` items stay in draft until a human approves.

### 5.4 Translation quality and verification (D31)

Review **French first** — it's the one you can judge, and if the French is wrong the English probably is too.

**Every language needs a named checker, or it is labelled unverified.** This was implicit before and it shouldn't be:

| Language | Checker | If none |
|---|---|---|
| EN | source | — |
| FR | you | — |
| DE, IT, PT, AR | a colleague who reads it | mark *traduction automatique* |
| **TI** | **nobody available** | see below |

**Tigrinya has no possible in-house checker** — no one who reads Tigrinya also reads French well enough to compare. That is exactly the case where machine translation carries the most risk, because the error is undetectable internally.

**The resolution: verify comprehension, not translation.** You cannot ask "does this match the French?" — nobody can answer. You *can* ask a Tigrinya-speaking worker: *"read this, then show me how you'd start this machine."* If what they do is right, the translation worked. No French needed, no translator, ten minutes at the machine. It is also the better test — a translation can be faithful and still incomprehensible.

Two checks that need no Tigrinya speaker at all: **back-translation** (Tigrinya → English with a *different* model, compared to the source — catches dropped negations and inverted instructions automatically, for almost nothing), and **paid human translation for the ~15 dangerous machines only**, which puts verified text exactly where the risk is.

**Consequences, which apply to any unverified language and not just Tigrinya:**

- **Pictograms carry the safety load, not the text** (§7.5). This is now the primary safety channel for any language we can't verify.
- **Unverified languages are visibly labelled** in the interface. A worker who sees *traduction automatique* calibrates their trust; one who sees nothing assumes it's official.
- **A permanent banner in every language**: *"Ce guide complète la formation. Il ne la remplace pas."* The single most useful sentence in the system.
- For `safety_flag` machines in an unverified language, the option is to show **pictograms and "formation obligatoire" instead of translated text**.

The choice between those approaches is a management decision, not a technical one — see the separate Tigrinya decision brief.

### 5.5 The glossary — how terminology fixes itself (D41)

Your Arabic review surfaced the pattern: instructions translate **exactly**, which is what keeps them safe, but names translate **literally**, which is not how the trade speaks. *Maintenance-free battery* becomes "battery without maintenance" instead of the **dry battery** every mechanic actually says.

**The wrong fix** is telling the model to translate more naturally. That looseness would reach the instructions too, where literal rendering of "do not" is precisely the property P0.2 showed we cannot afford to lose. Fixing naming must not cost fidelity.

**The right fix** is targeted, and uses the human already in the loop:

```
data/glossaire.js
  ar: { "maintenance-free battery": "بطارية جافة",
        "angle grinder":            "…"            }
  fr: { … }
```

1. While reviewing, you hit a term rendered literally.
2. You correct it and click **"ajouter au glossaire"**.
3. Every later translation receives the glossary in its prompt and uses your term.
4. The literal form is kept as a `search_term`, so either wording finds the item (D42).

The useful property is that it **converges**. Workshop vocabulary is small and repetitive — a few dozen terms cover nearly everything. After twenty or thirty reviewed items the glossary is doing the work and later items arrive correct. The effort is front-loaded onto items you were reviewing anyway.

It generalises too: the same file serves French, and it's the only realistic route to fixing Tigrinya terminology if a speaker flags a word during the comprehension test.

### 5.6 The bulk phase carries everything

No existing list at all, and no AI afterwards. So: **capture wide** (a model marked `a_rediger` costs seconds; a second trip costs an hour), **don't rush the review** while the retranslate button still exists, and **archive the cloud project rather than delete it** — dormant it costs nothing, and reviving it for an afternoon in two years beats writing ninety translations by hand.

### 5.7 You work in the office — plan around it

You said it yourself, and it has one real consequence: **you cannot be the person who decides which machines are dangerous.**

PPE selection, `safety_flag`, and judging whether an AI-written guide matches how a machine is actually used all need someone who uses them. The AI proposing "gants + lunettes" from a manual is a starting point, not an authority.

So: **pair with a workshop colleague for the capture phase** — you have one or two available, which closes this. They don't need to do the typing; they need to be standing there saying "that one needs gloves and goggles" and "that guide is wrong, nobody starts it that way". Half a day of their time. This is the cheapest risk reduction in the whole project, and skipping it is how a wrong instruction reaches a saw.

---

## 6. Phase B — the local system

### 6.0 What the infrastructure actually is (D24)

Your PowerShell output answers this completely. It's **not a NAS**:

| Evidence | Meaning |
|---|---|
| Reverse DNS → `SERVER`; NetBIOS `ENS <1B>` (Domain Master Browser) | A **Windows Server** named `SERVER`, in a domain called `ENS`, and it's the domain's master browser — so almost certainly the domain controller. |
| `Server: Microsoft-HTTPAPI/2.0`, not `Microsoft-IIS` | The response comes from Windows' kernel HTTP stack, used by applications that self-host. **IIS is not running.** Port 80 closed confirms it. |
| Certificate `CN=altaro-apb` | **Altaro backup** (now Hornetsecurity) — its console uses a self-signed certificate exactly like this, and `apb` matches Altaro Physical Server Backup. Port 443 belongs to the backup software. |
| Issuer `Kaspersky Endpoint Security Personal CA` | **Kaspersky on your PC is intercepting TLS** and re-signing certificates. Tells us nothing about the server, but a lot about your workstation — see §6.4. |
| 5000/5001/8080/8081/9000/9090 all closed | No NAS management interface. Confirms it's a plain Windows Server. |

**Three consequences, two of them good.**

**1. Use `\\SERVER\secretariat`, not the IP.** Reverse DNS resolves, so the name works today. That removes the "every shortcut breaks if the IP changes" risk with **no IT request at all** — just verify `\\SERVER\secretariat` opens in Explorer and use it everywhere from the start.

**2. Your data is probably already backed up.** Altaro is running on the machine that holds the share. If `secretariat` is in its backup scope, the inventory inherits real backup — versioned, off-machine, professionally managed — for free. That's better protection than anything we'd have built, and it's worth **one question to IT**: *"is the secretariat share included in the Altaro backup?"* If yes, say so in `LISEZ-MOI.txt`, because a successor should know the folder is protected.

**3. No web serving today, and that's fine.** 443 is taken, IIS isn't installed. The `file://` design was built for exactly this and needs no change. If you ever want the tablet or local QR targets, the path is: IT installs IIS with a virtual directory on a spare port (8081, say) pointing at the inventory folder. Because of §6.1 that's a copy operation, not a rewrite. **Don't ask for it now** — it buys nothing you need today and spends goodwill you'll want for the share request.

**The one real IT request:** a separate share, **`\\SERVER\inventaire`**, readable by all staff and writable by you. `secretariat` presumably holds office documents the workshop shouldn't see, and the workshop PC may have no access at all. On a Windows domain this is five minutes of a standard admin's time, and it's an easier conversation than widening access to the secretariat's folder — better for them too.

Two optional extras worth mentioning while you have IT's attention, both cheap on a domain: **Group Policy can deploy the kiosk shortcut** (§7.3) to workshop PCs automatically, and they can confirm the backup scope in the same breath.

### 6.1 Dual-mode build (D25)

The design must not have to change if the answer to §6.0 turns out to be yes — or if it's yes in a year. So these are build rules from day one:

- **Relative paths only.** No drive letters, no absolute URLs, nothing that assumes where the folder sits.
- **`.js` data format** (§6.3) — works identically from disk and over HTTP.
- **No JavaScript modules, no bundler** — blocked from disk, and unnecessary anyway.
- **Fonts embedded in the stylesheet** — the one thing that genuinely differs between the two modes, solved once for both.
- **No server-side anything.** No PHP, no database, no build step.

Result: if IT ever adds IIS on a spare port (§6.0), enabling it is copying the folder into a web root. Nothing is rewritten, nothing is migrated.

### 6.2 What lands on the disk

```
\\SERVER\inventaire\
├── Inventaire.html          ← workers. Read-only. Launched by shortcut
├── Administration.html      ← you. Writes to the folder.
├── Inventaire.lnk           ← the ready-made kiosk shortcut
├── LISEZ-MOI.txt            ← French, plain language, for your successor
├── data/
│   ├── index.js             ← light catalogue + all 7 names (~300 KB)
│   ├── categories.js  statuts.js  emplacements.js  epi.js
│   ├── unites.js  stock.js
│   └── modeles/M-0042.js    ← one file per model: 7 languages + history
├── photos/   manuels/   pictos/   _sauvegardes/
```

No config file, no key, nothing to protect — D18 removed the only secret this system had.

### 6.3 Small files, and why `.js`

Combined, the text would be ~10 MB (350 models × 7 languages) — slow on an old PC and rewritten across the network on every edit. Instead `index.js` powers search instantly and each model loads on demand. **Editing a guide rewrites one ~30 KB file** (D15); the index is touched only when something *in it* changes.

A page opened from disk **cannot read a JSON file** — every local file is its own origin and the read is blocked. It *can* load a `<script>`. So data files are `window.INVENTAIRE_xxx = { … }` with readable JSON inside. Three notes for `LISEZ-MOI.txt`: plain scripts only (modules fail silently); a missing file must show *"Fiche introuvable — prévenir l'administrateur"*, never a blank guide; and **fonts follow the blocked path too**, so Noto Sans Ethiopic and Noto Naskh Arabic are embedded *inside* the stylesheet — otherwise Tigrinya is empty boxes.

### 6.4 How an edit reaches workers (D15)

Write `M-0042.tmp` → rename over `M-0042.js` → copy the old version to `_sauvegardes/`. Worker refreshes, sees the new text. No rebuild.

**The Kaspersky finding makes this matter more than it did.** Rename-over-existing is best-effort on a network share at the best of times, and on-access antivirus scanning is the classic cause of "the file is in use by another process" at exactly the wrong moment. Kaspersky is confirmed present on your machine. So: write, rename, **retry with a short backoff**, read back, verify the content — and if verification fails, say so loudly rather than reporting a save that didn't happen. This is a small amount of code that prevents the one failure mode that would silently lose an edit.

Worth testing during step 1: save the same guide twenty times in a row and confirm twenty clean verifications.

### 6.5 The admin page (D17)

**One file on the share. Double-click it.** Asks once for folder permission, then writes directly. The browser can remember the grant.

Three things to confirm in step 1 — differences between your machine and the workshop's, not doubts about your experience:

1. **From `\\SERVER\…`, not `S:`.** You tested on a local drive; a UNC path is a different case and needs one real test.
2. **Chrome or Edge only.** Workers unaffected — the read-only page works everywhere.
3. **If browser data is cleared, the folder must be picked again.** `LISEZ-MOI.txt` needs the line: *"S'il demande le dossier, choisir le dossier `inventaire`."*

On D14: the folder permission is a token in browser storage — a key to the door, nothing behind it.

### 6.6 Making it survive you (D16)

Double-click launch, no terminal, no account, no key. A startup health check in French (*"Dossier accessible ✓ · 412 appareils · 8 fiches à rédiger · Dernière sauvegarde: hier 18:04"*). Automatic dated backups on every save with one-click restore. `LISEZ-MOI.txt`, a printed two-page sheet, and a short screen recording of the three things a successor will actually need to do. **Nothing expires** — no subscription, no key, no renewal.

### 6.7 Writing and editing guides by hand (D18)

Template pre-fills the six headings so a new machine means filling boxes, not facing a blank page. **"Copier pour traduction" / "Coller la traduction"** moves text to DeepL or ChatGPT and back — no API, no key, no cost, works forever, and it's what decides whether seven languages stay maintained. Untranslated is not broken: *"Pas encore disponible en ትግርኛ"* with the French underneath. Full history, restorable in one click.

---

## 7. Interface

### 7.1 Worker page

Realistic user: standing at a shared PC, mouse and keyboard, not reading French comfortably, looking for one thing.

- **Photo-first.** Someone who doesn't know the word "meuleuse" recognises the picture.
- **Two clicks maximum** to a guide.
- **One search box**, matching ID, name, brand and model **in all seven languages**, typo-tolerant, and matching **trade synonyms as well as literal names** (D42).
- **Status band** at the top — green *en service*, red *hors service* with the reason.
- **PPE pictograms** immediately below (§7.5).
- **Language switcher: endonyms, not flags** — `العربية`, `ትግርኛ`, `Português`. Flags are wrong for languages and politically loaded. Mirrored left for RTL.
- **Full RTL mirroring for Arabic** — layout, arrows, alignment.
- **Fonts embedded** so Arabic and Tigrinya render anywhere.
- **Every item shows something useful**, guide or not.
- **Plain words; icons always paired with text.**
- **Print button** — one page, chosen language, to tape next to a machine.
- **French default**, remembered per PC. **Generous targets (~1.5 cm)** so a tablet costs nothing later.

### 7.2 Admin page

One obvious primary action per screen, in French. Explicit save feedback (*"Enregistré sur le disque · 14:32"*). Errors prevented not reported — duplicate model numbers flagged as you type, IDs automatic, lists picked never typed. Destructive actions confirmed by name, always reversible. A dashboard on opening: fiches `a_rediger`, unverified languages, units with no location, items missing PPE data.

### 7.3 Kiosk (D23)

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    --app="\\SERVER\inventaire\Inventaire.html"
```

`--app` already removes address bar, tabs and back button; F11 is belt-and-braces.

- **Ship `Inventaire.lnk` on the share** so deploying to a new PC is copy-paste, and document it. On a domain, Group Policy can push it automatically — worth asking IT (§6.0).
- **`\\SERVER\…`, never a drive letter or an IP.** `S:` may be mapped differently on another PC, or not at all; the name resolves everywhere and survives an IP change.
- **Idle reset**: after ~3 minutes without input, return home and reset to French. Otherwise the next worker finds it mid-search in a language they don't read — the most common kiosk annoyance and the easiest to prevent.
- **No external links anywhere** (D1), so there is nothing to navigate away to.

### 7.4 QR codes (D22)

The item page shows a QR next to the manual. Never a clickable link, never opens on the kiosk. The worker scans it with their **own phone** and reads the manufacturer's PDF there — zoomable, in their own time, and they keep it.

Generated **inside the page** by a small embedded library. No internet to draw it, no external service, nothing to expire.

**Target, now settled by §6.0:** there is no web server, so the QR carries **the manufacturer's official URL**. It works on mobile data, needs nothing from the company, and is available today.

Its weakness is link rot — manufacturer sites reorganise, and some of these URLs won't survive five years. Two things blunt that: we **store the PDF locally too** (`manuels/`), so the content isn't lost even when the link dies, and the QR target is a single field per model, so if IIS ever appears (§6.0) switching every QR to a local address is a one-line change plus a regeneration. Same mechanism carries item labels later (D7) with no redesign.

### 7.5 PPE and safety pictograms (D27) — new

This is the highest-value feature for your specific workforce, and it's worth saying why: **a pictogram works for someone who reads no language at all.** Seven translations help a worker who reads one of seven languages. A blue circle showing goggles helps everyone, including someone whose language you don't have and someone who can't read.

- **Standard shapes, matching physical signage.** Blue circles for mandatory PPE, yellow triangles for hazards. Workers already recognise these from real signs — inventing our own icons would waste that recognition. Licensing: many ISO 7010 vector files are freely licensed but it varies per file, so we check before including, and draw simple equivalents in the same visual language if needed.
- **Shown large, at the top of the item page**, above the guide — before any text, because for some readers it *is* the content.
- **Hover or tap gives the text label** in the chosen language, so the pictogram teaches itself.
- **On the print sheet too**, so the paper taped next to the machine carries the same information.

**Starting set, and growing it (D27).** You don't know yet which ones you'll need, and you shouldn't have to — the list is **data, like categories**, in `data/epi.js`. Adding one later is a data edit, not a redesign. So we start with the eight that cover most workshops — gloves, eye protection, ear protection, head, foot, respiratory, hi-vis, face shield — plus four common hazards — noise, hot surface, moving parts, electrical. You add whatever the real machines turn out to need, while you're standing in front of them. That's the right way round.

**The one caveat, and it's a safety one (D30).** An empty pictogram row is ambiguous: it can mean *"we checked, nothing special needed"* or *"nobody has looked at this yet"* — and a worker will read it as the first. So the model carries two things, not one: the list, and whether a human has confirmed it.

| State | Worker sees |
|---|---|
| Confirmed, PPE required | The pictograms |
| Confirmed, none needed | *"Aucun équipement de protection particulier."* |
| **Not yet reviewed** | *"Équipement de protection à définir — demander au responsable."* |

That third row is the whole point. It costs one field, it turns an invisible gap into a visible to-do on your dashboard, and it means the placeholder approach is safe rather than merely convenient.

Deliberately kept small. Twenty pictograms people recognise beat sixty they have to decode.

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| AI invents an instruction on a dangerous machine | injury | no source → no guide; `safety_flag` approved by someone who uses it (§5.7) |
| PPE decided by someone who doesn't use the machines | wrong safety info | workshop colleague pairs on capture and reviews (§5.7) |
| Fetch/extract fails on real manufacturer PDFs | few guides | tested first, step 1 |
| Tigrinya quality | workers misled | native spot-check; per-language badge; easy correction |
| Fonts don't load from disk | Tigrinya unreadable | embedded in the stylesheet |
| Folder access blocked from the UNC share | admin can't write | one real test, step 1 |
| **Antivirus locks a file mid-save** (Kaspersky confirmed present) | an edit silently lost | write-rename-retry-verify, loudly on failure (§6.4); 20× save test in step 1 |
| Workers can't read the `secretariat` share | nobody can open it | the one IT request: a separate `inventaire` share (§6.0) |
| Manufacturer URLs rot | QR codes stop working | PDF also stored locally; QR target is one field, switchable later |
| Server IP changes | — | **solved**: use `\\SERVER\…`, which resolves today |
| Seven languages maintained by hand | translations rot | template + copy-for-translation; French fallback always shown |
| Bulk phase under-captured | expensive manual work later | capture wide; archive the cloud |
| Queued AI jobs expire after 24h | items silently guideless | `pending` state + daily re-queue |
| Duplicate IDs during parallel capture | two items, one number | server-assigned IDs |
| Kiosk left mid-search in Tigrinya | next worker confused | idle reset to home + French |
| Stock log not maintained (if enabled later) | trust lost | deferred until the list exists (§4.6) |

---

## 9. Plan

| Step | What | Output |
|---|---|---|
| 0 | One IT request (§6.0), manager reviews §11 | frozen scope |
| 1 | **Spike** — 10 real items end to end, *plus* four local checks on a work PC: folder access from `\\SERVER\…`, font rendering, caching, and the 20× save test (§6.4) | proof guides, Tigrinya and the local page all work. **Go / no-go.** |
| 2 | Capture app + AI pipeline | working URL on your phone |
| 3 | Pilot: 20 items in one area, **with your workshop colleague** | validates IDs, photos, PPE, review workload |
| 4 | Bulk capture | full database |
| 5 | Export + worker page + fonts + languages + QR + pictograms + kiosk shortcut | local site on the NAS |
| 6 | Admin page + backups + LISEZ-MOI | steady state, disk-only, no AI |
| 7 | Workshop test with 2–3 real workers, at least one non-French speaker | usability fixes |
| 8 | *(later, optional)* consumable movement logging, tablet, web serving | as needed |

---

## 10. Open questions

Everything is answered. What remains is one request and three things you'll only learn by doing.

**Outstanding — asking tomorrow:**

1. **The IT request** (§6.0): a share `\\SERVER\inventaire`, readable by all staff, writable by you. Two free questions while you're there: *is it in the Altaro backup?* and *can Group Policy push the kiosk shortcut to the workshop PCs?*
   *Blocks step 5, not step 1.*

**Answered by doing, not by deciding:**

2. **Which pictograms you actually need** — filled in while standing in front of the machines (§7.5).
3. **Which consumables deserve a movement log** — decided once the list exists (§4.6).
4. **How many distinct models there are** — you'll know after the first area. Cost doesn't care (§2.1).

**Confirmed:** `\\SERVER\secretariat` opens. One or two workshop colleagues available. Manager approved, including the safety rule.

---

## 11. For your manager — **approved 19 Aug 2026**

- **What it is.** A photographed catalogue of every machine, tool and item at work, each with a mode d'emploi in seven languages and standard safety pictograms, searchable by workers on a workshop PC.
- **Where it lives.** In a shared folder on the company's own server. After setup: no subscription, no external service, no password, no account. A folder that keeps working. If that folder is inside the existing Altaro backup, it is protected by the backup the company already pays for — no new arrangement needed.
- **What it costs.** Roughly **$3 in total**, for AI-generated manuals during the initial cataloguing. Most of it is already paid. Nothing afterwards.
- **What it doesn't do.** Not a maintenance system, not a purchasing system. Stock movement tracking is deliberately postponed until the item list exists.
- **What it needs from the company.** One half-day from someone who works with the machines, to confirm safety information (§5.7). And a small IT request: a shared folder readable by everyone.
- **The approved safety rule.** Guides are AI-written from official manufacturer manuals. **Where no official manual is found, no guide is produced** — never an invented one. For machines where a wrong instruction could injure someone, a person who uses that machine approves the text before it is published. Protective-equipment pictograms are never left blank by default: an unreviewed machine says *"à définir"* rather than showing nothing (§7.5).


### D58 — `introuvable` tells the worker who to ask

When no manual can be sourced, the worker page does not show an empty
guide or a silent gap. It shows: **"Mode d'emploi non disponible ici.
Demandez-le à votre responsable. Nous en avons une version papier."**
followed by the brand, model number and unit ID in a large bordered box.

The box is the payload — a worker photographs it or reads it out. The
company holds paper manuals for several machines (DeWalt confirmed), so
this is a true and actionable instruction, not an apology.

The four strings are **human-translated once and never machine-generated**.
They appear exactly where the system has nothing else to offer, including on
dangerous machines, where "ask your manager" failing to land is the
difference between asking and guessing. Full text: `spec/strings-fallback.md`.

This makes `introuvable` (D19) a *useful* terminal state rather than a dead
end, and keeps it clearly distinct from `sans_objet`, which must never nag.


### D67 — Tigrinya cancelled (8 Sep 2026, manager decision — option C)

No Tigrinya guides, no Tigrinya fallback strings, no Google Cloud
Translation key, no cross-engine check stage. `TARGET_LANGS` already
excluded `ti`, so no pipeline change is needed; the `ti` entries seeded in
`epi.noms` are harmless and stay.

Languages are now six: **fr · en · de · it · pt · ar.**

What this does NOT change, from the Tigrinya brief: the employer's duty to
inform and train is discharged through training, not through this tool, and
removing a language removes a help, not the duty. For Tigrinya-speaking
workers the **pictogram channel is now the only thing the tool gives them**,
which makes the P2 pictogram review — does the workshop colleague agree with
the PPE and hazard icons on every dangerous machine? — the one safety review
that covers everyone.


### D68 — The LLM is configuration; Gemini replaces LongCat (23 Sep 2026)

LongCat 2.0 was retired by its provider with most of the fleet captured and
the guides half-written. The pipeline noticed only because one function,
`callLongCat`, stopped answering — sourcing, slicing, PPE, validation and
the queue never knew which model wrote the prose. That was the right shape;
it is now explicit: `LLM_BASE_URL`, `LLM_MODEL_WRITE`, `LLM_MODEL_TRANSLATE`
in `wrangler.toml`, `LLM_API_KEY` as a secret. Anything OpenAI-compatible
with `json_schema` output can be dropped in.

**Provider: Gemini's OpenAI-compatible endpoint, free tier.** No card;
Flash and Flash-Lite only (Pro is behind billing); roughly 10 RPM and
1 000–1 500 RPD per model. `reasoning_effort: "none"` is what LongCat's
`thinking: disabled` was (D65 carries over unchanged). At ~2 400 calls for
the whole inventory, the free tier is about two days of background work;
paid Flash would be a few euros and no cap — free first.

**Terms, stated plainly.** *(Superseded the same day: billing was enabled
at 15:00 on 23 Sep, so the project is on the paid tier — no training on
prompts, no daily caps. The free-tier reasoning below stands as the record
of what was accepted before that.)* On the free tier Google may use prompts
and outputs to improve its models; paid tiers do not. What is sent is
manufacturer manual text and the guides derived from it — public documents,
no names, no photos, no unit IDs. Acceptable for this data. The EU boundary
built for R2 photos never extended to the model provider; LongCat was in
China. Nothing about this decision changes that.

**No credit carried over.** LongCat proved constrained decoding on 20 Aug.
Gemini gets the same ladder, automated at `/api/probe/llm` — five identical
runs, the hostile prompt, an enum under pressure, and the reasoning switch
measured — and the pipeline is not re-queued until it reports PASS.


### D69 — Gemini 3.5 Flash passes the enforcement ladder; Lite does not (23 Sep 2026)

`/api/probe/llm`, live, from the deployed Worker:

```
gemini-3.5-flash
  A  five runs     {"nums":[1,2,3]} ×5, byte-identical
  B  hostile       "200 words of prose + a notes field" -> {"nums":[1,2,3,4,5]}, 1.2 s
  C  enum          hard hat / boots / hi-vis vs gloves|glasses|mask -> {"epi": []}
  D  reasoning     on: 170 tokens for a 7-token answer · off: 36  — the switch is real
                                                                     -> PASS
gemini-3.5-flash-lite   400 "invalid argument" on every call         -> unusable
gemini-3.1-flash-lite   shape held, but "write 200 words" produced numbers until
                        max_tokens cut the array mid-way              -> not trusted
```

Test C is the one that matters most for this project: asked to list
equipment that is NOT in the enum, the model returned an empty list rather
than inventing `casque`. That is D52 working on a new provider.

**Then the project's own quota panel arrived and rewrote the choice.**
Published free-tier tables were wrong by a factor of 75 for this project:

```
Gemini 3.5 Flash        5 RPM     20 / day    <- the probe alone spent 15
Gemini 3.5 Flash Lite  15 RPM    500 / day
Gemma 4 31B            30 RPM 14 400 / day
```

Re-run against the two with real quota:

```
gemma-4-31b-it        4 of 5 calls 503 "high demand"; the one that answered
                      took 34 s and ended with a markdown fence — the schema
                      is SUGGESTED to Gemma, not enforced. Out (D48).
gemini-3.5-flash-lite A identical (after parsing — Gemini pretty-prints at
                      random) · B {"nums":[]} · C {"epi":[]} · D both ways
                      0.7 s per call                             -> PASS
```

The earlier Lite 400s were `reasoning_effort` being sent on every call; it
now goes only when reasoning is on. **Both roles run on
`gemini-3.5-flash-lite`**: 500 requests/day, so ~2 400 calls is five days
of background work. Paid Flash removes the cap for a few euros if five days
is too long. The panel — not any published table — is the only source of
truth for limits; `?list=1` is the only source of truth for model ids.

