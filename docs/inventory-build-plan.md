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
