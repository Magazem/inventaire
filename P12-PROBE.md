# P1.2 probe — can this Worker turn a manufacturer PDF into text?

Run this **before** any pipeline code is written. It answers three questions
that would each force a different architecture if the answer went the wrong
way, and it costs about ten minutes.

## Why it exists

The Workers **Free** plan gives **10 ms of CPU per invocation**. Parsing a
160-page multilingual manual inside the Worker is far past that — it would
fail on every real manual and pass on every toy one, which is the worst kind
of bug to discover during bulk capture.

Cloudflare's `toMarkdown` does the conversion **off** the Worker, so it
should cost us almost no CPU. "Should" is not evidence. This measures it.

## What to run

Deploy, log in at `/capture`, then open these in the same browser (the
session cookie is what authorises the probe — it fetches an arbitrary URL,
so it is not open to the internet).

Replace the URL with a real manual. Three worth trying, one per pattern
found in P0.3:

**Pattern A — one multilingual EU PDF (the common case, Makita):**
```
/api/probe/pdf?url=https://www.makita.de/wp-content/uploads/manuals/GA5030R.pdf
```

**Pattern A, large — DeWalt DWE492, ~160 pages.** This is the stress case:
if anything breaks on size or time, it breaks here.

**Pattern B — a real per-locale document (Husqvarna).**

Any manufacturer PDF will do. The point is one small, one large, one
per-locale.

## What the output means

| Field | What you are looking for |
|---|---|
| `convert.ms` | Wall-clock, not CPU. Even several seconds is fine — the Worker is waiting, not computing. |
| `convert.format` | `markdown` or `text` is a pass. `error` is a fail — read `convert.error`. |
| `convert.chars` | A real manual is tens of thousands of characters. A few hundred means we got a cover page or a scanned image with no text layer. |
| `languages_found` | **The most valuable field.** For a pattern-A PDF you should see `en`, `fr`, `de`, `it`, `pt` each clustered in a different part of the document — `first_at_pct` and `last_at_pct` are the section boundaries. That is stage 2 of the pipeline working. |
| `page_signals` | Whether page boundaries survive the conversion. Nice to have, not required. |
| `first_600` / `middle_400` | Sanity: does this read like a manual, or like PDF noise? |

## The three ways this can fail, and what each means

**1. `convert.error` mentions 403 or 5035.**
`toMarkdown` needs the Workers **Paid** plan ($5/month). Not fatal — the
pipeline design does not change, only the bill. Say so and we continue.

**2. `convert.chars` is tiny on a real manual.**
The PDF has no text layer (a scan). Those need OCR, which is a different and
more expensive path. If this turns out to be common, it changes the plan; if
it is one manufacturer in twelve, it becomes a `manual_state` case.

**3. `languages_found` shows every language spread across the whole document.**
The language sections are interleaved rather than sequential, and stage 2
cannot slice by position. Fallback: slice by page and language-detect each
page. Costs more, still works.

## What happens next either way

Pass → the pipeline gets built on this. Fail on (1) → same pipeline, paid
plan. Fail on (2) or (3) → the extraction stage is redesigned before any of
it is written, which is exactly why this probe comes first.
