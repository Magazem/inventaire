# Build Plan — Work Equipment Inventory

Companion to the design study v19. **Ordered by dependency, not by preference.**
19 Aug 2026.

---

## How this plan is ordered

Every step sits where it does for one of three reasons:

1. **It could invalidate the design.** Anything that might force a different architecture is tested first, cheaply, before work is built on top of it.
2. **Something else cannot start until it finishes.**
3. **It is on the critical path** — the longest chain, which decides when this is actually finished.

Anything that fits none of those runs in parallel or waits.

**The critical path is: AI validated → capture app → bulk capture → done.** Bulk capture is the long pole: hundreds of items, several people, spread over weeks. Everything else can be built alongside it. So the plan's real job is to get to bulk capture as fast as is safe, and to make sure nothing built later invalidates what was captured.

---

## Dependency map

```
      ┌── P0.1 local test  ✔ CLOSED 20 Aug ───────┐
      │   prototype built, 20/20 writes, fonts OK  │
      │                                           ▼
      │                                    P4 local system
      │                                    (also needs IT share)
      │                                           ▲
 P0.2 AI test ──► P1 build capture app ──► P2 pilot ──► P3 BULK CAPTURE ──► P5 deploy
      ▲                    ▲                  ▲              ▲
      │                    │                  │              │
 10 real model n°s   Cloudflare acct   workshop colleague   colleagues' time
 (needs site visit)                    (safety review)      (weeks)
```

Read it as: **P0.1 and P0.2 have no predecessors and gate everything after them.** P4 is off the critical path — it can be built during P3 and often should be.

---

## External dependencies, and when each is actually needed

| Needed | From | Needed by | Requested |
|---|---|---|---|
| 12 real brand + model numbers | a site visit | P0.2 | ✔ **received 20 Aug** |
| LongCat API key | you (have it) | P0.2 | ✔ |
| Cloudflare account | you, 10 min | P1 | not yet |
| Google Cloud Translation key (Tigrinya cross-check) | you, ~15 min | P1.2 | not yet |
| *(nothing new for P0.3 — reuses the 12 machines)* | — | P0.3 | ✔ |
| Workshop colleague, ~half a day | your team | P2, and again in P3 | available ✔ |
| A Tigrinya-speaking worker, 10 min | your team | P2 comprehension test | — |
| Manager decision on Tigrinya | your manager | before P3 | brief written, asking tomorrow |
| `\\SERVER\inventaire` share | IT | **end of P4** — not before | asking tomorrow |
| Backup scope confirmation | IT | P5 (documentation) | same conversation |
| Group Policy shortcut push | IT | P5, optional | same conversation |
| Manager approval | done | — | ✔ 19 Aug |

**Nothing is blocked today.** The IT share has the longest lead time and the latest need date, which is a comfortable position.

---

## P0 — Validation

**Why first:** two assumptions could each force a different design. Both are cheap to test and expensive to discover late. Nothing else should be built until both pass.

These two run **in parallel** — they share no dependencies.

### P0.1 — Local feasibility — **MOSTLY ALREADY PROVEN**

Your existing tool at `\\SERVER\secretariat\Codes\premier` already does, in this
exact environment: File System Access from the share, JSON read/write, folder
scans, file replacement, PDF generation, and Edge `--app` launched from a
shortcut on the share. That is tests 1, 5 and 6 passed on real evidence.

**Only two gaps remain**, and they fold into the prototype rather than being a
separate step:

| # | Test | Status |
|---|---|---|
| 1 | FSA write from the share | ✔ proven by your existing tool |
| 2 | **20× save with verification** | ✔ **20/20, zero failures — 20 Aug** |
| 3 | Tigrinya + Arabic via `@font-face` | ✔ fonts embedded in the stylesheet, self-check green |
| 4 | Full RTL layout | ✔ verified |
| 5 | Edit data file → refresh | ✔ proven |
| 6 | Edge `--app` from UNC | ✔ proven |

**P0.1 CLOSED — 20 Aug 2026.** The whole Phase B architecture is proven on
real hardware: a page opened from the disk can write to the share reliably,
and Ge'ez and Arabic render without any font installed on the machine.

One nuance worth keeping: **20/20 does not retire the write-verify-retry
logic** (design §6.4). It shows the antivirus collision is *rare*, not
impossible — and rare is exactly the failure mode that gets discovered in
month three, on a busy share, on a machine nobody tested. The guard costs a
few lines; a silently lost edit costs trust in the whole system. Keep it.

**Deliverable:** a small working page with ~15 invented items, which you keep. It is not a throwaway — it becomes the skeleton of the real worker and admin pages in P4, and it is something concrete to show your manager and the workshop.

**Exit gate: PASSED.** No fallback needed — the IIS request stays unnecessary
(design §6.0), and the prototype becomes the skeleton for P4.

### P0.2 — AI feasibility

Tests the riskiest assumption in the project: that an official manual can be found, extracted and turned into a guide good enough for a workshop.

**Input received.** Twelve machines, and a good spread: Husqvarna/STIHL publish well, Bosch/Makita/DeWalt are mid-range, MAXX/EINHELL/Kraftronic are the hard cases.

**A hand pre-scan of the list before running anything already changed the design** (see `findings-prescan.md`): the no-name tools *do* have manuals, on aggregators, in German, under differently-spaced model numbers — which produced D32 (normalisation) and D33 (source tiers). One machine, the MAXX, is a scanned PDF with no text layer, so the OCR case is live in the sample rather than hypothetical.

**Test files ready:** `00-CAPABILITY-CHECK` (run first — determines which mode), `01-TEST-MODE-A` (if the CLI has web tools), `02-TEST-MODE-B` (if not — I supply the manual text), `03-SCORING-SHEET`.

| Step | Measuring |
|---|---|
| Search for the official manual | How many of 12 are found at all |
| Download and extract text | Whether real PDFs, including scanned ones, survive extraction |
| Generate the English guide | Is it usable, or generic filler? |
| Translate to the other six | See the revised Tigrinya check below |
| Count the failures honestly | `introuvable` rate is a finding, not a defect |

**Revised Tigrinya check — the original gate is not achievable.** It required "judged readable by someone who reads it *and* can compare to French". No such person exists in the company. Replaced by two checks that don't need one:

1. **Back-translation** — Tigrinya back to English with a *different* model, compared to the source. Catches dropped negations and inverted instructions. Automatic, costs almost nothing, runs on all 10.
2. **Comprehension test** — a Tigrinya-speaking worker reads the guide and *demonstrates* what it says. Right actions = it worked. Needs no French and no translator. Ten minutes at a machine, so it lands in P2 rather than P0.

**Exit gate:** a majority of representative items produce a guide a workshop colleague judges correct and useful, **and** back-translation shows no meaning-level errors in Tigrinya.

**If the found-rate is low** (say under half): the design holds — `introuvable` is a designed-for state — but the value proposition shifts from "automatic manuals" to "automatic where possible, manual elsewhere". Worth telling your manager before the effort is spent, not after.
**If back-translation shows meaning errors:** this becomes a management decision, not a technical one — see the **Tigrinya decision brief**. The options are ranked there; none of them is "ship it unlabelled".

**This is the single most important gate in the plan.** Everything downstream assumes it passes.

### P0.2 RESULT — run 20 Aug 2026: **PASS, with one clear FAIL**

| | |
|---|---|
| Found rate | **11 / 12** — only STIHL FS86 produced nothing (scanned, correctly reported) |
| Usable rate | **11 / 11** — every guide written was judged good enough to show a worker |
| Invented content | **none detected** |
| **Tigrinya** | **5 clean, 5 meaning-level errors, 1 wrong script** — **FAIL** |

The English guides and the sourcing passed convincingly. Tigrinya did not: one guide inverted *"always wear eye protection"* into its opposite, another turned *"extremely hot"* into *"very cold"*. ~50% error rate, and optimistic because the model checked its own work.

**Consequences, all now in the design:** back-translation is permanent and runs on every unverified language including Arabic (D35); it uses a different model (D35); failures are flagged not auto-fixed (D37); script is validated (D36); output is JSON not files (D34); search gains model families, query augmentation and multi-candidate evaluation (D38).

**Gate verdict: proceed to P1 for EN/FR/DE/IT/PT. Tigrinya is a management decision** — see the decision brief, now evidence-backed. It does not block P1; it blocks *publishing Tigrinya*, which happens at P5.

Full analysis: `04-RESULTS.md`.

### P0.3 — Native-language sourcing (NEW)

**Why it exists:** European manuals are usually multilingual, so most of our languages may already be present in the manufacturer's own words — no translation needed at all (D43). That would remove the largest remaining quality risk for FR/DE/IT/PT/AR and make the DeepL calibration audit largely unnecessary.

**Why it's cheap:** same 12 machines, nothing new to collect from the workshop. One pass, no guide generation. **The test is self-contained** — it searches fresh, because the P0.2 sessions were cleared and Hermes remembers none of those PDFs. Test file: `05-TEST-P03-native-language-sourcing.md`.

**Two patterns to check, both already confirmed by hand:**

| | Pattern | Confirmed on | How it's found |
|---|---|---|---|
| A | One multilingual PDF | DeWalt DWE492 — 160 pages, EN on 32–42 | Detect language sections inside |
| B | One manual per locale | Husqvarna 545RXT — `ca-en` English-only, `be-fr` a full 112-page French manual | Swap the locale in the URL |

**The most valuable output is not the table — it's the URL rule per manufacturer.** A reusable locale-swap template is what turns this from a finding into automation.

**What it decides:**

| Result | Consequence |
|---|---|
| Most machines offer FR/DE/IT/PT natively | Native sourcing becomes the default; translation is the fallback; European-language risk mostly disappears; DeepL becomes irrelevant |
| Few do | Translation stays default |
| Arabic available sometimes | Those items get manufacturer-grade Arabic and your review load drops |

Tigrinya is unaffected either way — it appears in no manual, ever, which is precisely why it needs the Google cross-check.

**Exit gate:** none — a measurement, not a gate.

### P0.3 RESULT — 20 Aug 2026: **native sourcing wins**

| | |
|---|---|
| Full native FR/DE/IT/PT | **9 / 12** |
| Partial | 2 — Husqvarna 115iHD45 (DE only), Kraftronic (DE only) |
| Genuine gap | 1 — STIHL FS 86, discontinued, absent from every STIHL site |

**Translation is now the exception.** Pattern A dominates (Makita, DeWalt, Bosch, Einhell, MAXX all ship one multilingual European PDF); Husqvarna and STIHL are pattern B with real per-locale documents.

**Two traps, now D45 and D46.** A locale swap returning 200 does *not* mean a different manual — Bosch and Einhell serve byte-identical PDFs across all four locales, and trusting the status code would have produced guides labelled `native` that were written from the English document. And model slugs don't transfer between markets, so a 404 means "search this locale properly", not "no manual exists".

**Bonus:** some European manuals carry Arabic natively (the Bosch does) — manufacturer-grade Arabic, less review for you.

Full results: `06-RESULTS-P03.md`. **P1.2 is unblocked**: build an extraction-first pipeline.

---

### P1.0 RESULT — infrastructure live, 28 Aug 2026

`/health` green on all three bindings:

```
d1     ok — 13 tables, 5 categories seeded
r2     ok — written and read back, EU jurisdiction
queue  ok — message accepted
```

Deployed at `inventaire.magazem.workers.dev` from `github.com/Magazem/inventaire`
via GitHub Actions. Three failures on the way, each worth keeping:

| Failure | Cause | Lesson |
|---|---|---|
| `Missing entry-point` | `wrangler.toml` created inside `src/` by the web UI | The diagnostics that "cost" a run saved three |
| `R2 bucket not found` | bucket is **Jurisdiction EU**, invisible to a plain lookup | Not a permissions problem — `r2 bucket list` succeeding while returning empty was the tell |
| — | — | **Jurisdiction was kept, not downgraded.** It is a stronger guarantee than the location hint we originally specified; recreating the bucket to fix a config typo would have quietly weakened data residency |

**Note for anyone using the CLI later:** every R2 command needs
`--jurisdiction eu` or it reports "not found". The Worker binding carries it
automatically; the command line does not.

---

### P1.2 PROBE RUN #1 — 31 Aug 2026: platform passes, sourcing is the real problem

**What passed.** `toMarkdown` converted a 10 MB, 160-page PDF into 613,470
characters of usable text in 5.9 s of *wall clock* — no CPU charge worth
counting, no 403, no paid-plan error. **The free plan is enough.** The
extraction stage does not need to be redesigned and no money needs to be
spent.

**What failed, and it is more important.** The probe was pointed at
`eu-data.manualslib.com/...`. The metadata gave it away:

```
Creator = wkhtmltopdf 0.12.6      Producer = Qt 4.8.7
Title   = manualslib.de/manual/1375202/Dewalt-Dwe490.html
```

That is **ManualsLib's web page printed to PDF** — and for the DWE**490**,
not the DWE**492** that was asked for. Every numeric field in the probe
output looked like a clean success. Only the provenance metadata revealed
it. A guide written from that file could never honestly carry the `native`
badge (D45), and nothing downstream would have noticed.

=> **D53**: every fetched source is checked for provenance *at fetch time* —
aggregator domain, or `Creator`/`Producer` showing an HTML-to-PDF renderer.
A reprint is usable content but can never be a `native` source. This is a
machine check, not a human one; run #1 proves a human reading the numbers
would have passed it.

**The knock-on finding.** Searching for the DWE492 manual returns
**aggregators only** — ManualsLib, manuals.co.uk, device.report, all-guides.
The manufacturer's own file does not surface on the first page of results at
all. DeWalt was already flagged in P0.3 as the one manufacturer with *no
reusable URL rule*, so this is the worst case rather than the typical one —
but it inverts the priority:

| | Before run #1 | After run #1 |
|---|---|---|
| Primary source | web search | **the P0.3 manufacturer URL rules** |
| Fallback | URL rules | web search, results **ranked by domain**, aggregators demoted |
| If only an aggregator is reachable | — | use it, label the tier honestly, never `native` |

**Third finding: slicing is mandatory, not an optimisation.** The document
came to 153,368 tokens. That fits LongCat's context, but ×400 items it is
slow and expensive, and the LLM would be reading six languages to write one
guide. The language section must be cut out *before* the model is called.

**Fourth: the first marker set was useless.** Short words (`the`, `and`,
`nicht`) matched everywhere. Worse, the aggregator's *"Verfügbare Sprachen
DA DE EN FR IT NL PT"* index line fired every language marker at once in the
first 1% of the document, which is why `pt` appeared to span 0.4%–69.8%.
Rewritten to multi-word phrases plus a **density histogram** — a real
language section is a contiguous block, an index page is a single spike, and
the two are now distinguishable. Page headings survive conversion
(`page_word: 161`), so there is something to slice on.

**Status: probe re-run pending** against a genuine manufacturer PDF.

---

### P1.2 PROBE RUN #2 — 31 Aug 2026: the manual labels its own pages

Same probe, pointed at the genuine Makita EU multilingual PDF
(`icmsmakita.eu/.../GA5030R.pdf`).

| | Run #1 (ManualsLib reprint) | Run #2 (Makita original) |
|---|---|---|
| Size | 10.2 MB | 21.2 MB |
| Fetch | 4 828 ms | **897 ms** |
| Convert | 5 878 ms | **2 978 ms** |
| Text | 613 470 chars | 462 025 chars |
| Creator | `wkhtmltopdf 0.12.6` | `Adobe InDesign 20.0`, PDF/X-1a:2001 |
| Sections | overlapping noise | clean and sequential |

The larger file converted in **half the time** and produced **less** text —
the reprint's excess was the aggregator's own page furniture. Provenance is
unambiguous: a print-production file from the manufacturer's design
department. `native` is defensible for this source.

**The finding that changes stage 2.** `middle_400` showed:

```
### Page 70
70 DUTCH
Use with a disc-shaped wire brush ...
```

**Makita prints the language name in every page's running header, and
toMarkdown preserves it.** The document states where each section begins and
ends. That is not a heuristic — it is metadata.

=> **D54**: slice by **page-header language names** as the primary method;
fall back to phrase-density only for publishers who do not label pages.

Why it is strictly better than the histogram:

- **Exact boundaries.** Page 61–72 is Spanish, not "roughly 51.9%–60.3%".
- **Immune to the cover trap** that broke run #1 — an index page listing
  every language is one page, labelled or not, and cannot smear the map.
- **Immune to shared phrases.** Run #2's `it` was a single false hit at
  51.6%: Italian and Spanish both say *uso previsto*. A page header cannot
  be ambiguous that way.
- **Contiguity is checkable**, so a scattered language is detected rather
  than silently mis-sliced.

Implemented and unit-tested against a reconstruction of the Makita layout:
84 pages, 7 languages, 100% coverage, every section contiguous, character
offsets returned for direct slicing. Degrades cleanly to `ok: false` on
unlabelled documents and on documents with no page headings at all.

**Two smaller notes.**

The PDF's own `Language=ja-JP` tag is the authoring locale — Makita is a
Japanese company — and says nothing about the content. Ignore it.

**Run #2's JSON arrived translated.** `en` had become `and` and `de` had
become `the` — Dutch for "and" and "the". The browser detected the Dutch
marker phrases in the response, decided the page was Dutch, and translated
the JSON keys. Harmless here, but worth remembering: **anything read through
a browser may not be what the server sent.**

---

### P1.2 PROBE RUN #3 — 31 Aug 2026: stage 2 CLOSED, sourcing built

Probe v3 against the Makita original. **The page-header map works exactly as
designed.**

```
136 pages, 129 labelled, coverage 0.95, 10 languages, ALL contiguous
en  p7-18    chars      0 –  41 525
fr  p19-31   chars 41 525 –  90 455     <- adjacent, no gap, no overlap
de  p32-45   chars 90 455 – 137 789
it  p46-58     nl p59-71    es p72-84
pt  p85-97     da p98-109   el p110-123   tr p124-135
```

The seven unlabelled pages are the cover and the figure plates
(`Fig.1 … Fig.15`) — correctly excluded rather than mis-assigned.

**The number that matters: the French guide needs 48 930 characters, not
462 025.** Roughly **12 000 tokens instead of 115 506** — a 90% cut, and the
model reads only French to write French, which is what D43 asked for.

**The fallback is measurably worse**, as it should be: it placed `it` at
20–35% (truth 29.8–40.8%) and `de` at 10–30% (truth 19.6–29.8%). Good enough
to rescue an unlabelled document, not good enough to lead. D54 confirmed.

**Gap found: this manual carries no Arabic.** Ten languages, none of them
`ar`. P0.3's Bosch finding does not generalise — Makita items get
*translated* Arabic, not native. The trust tier already handles it honestly,
but the Arabic review load is real rather than theoretical.

**Also confirmed: the browser was translating run #2.** With auto-translate
off, `en` and `de` come back correct, and `middle_400` now reads
`70 NEDERLANDS` where it previously read `70 DUTCH`. The language table
happens to accept both spellings, so it would have worked regardless — but
that was luck, not design.

---

### Stage 1 built — `src/source.js`

Ordered by what runs #1 and #2 proved, not by preference:

1. **Verified manufacturer URL rule** where P0.3 found one. Makita's is now
   proven end to end. Only Makita's is a pure model-number substitution; the
   others key on article numbers or market-specific slugs we do not hold, so
   they fall through to search (D46).
2. **Serper search, ranked by domain**, +60 manufacturer / −45 aggregator /
   +30 `.pdf` / +20 model in URL / −20 shop listing. Every score carries its
   reasons so a bad pick can be diagnosed without re-running.
3. **Ranged 1 KB `%PDF` check** on the top three before committing to a
   21 MB fetch.

Ranking unit-tested against the *actual* DWE492 search results — the ones
that were aggregators for the whole first page:

```
 120  service.dewalt.co.uk/.../DWE492_GB.pdf   manufacturer, .pdf, model in URL
  60  dewalt.co.uk/product/dwe492-qs           manufacturer, but a shop page
   5  free-instruction-manuals.com/...pdf      aggregator
 -15  manualslib.com/manual/3513190            aggregator
 -50  device.report/manual/3950355             aggregator, WRONG MODEL (DWE490)
```

Unranked search picks row 4. That is precisely how probe run #1 ended up
writing from a ManualsLib reprint of the wrong grinder.

---

### P1.2 PROBE RUN #4 — 31 Aug 2026: a URL cannot tell you what a document is

Three live sourcing tests. Makita hit its verified URL rule and never
touched Serper — as designed. The other two failed, and the Husqvarna
failure is the important one.

**Husqvarna 545RXT returned a SALES CATALOGUE as `best`.**

```
aj-874490.pdf  "Aménagement paysager et gestion des espaces verts 2026"
   /brand/documents/brochure-and-catalogue/...      16.8 MB, score 75
```

Manufacturer domain (+60) and a real `.pdf` (+30) outweighed "model number
absent" (−15). The pipeline would have written a safety guide from a
marketing brochure — and it would have looked fine doing it.

**Worse: the real manual was present and ranked below it.**
`device.report/m/168bdb…pdf`, titled *"545FR, 545FX, 545FXT, 545RX, 545RXT,
545F"* — the genuine Husqvarna document, at −5, sunk by the aggregator
penalty. Same on DeWalt: `manuals.plus` titled *"Models: DWE490, DWE492,
DWE492S, DWE493, DWE494"* is the real manual, scored 20, never verified
because only the top three were checked.

**DeWalt returned `best: null`.** Correct behaviour — refusing beats
inventing — but DeWalt still has no path.

=> **D55: ranking decides what to TRY; content decides what to ACCEPT.**
A catalogue and a manual are indistinguishable from the outside. Judging a
document by its URL was never going to work, and run #4 is the proof. Every
candidate is now fetched, converted and asked four questions:

1. **Does the text name this model?** A catalogue names hundreds; it names
   *this* one in passing. Zero mentions is an automatic reject.
2. **Does it read like instructions?** Safety phrasing in any of six
   languages, not sales copy. Fewer than three phrases is a reject.
3. **Is it long enough?** Under 8 000 characters is a spec sheet.
4. **Sales vocabulary?** *RRP, incl. VAT, our range, find your dealer* —
   two or more, with little instruction phrasing, is a reject.

A long document that mentions the model only once or twice is `doubtful`,
not accepted — that is the catalogue signature precisely.

**Scoring changes.** Model number absent is now **−100 and disqualifying**,
not −15. Catalogue vocabulary (`catalogue`, `brochure`, `RRP`, `promo`,
`Prospekt`, …) is −70. Verification widened from the top 3 to the top 6, in
parallel, because run #4's real manual sat at rank four.

=> **D56: follow manufacturer support pages.** `husqvarna.com/uk/support/545rxt/`
is the *right* page — it simply is not the PDF. Run #4 scored it, verified
it as HTML, and threw it away, never seeing the manual it links to. Support
pages are now fetched and their PDF links harvested with a +40 bonus.

**Re-ranked against run #4's actual results:**

```
HUSQVARNA 545RXT              before  ->  after
  husqvarna.com/uk/support/545rxt/     30  ->   95  FOLLOW
  regentlawnmowers ...545RXT-AT.pdf    50  ->   55
  device.report/...pdf (REAL MANUAL)   -5  ->    5
  aj-874490.pdf (CATALOGUE)            75  ->  -80
  Husqvarna-RRP-List-2026.pdf          15  -> -140
```

The catalogue moved from first place to last. Content checks unit-tested on
a synthetic manual, catalogue and spec sheet: accepted, rejected, rejected,
each for the right stated reason.

---

### P1.2 RUNS #5–#7 — 31 Aug 2026: sourcing works, with three honest limits

Run by Claude directly against the deployed Worker.

| Machine | Outcome | Provenance | Tier | Time |
|---|---|---|---|---|
| **Makita GA5030R** | manual acquired | `url_rule` → manufacturer | **`native`** | 5.0 s |
| **Husqvarna 545RXT** | manual acquired | `rocha.fr` → third party | `auto` | 9.7 s |
| **DeWalt DWE492** | nothing qualified | — | — | 12.5 s |

Makita is the clean case: 136 pages, 10 languages, 95% page coverage,
`trust_tier_allowed: native`. Nothing to change.

**Run #6 — the label, not the source, was wrong.** The system accepted a
genuine 44-page Husqvarna manual — from `lawnandgarden.manualsonline.com`,
labelled `support_page` and therefore manufacturer-sourced. `manualsonline`
was missing from the aggregator list, so its index page matched
`SUPPORT_PATHS` on `/manuals/`, took the +40 support-page bonus, and laundered
a reprint into a manufacturer document. **D53 was defeated through a side
door.** The content was fine. The provenance was a lie.

=> **A page is a support page only if the MANUFACTURER serves it.** Host
test added. Third-party index pages are still followed — their content can
be perfectly good — but their links take −30 instead of +40 and are stamped
`provenance: reprint`. The trust tier is now decided once, at acquisition,
from where the bytes came from, and travels with the document.

**Run #7 — a third document structure.** Accepted `rocha.fr`: 38 pages,
80 550 chars, French. Page 1 reads:

```
545FR, 545FX, 545FXT, 545RX, 545RXT, 545F
DE Bedienungsanweisung 2-38   FR Manuel ...
```

`coverage: 0` — **Husqvarna does not label its pages.** So:

| Structure | Example | How the language is found |
|---|---|---|
| Multilingual, page-labelled | Makita | `pageLanguageMap` — exact offsets |
| **Single-language per locale** | **Husqvarna** | **whole-document detection (new)** |
| Multilingual, unlabelled | (not yet seen) | phrase-density histogram |

=> **D57a**: detect the language of a single-language document by **function
words**, not phrases. A cover listing *DE Bedienungsanweisung / FR Manuel /
IT Manuale* fires every phrase marker at once — run #4's trap exactly — but
cannot outweigh thousands of "le/la/des" across a French body. Measured on
the middle 60% to skip covers and back-matter. Tested: FR 1.00 confidence,
DE 0.91, EN 0.92.

**This changes the pipeline shape.** For pattern-B manufacturers, sourcing
must run **once per language**, not once per model. One Makita fetch yields
seven languages; one Husqvarna fetch yields one.

**Run #7 — DeWalt has no automatic path, and that is the true answer.**

- `dewalt.co.uk/product/dwe492-qs/...` **redirects to the homepage** — the
  DWE492 is discontinued, so no manufacturer page exists. Same shape as
  P0.3's STIHL FS 86 gap.
- `manuals.plus` and `device.report` return **403** to the Worker.
- Every rejection was correct: a 37-page parts list with one instruction
  phrase; a 40-page PDF containing 1 267 characters (a scan with no text
  layer). Both refused on content.

=> **D57: a human-upload path is required, not optional.** Some manuals are
unreachable from a datacenter and always will be — discontinued models,
bot-blocked hosts, paper-only documents. But the manual is often in the
drawer beside the machine, or downloads fine from an office browser where no
403 applies. The admin page needs "attach this PDF to this model", feeding
the same extraction pipeline from byte one. Without it, discontinued tools
are permanently blank.

`bynder.sbdinc.com` — Stanley Black & Decker's asset host, where DeWalt
actually serves PDFs — added to the DeWalt domain list, found by reading
their own pages.

---

### P1.2 RUNS #8–#9 — 31 Aug 2026: the guide works; the budget was the problem

**Run #8 — first end-to-end pass. Makita GA5030R, French.**

```
source     icmsmakita.eu (URL rule)      provenance: manufacturer
slice      pages 19-31, 48 930 chars     method: page_headers
tier       native                        tier_source: 1, pattern A
guide      6/6 sections filled           87 s total
tokens     15 611 prompt / 2 047 completion (1 076 of it reasoning)
```

The prose is genuinely good and, most importantly, **the negations
survived**: *"N'utilisez jamais une meule boisseau pour pierre"*,
*"N'abandonnez jamais l'outil avant que l'accessoire ne se soit complètement
arrêté"*. That was the single largest risk in the design — P0.2's Tigrinya
run inverted *"always wear eye protection"* into its opposite. The 15° angle
and the O/I switch positions are lifted correctly from the manual.

**Three defects, two of them mine.**

**1. A safety instruction was truncated mid-word:** `"Ne déposez jamais
l'outil avant l"`. It hit `maxLength: 400` in the schema. **Constrained
decoding does not REJECT an over-long string — it CUTS it.** A schema length
limit therefore manufactures broken sentences instead of triggering a retry.

=> **D59: never put `maxLength` in a schema whose output is prose.** Length
belongs in code validation (Layer 3), where it can fail properly. Added with
it: a truncation detector — a long item not ending in punctuation is a hard
validation failure, because *a safety instruction that stops mid-sentence is
worse than a missing one: it reads as complete.*

**2. The PPE call returned `casque` (hard hat) and `chaussures` for an angle
grinder, and missed `projection` and `bruit`** — while the guide written
from the same text said to wear eye and hearing protection. Not the model's
fault: the enum handed it bare ids and never said what they meant.
`casque` vs `casque_antibruit` is a coin flip from the identifier alone.
Thirteen definitions added, plus a rule for the trap in Makita's own text —
the manual says *do not* use cloth gloves, and "do not use X" is not a
requirement for X.

**3. Duplicates:** `casque` ×2, `masque` ×2, `pieces_mobiles` ×5. An enum
constrains VALUES, not repetition. `uniqueItems` added, plus a `Set` in code
because `uniqueItems` support under constrained decoding is unproven.

---

**Run #9 — both calls hit their stops. The stops worked; the budgets did not.**

```
guide  client_timeout at 60 000 ms       (ran 42 s in run #8)
ppe    finish_reason "length" at 1 500   reasoning_len 5 694
       retry at 3 000 -> client_timeout at 45 000 ms
```

**Nothing hung and nothing vanished** — the response states which stop fired
at which budget. That is exactly what D50 was written for, and it is the
first time it has been load-bearing.

The cause is a direct consequence of fixing defect 2. **A richer prompt makes
a reasoning model think MORE.** Thirteen definitions and five rules produced
5 694 characters of reasoning against a 1 500-token budget — and reasoning is
generated before the constrained output, out of the same allowance.

=> **D60: `max_tokens` is a REASONING budget, not an output budget.** Sizing
it from the expected answer is wrong by an order of magnitude. Guide 4 000 →
8 000 (timeout 60 s → 150 s); PPE 1 500 → 5 000 (45 s → 90 s).

=> **D61: PPE is extracted from the GUIDE, not from the raw manual.** It was
reading 60 000 characters to emit eight ids. Now it reads the guide's own
`securite` and `usage` items — a few hundred characters. Beyond speed, the
better reason is consistency: **the pictograms and the words a worker reads
now come from the same text.** Deriving them from different bodies of text
invites the two to disagree, and a worker cannot tell which one is wrong.

**Standing observation across both runs:** the guide call is strong, the PPE
call is the weak half, and both times the fault was the prompt rather than
the model. This is why `epi_confirme` defaults to false (D30). If PPE stays
shaky, the honest position is that AI-suggested equipment is a **draft for
the workshop colleague to correct** — which is what P2's safety review was
always for.

---

### P1.2 RUN #11 — 8 Sep 2026: first real capture session, 17 machines, two people

Read directly from D1 after Yazan and Walid captured for an hour.

| Outcome | Machines |
|---|---|
| Manual found, **manufacturer** | Makita GA5030R · STIHL HSA 45 (`ssc.stihl.com`) · Husqvarna 445 (`www-static-nw.husqvarna.com`, later lost — see below) |
| Manual found, third party | Maxx PN13150 · Fuxtec FX-EB162 · STIHL HS45 · STIHL FS 260C |
| `introuvable` | Honda HRH536 · Kraftronic · Black & Decker CD14C · Spacy M0320 · STIHL BG86, FS86, MS180 · Fiskars UPX86 |
| `sans_objet` | 2 |

**Six defects found, four of them mine.**

**1. Every native guide was labelled `translated` / `auto`.** Makita's French
was written from Makita's own French pages and should be `native`,
`tier_source: 1`. `getModel()` did not SELECT `ia_meta`, so the provenance
stored by `source` was never read — `meta` was always `{}`. Under-claims
rather than over-claims, so no worker ever saw a false badge, but every
source line was wrong the other way. One-line fix.

**2. STIHL HSA 45: six empty guides, five of them translated from the
first.** The page-header map found "FRANÇAIS" at **pages 49–51 of 52** —
three pages of multilingual back-matter (declaration of conformity,
addresses), not the manual. The model correctly said there was nothing
there. The empty guide was then STORED, and the English job — finding no
English section — picked it as the pivot. Garbage, translated five times.

=> **D62**: a language section under **6 pages / 6 000 chars** is not that
language's manual; the language counts as absent and is translated from a
real pivot. **D63**: a guide that fails validation is never stored, and a
guide with recorded problems is never a pivot.

**3. Translation jobs raced their own pivot.** STIHL HS45 is an English-only
PDF. The French job found no French, needed the English guide, which did not
exist yet, retried three times inside the two minutes English took, and
died. Result: `en` only.

=> **D64: two-phase fan-out.** `source` queues only the languages the
document actually carries. The job that writes the first valid pivot queues
`translate` jobs for the rest. Translations cannot run before their source
exists, by construction.

**4. `"pt: http"`.** LongCat returned a non-200 and only the word "http" was
stored. Status and error snippet are now kept; 429 retries after 120 s, 5xx
after 60 s, through the queue's own delay rather than a hot loop.

**5. The 03:00 sweep re-sourced Makita from scratch** and rewrote five good
guides to chase one missing language. `requeueMissing()` now queues only
what is absent, and re-fetches only when nothing is parked. The
"Relancer" button on `/inspect` uses the same logic.

**6. STIHL MS180 — a genuine 44-page manual, model named 40× — was rejected
as a parts diagram** because its body says *"use only STIHL spare parts"*,
as every STIHL manual does. The filter added after the Honda run was too
eager. Split into STRONG signals (`vue éclatée`, `exploded view`, `parts
list`…, counted anywhere) and WEAK ones (`spare parts`, `Ersatzteil`,
counted in URL/title only), and rejection now also needs a number-heavy body
(digit/letter ratio > 0.12 — the MS180 manual is 0.03, a real parts diagram
is 2.1).

**One user-side finding.** Husqvarna 445's manufacturer manual WAS found.
Then the model number was edited to `445 CHAINSAW`, the canonical key became
`445CHAINSAW`, and that string appears in no manual on earth — every
candidate was rejected for "model number never appears". The model-number
field wants only what is on the nameplate. `extraction: ok` was also left
standing next to `introuvable`; now reset together.

**Pilot finding for P2, not a bug:** free-text types produced `MACHINE` ×5,
`MACHAINE`, `TAILLEUR`, `SOUFLEUR` and `SOUFFLEUSE` for the same thing,
`CORDLESS_DRILL` beside `VISSEUSE`. Two people, one hour. The type field
needs a curated list with suggestions, and a merge tool, before bulk capture
— exactly the kind of flaw P2 exists to find at 20 items rather than 400.

**Sourcing hit rate this session: 7 of 15 with a model number (47%),
3 of them manufacturer-grade.** STIHL is a third of the fleet and 2 of 6
found; the found ones came from `ssc.stihl.com` by part number, which is not
derivable from the model. A STIHL rule is worth an hour before P3.

---

## P1 — Foundations

**Entry:** ✔ all clear. P0.1 closed, P0.2 passed (bar Tigrinya), P0.3 done, 1.1 frozen. **Nothing blocks P1.2.**

| Step | Why here |
|---|---|
| **1.1 Freeze the data model and file format** | ✔ **DONE 20 Aug** — `spec/data-model.md`, audited against D1–D44 before freezing; 16 problems found and fixed (see its §13). |
| **1.2 Build the AI pipeline** | Now defined: **extraction-first** (D43/D45/D46), translation only as fallback, plus the `pending`/re-queue safety net (design §5.1). Output enforcement per `spec/output-contract.md` (D47/D48). |
| **1.1b Probe LongCat's output controls** | ✔ **CLOSED 20 Aug.** `json_schema` proven to be **constrained decoding** — the model tried to emit a forbidden field and could not. `tool_choice` forcing excluded (2 of 3 ignored). `temperature: 0` non-deterministic. Reasoning consumes `max_tokens`; `content` can be absent. Full findings in `spec/output-contract.md`. |
| **1.3 Build the phone capture app** | The critical path runs through here. Nothing gets captured until it exists. |
| **1.4 Set up Cloudflare** | 10 minutes, needed before 1.3 can be tested for real. |

1.1 must finish before 1.2 and 1.3 start. 1.2 and 1.3 can then run in parallel.

**Exit gate:** you can photograph an item on your phone and see a finished, translated guide appear a minute later, without touching anything else.

---

## P2 — Pilot

**Entry:** P1 exit gate passed. **Requires: one workshop colleague, half a day.**

20 items in a single area, captured for real — not a demo.

**Why this exists rather than going straight to bulk:** capturing 400 items with a flaw in the ID scheme, the photo standard or the category list means re-doing 400 items. Twenty is enough to find those flaws and cheap enough to discard.

Specifically measuring:

- Do the photos come out usable in real workshop lighting? Is the nameplate close-up readable enough to re-run the AI later?
- Does the ID scheme survive contact with reality?
- Are the categories right, or did you immediately need three that don't exist?
- **How long does reviewing a guide actually take?** ×400, this is the real cost of the project, and P2 is where you learn it.
- Does your colleague agree with the AI's PPE suggestions? Where they disagree is where the safety review earns its keep.
- **The Tigrinya comprehension test** (§P0.2): one worker, one machine, ten minutes. This is the only evidence you will ever have about whether Tigrinya works, so it must not be skipped.

**Exit gate:** 20 items you'd be happy to show a worker, and a realistic minutes-per-item figure for the review.
**If review time is high:** adjust *before* bulk, not during. Options: tighten the prompt, accept a lower verification bar for low-risk items, or bring in a second reviewer.

---

## P3 — Bulk capture — the critical path

**Entry:** P2 exit gate passed.

The long pole. Weeks, not days, and gated by other people's availability rather than by any technical work.

**How to run it so it doesn't stall** — the most common failure mode for a project like this:

- **One area at a time**, complete before moving on. A finished workshop is useful; 60% of everything is not.
- **Capture wide, review after.** Photographing is fast and needs the workshop; reviewing is slow and can happen at a desk. Don't interleave them and halve your throughput.
- **Hand tools go through the `sans_objet` fast path** — no model number, no AI, seconds each. Expect most items here.
- **Consumables: names and quantities only** (design D28). Don't decide about movement logging yet.
- **Track progress by area**, visibly. A visible count is what keeps a multi-week task alive.

**Exit gate:** every area captured, every `safety_flag` item reviewed by someone who uses the machine.

**P4 runs in parallel with this.** Do not wait.

---

## P4 — The local system

**Entry:** P0.1 passed. **Needs the IT share by the end, not the start.**

Built from the P0.1 skeleton while P3 runs.

| Step | Notes |
|---|---|
| 4.1 Worker page | search, photo grid, item page, status band, pictograms, 7 languages, RTL, print |
| 4.2 Admin page | add/edit, guide editing with the copy-for-translation flow, status log, backups, history |
| 4.3 QR codes | generated in-page, targeting the manufacturer URL (design §7.4) |
| 4.4 Export from cloud → disk | the bridge between the two phases |
| 4.5 Kiosk shortcut + idle reset | |
| 4.6 `LISEZ-MOI.txt`, printed sheet, screen recording | **D16 lives or dies here.** Not optional, not last-minute |

**Exit gate:** the whole system runs from the share with the cloud switched off. That's the real test of D16 — pull the plug and see if it still works.

---

## P5 — Deployment and handover

**Entry:** P3 and P4 both complete. **Needs the IT share, live.**

1. Copy everything to `\\SERVER\inventaire`.
2. Deploy the kiosk shortcut to the workshop PC (or via Group Policy).
3. **Workshop test with 2–3 real workers, at least one non-French speaker.** Watch, don't explain. Where you have to explain is a bug.
4. Fix what that finds.
5. Hand over: the printed sheet, the recording, and one walkthrough with whoever might inherit it.
6. Archive the cloud project — dormant, not deleted (design §5.6).

**Exit gate:** a worker who has never seen it finds a machine and reads its guide in their own language, without help.

---

## P6 — Later, only if wanted

Deliberately excluded from the main plan so they can't creep into it.

- Consumable movement logging — once the list exists and you know which items matter
- Tablet in the workshop — needs IIS from IT
- QR labels on physical items
- Serving over HTTP — the `.js` format and relative paths mean this stays a copy operation forever

---

## Where this can actually go wrong

Not the technical risks — those are in design §8 — but the plan-level ones:

| | Risk | What it looks like | Guard |
|---|---|---|---|
| 1 | **P3 stalls** | Two areas done, enthusiasm gone, six months pass | One area at a time, each usable alone, visible progress count |
| 2 | **Review becomes the bottleneck** | 400 guides waiting, none verified | Measure it in P2 and adjust *before* P3 |
| 3b | **Tigrinya shipped unlabelled and unchecked** | Looks as authoritative as French, nobody can tell it's wrong | Decision brief; unverified languages visibly labelled; pictograms carry safety |
| 3 | **The colleague never becomes available** | Safety review skipped, wrong instruction reaches a saw | It's a gate on P2 and P3, not a nice-to-have. If it can't be met, say so out loud rather than proceeding quietly |
| 4 | **Building before validating** | Weeks of work on an assumption that was wrong | P0 exists precisely for this |
| 5 | **P4 left until after P3** | Weeks of dead time at the end | P4 runs in parallel — that's why it's off the critical path |
| 6 | **Handover treated as paperwork** | It works until you leave | 4.6 is a gate, and P5 isn't done without the walkthrough |

---

## What happens next, in order

1. **Now, needs nobody:** P0.1. I can build the test page today.
2. **Tomorrow, at work:** ask IT for the share; collect 10 representative model numbers for P0.2 while you're on site.
3. **Then:** P0.2 with a Tigrinya reader for the check.
4. **Both gates pass →** P1.

The only thing standing between today and the critical path is **ten model numbers**.
