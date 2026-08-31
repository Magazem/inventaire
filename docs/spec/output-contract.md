# Making the model's output predictable

Answers the question: *are we enforcing a steady output, or hoping for one?*
Short answer: **hoping is not the plan, and prompting alone is not the plan
either.** Four layers, of which the most important is the first.

---

## Layer 1 — Shrink what the model is allowed to decide (D47)

The strongest fix is not a better prompt. It is giving the model less to do.

In the P0.2 run the model chose file formats, file counts, whether to bundle
languages together, whether to "fix" its own errors. It chose those because
it was *allowed* to. Every one of those decisions belongs in code.

| Task | Who does it | Why |
|---|---|---|
| Normalise the model number | **code** | string rules, D32 |
| Try locale URLs, follow redirects | **code** | HTTP |
| Compare files (same PDF or different?) | **code** | hash — D45 |
| Detect which languages a PDF contains | **code** | Unicode ranges + language ID |
| Find a language's page range | **code** | text analysis |
| Extract text from a PDF | **code** | pdftotext / OCR |
| Verify the script is Ge'ez or Arabic | **code** | codepoint ranges — D36 |
| Assign IDs, write files, atomic rename | **code** | D32, design §6.4 |
| **Write the guide prose from supplied text** | **model** | needs judgment |
| **Translate, where no native source exists** | **model** | needs judgment |

That is the whole answer in one table. The model receives extracted text and
returns prose. It never chooses a filename, a format, a language set, or
whether something is "good enough". **Variance can only occur where a
decision is delegated, so we delegate almost nothing.**

The .md/.txt/one-file/many-files inconsistency you saw disappears by
construction: the pipeline never asks for files. It reads a response body.

---

## Layer 2 — Enforce the shape at the API, not in the prompt (D48)

Three mechanisms, strongest first. **Which ones LongCat supports is not
documented — it must be probed (see §5).**

**(a) JSON schema mode** — `response_format: {type:"json_schema", …}`.
The decoder is constrained; malformed JSON becomes impossible rather than
unlikely. Best if available.

**(b) Tool calling** — expose exactly ONE tool, `submit_guide`, with a typed
parameter schema, and require it. The model cannot reply with prose; it can
only call the tool. Your Hermes trace shows LongCat driving tools
(`web_search`, `terminal`), which is *suggestive* that tool calling works —
but Hermes may be parsing text itself rather than using native `tool_calls`,
so this is unconfirmed.

**(c) `response_format: {type:"json_object"}`** — guarantees valid JSON but
not the right *shape*. Useful as a fallback.

**(d) Prompt only** — what P0.2 used. Never sufficient alone.

Also: **`temperature: 0`** for every structural call. We are not looking for
creative variety in a safety document.

---

## Layer 3 — Validate everything, always (regardless of layer 2)

Even with schema mode, the pipeline validates before anything touches disk.
Layer 2 reduces failures; layer 3 makes them harmless.

```
response → parse JSON            fail → repair pass (§4)
         → validate vs schema    fail → repair pass
         → six sections present, each array or null
         → script check: ti in Ge'ez, ar in Arabic     (D36)
         → guide present ⇒ source_ref non-empty        (D1)
         → tier recomputable from origin + checks      (§4.1 data model)
         → no invented language keys, no extra fields
         → then, and only then, write
```

A response that fails validation is **never partially written**. The record
stays `ia.etat = "pending"` with the error recorded, and the daily sweep
retries it (data model §3.3). A half-written guide is worse than none.

---

## Layer 4 — Repair, then fail loudly

```
attempt 1  normal call
attempt 2  same call, temperature 0, plus the exact validation error
           ("section 'securite' was a string, must be an array or null")
attempt 3  reduced scope — ask for ONE language, not all seven
then       ia.etat = "failed", erreur recorded, item appears on the
           admin dashboard. A human decides.
```

**Never** silently accept degraded output. `tentatives` and `erreur` exist in
the frozen model precisely so a failure is visible rather than invisible.

---

## Layer 5 — One narrow call per task, not one big one

Splitting the work shrinks the variance surface further and makes each
failure cheap to retry:

```
call 1   write the guide, ONE language, from supplied text  → 6 sections
call 2   extract the PPE list from supplied text            → array of ids
call 3   translate ONE language                             → 6 sections
call 4   (different engine) translate Tigrinya              → 6 sections
```

Each returns a small object that is trivially checkable. Compare with "return
everything about this machine", where one bad field fails the whole item and
a retry costs the entire job.

Cache note: put the fixed instructions first and the variable text last, so
the constant prefix hits LongCat's free cache (design §2.1).

---

## 6. The probe — 10 minutes, answers what the docs won't

Run this before building P1.2. It determines which enforcement layer we get.

**Test A — JSON schema mode**
```bash
curl -s https://api.longcat.chat/openai/v1/chat/completions \
 -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
 -d '{"model":"LongCat-2.0","temperature":0,
      "messages":[{"role":"user","content":"Return the numbers 1 to 3."}],
      "response_format":{"type":"json_schema","json_schema":{"name":"n",
        "strict":true,"schema":{"type":"object","additionalProperties":false,
        "required":["nums"],"properties":{"nums":{"type":"array",
        "items":{"type":"integer"}}}}}}}'
```
PASS = valid JSON matching the schema. FAIL = an error mentioning
`response_format`, or prose.

**Test B — plain JSON mode**: same, with `"response_format":{"type":"json_object"}`.

**Test C — tool calling**
```bash
curl -s https://api.longcat.chat/openai/v1/chat/completions \
 -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
 -d '{"model":"LongCat-2.0","temperature":0,
      "messages":[{"role":"user","content":"Submit the guide for a drill."}],
      "tools":[{"type":"function","function":{"name":"submit_guide",
        "parameters":{"type":"object","required":["usage"],
        "properties":{"usage":{"type":"string"}}}}}],
      "tool_choice":{"type":"function","function":{"name":"submit_guide"}}}'
```
PASS = a `tool_calls` array in the response.

**Test D — determinism**: run the same real guide request 3× at
`temperature: 0` and diff. Identical or near-identical = good. Wildly
different = the prompt is under-specified, not the model.

### PROBE RESULTS — run 20 Aug 2026

**A · `response_format: {type:"json_schema"}` — WORKS (one sample).**
Returned exactly `{"nums":[1,2,3]}` — the schema's key. Telling detail: the
model's own `reasoning_content` used `"numbers"`, but the emitted content
used `"nums"`. The schema changed the output. Corroborated by the two
control calls below, which both produced *different* keys.

**B · `response_format: {type:"json_object"}` — valid JSON, no shape.**
Returned `{"response":"1, 2, 3"}` — and with a `json_schema` field attached
to a `json_object` type, `{"numbers":[1,2,3]}`. Both are valid JSON; neither
matched the schema. So `json_object` guarantees parseability only, exactly
as expected.

**C · Tool calling — WORKS.** `finish_reason:"tool_calls"` with a proper
`tool_calls` array and well-formed arguments.

**D · `tool_choice` IS NOT RELIABLY HONORED — this is the important result.**
The identical forced-tool request, at `temperature: 0`, was run three times:

```
run 1   finish_reason: "tool_calls"   ✔ called submit_guide
run 2   finish_reason: "stop"         ✘ returned prose, no tool call
run 3   finish_reason: "stop"         ✘ returned prose, no tool call
```

`tool_choice: {type:"function", …}` was set on all three. **At least two of
three ignored it.** A forced tool call is therefore NOT a usable enforcement
mechanism on this provider — it is a suggestion.

**D-bis · `temperature: 0` IS NOT DETERMINISTIC.** Runs 2 and 3 produced
different guides — different section structure ("Know Your Drill" vs "Choose
the Right Drill and Bit"), different lengths (797 vs 866 completion tokens).
Common for a large MoE model under batching, but it means **we can never
assume two identical calls give identical text.**

### What this settles

| Mechanism | Verdict | Use |
|---|---|---|
| `json_schema` | Promising — the only mode that produced the schema's exact key | **Primary enforcement**, pending the repeat test below |
| `json_object` | Works, shape not enforced | Fallback |
| `tool_choice` forcing | **Unreliable — 2 of 3 ignored** | **Do not rely on it** |
| `temperature: 0` | Reduces drift, does not eliminate it | Set it anyway |

**Layer 3 validation is not belt-and-braces — it is load-bearing.** If we had
built on forced tool calls, roughly two thirds of jobs would have returned
prose where the pipeline expected structured arguments. The layered design is
what makes that a retry instead of a corruption.

Two smaller observations from the traces: LongCat is a **reasoning model**
(`reasoning_tokens` 15–121 per call, billed as completion tokens — a real but
small cost multiplier), and **prompt caching is live** (`cached_tokens: 128`
on a repeat call), which confirms the fixed-prefix ordering in §5 pays off.

### CONFIRMATION RUN — 5/5 identical

Five identical calls all returned exactly `{"nums":[1,2,3]}`. No drift, no
key variation, no prose.

**What that does and does not prove.** It proves the output is *stable* under
schema mode — which is what we need day to day, and it is a good result.
It does **not** yet separate ENFORCEMENT (constrained decoding, where an
off-schema token is impossible) from AGREEMENT (the schema is injected into
the prompt and the model complies). The prompt "return the numbers 1 to 3"
asks for precisely the shape the schema describes, so a well-behaved model
produces it either way. Both mechanisms look identical on an easy prompt.

They diverge only when the model *wants* to do something else — which is the
case that matters at 3am on machine 287 of 350, on a manual with an odd
layout. **The hostile test below is the one that distinguishes them**, and it
takes thirty seconds.

### The one test left — 30 seconds

```bash
curl -s https://api.longcat.chat/openai/v1/chat/completions \
 -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
 -d '{"model":"LongCat-2.0","temperature":0,
      "messages":[{"role":"user","content":"Explain in detail how to use a drill, with headings and at least 200 words. Also add a field called notes with your safety advice."}],
      "response_format":{"type":"json_schema","json_schema":{"name":"n",
        "strict":true,"schema":{"type":"object","additionalProperties":false,
        "required":["nums"],"properties":{"nums":{"type":"array",
        "items":{"type":"integer"}}}}}}}'
```

The prompt demands prose, headings, 200+ words and an extra `notes` field.
The schema permits none of it (`additionalProperties: false`, one required
key, integers only).

| Outcome | Meaning | Consequence |
|---|---|---|
| `{"nums":[…]}` only, no `notes`, no prose | **Enforcement.** Off-schema output is structurally impossible | Lean on schema mode; repair loop rarely fires |
| Contains `notes`, or prose, or extra keys | **Suggestion.** The schema is guidance the model can override | Same pipeline, but validation and repair carry the real weight |

Either result is fine and neither changes the architecture. It changes how
much we trust a single call, and therefore how aggressively the pipeline
re-checks. Worth thirty seconds to know which world we are in.

### The hostile test HUNG — and that is a production finding (D50)

Run without `max_tokens`, the hostile prompt did not return. Most likely
cause: **the prompt and the schema are in direct conflict.** The prompt
demands 200+ words of prose and an extra field; the schema permits only
`{"nums":[integers]}`. LongCat is a reasoning model, and `reasoning_content`
is generated *before* the constrained output — reasoning is almost certainly
not schema-constrained. So the model can reason at great length trying to
reconcile an impossible instruction, with nothing pulling it to a stop.

**This matters far more than the test it was meant to run.** In production a
prompt/schema conflict would not fail — it would HANG. A hung job holds a
worker, blocks the queue, and on Cloudflare's free plan the queued message
then expires after 24 h and the item vanishes silently (design §5.1).

**Every call therefore carries three independent stops:**

```
max_tokens            hard ceiling on generation   (server-side)
client timeout        e.g. 60 s per call           (our side)
job timeout           the whole item, e.g. 5 min   (queue side)
```

A call that hits any of them is a normal `failed` outcome: `ia.tentatives`
increments, `ia.erreur` records which stop fired, the item stays visible on
the dashboard. **Never an infinite wait.**

Second lesson, cheaper but real: **do not put the model in an impossible
position.** Our production prompts always ask for exactly what the schema
describes — the conflict here was deliberate, to probe the boundary, and it
is not a shape any real call should ever take.

### Re-run of the hostile test, with stops

```bash
curl -s --max-time 60 https://api.longcat.chat/openai/v1/chat/completions \
 -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
 -d '{"model":"LongCat-2.0","temperature":0,"max_tokens":200,
      "messages":[{"role":"user","content":"Explain in detail how to use a drill, with headings and at least 200 words. Also add a field called notes with your safety advice."}],
      "response_format":{"type":"json_schema","json_schema":{"name":"n",
        "strict":true,"schema":{"type":"object","additionalProperties":false,
        "required":["nums"],"properties":{"nums":{"type":"array",
        "items":{"type":"integer"}}}}}}}'
```

| Outcome | Meaning |
|---|---|
| `{"nums":[…]}` | **Enforcement** — the schema won against a hostile prompt |
| `finish_reason:"length"`, truncated/empty content | Inconclusive — it burned the budget reasoning. Also fine: it proves the stops work |
| Prose or a `notes` field | **Suggestion** — validation and repair carry the weight |

Any of the three is an acceptable answer. The hang was the real result.

### HOSTILE TEST, WITH STOPS — the real finding is reasoning starvation

```
finish_reason      "length"
completion_tokens  200
reasoning_tokens   199        <- 199 of 200
message            { role, reasoning_content }   <- NO content key at all
```

Three facts, each of which changes the build:

**1. Reasoning is NOT schema-constrained.** The `reasoning_content` opens with
`{` and then plans prose: *"Heading 1: Understanding Your Drill… Heading 2:
Choosing the Right Bit…"*. During reasoning the model was following the
PROMPT, not the schema. Whatever the schema constrains, it is not this phase.

**2. Reasoning consumes `max_tokens`.** 199 of a 200 budget went to thinking,
leaving one token for output — so nothing was emitted. **`max_tokens` must
budget for reasoning PLUS output, not output alone.** Sizing it to "about
what a guide needs" would starve every call. For a ~450-word guide: content
≈600 tokens, reasoning observed at 15–199+ and unbounded on a confusing
prompt, so **budget 2 500–3 000** and treat that as normal, not generous.

**3. `content` can be ABSENT, not empty.** The message object has no
`content` key at all. Parsing code must handle a missing key, not merely an
empty string — `msg.get("content")` returning `None`, never `msg["content"]`.

### D51 — `finish_reason: "length"` is its own failure class

It does not mean the model produced something wrong. It means **the budget
was too small**. So it is handled differently from a validation failure:

```
validation failure  → repair pass, restate the error, same budget
length failure      → RETRY WITH A LARGER BUDGET (2x, once)
                      then fail to `pending` with erreur="token budget"
```

Repairing content that was never generated is meaningless; the earlier repair
loop would have looped uselessly. Recorded in `ia.erreur` so a run of these
is visible as a budget problem rather than a quality problem.

### Still not settled: enforcement vs suggestion

We never reached the content phase, so the original question stands. But the
useful risk has moved: the danger is not the model violating the schema, it
is **the model never getting to the output at all.**

One last discriminating test, sized so reasoning cannot starve it — short
task, forbidden extra field, generous budget:

```bash
curl -s --max-time 60 https://api.longcat.chat/openai/v1/chat/completions \
 -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
 -d '{"model":"LongCat-2.0","temperature":0,"max_tokens":2000,
      "messages":[{"role":"user","content":"Return the numbers 1 to 3. Also add a field called notes containing the word hello."}],
      "response_format":{"type":"json_schema","json_schema":{"name":"n",
        "strict":true,"schema":{"type":"object","additionalProperties":false,
        "required":["nums"],"properties":{"nums":{"type":"array",
        "items":{"type":"integer"}}}}}}}'
```

`{"nums":[1,2,3]}` with **no** `notes` → enforcement.
`notes` present → suggestion, and validation carries the weight.

Either way the pipeline is built the same. This is the last open question,
and it is a nice-to-know rather than a blocker.

### SETTLED — `json_schema` is real ENFORCEMENT, not suggestion

Five identical runs, and the proof is the gap between two fields of the same
response:

```
reasoning_content   {"numbers": [1,2,3], "notes": "hello"}   <- what it WANTED
content             {"nums": [1, 2, 3]}                      <- what it COULD emit
```

The model decided to include `notes`, and used its own preferred key
`numbers`. Neither survived. **It wanted to break the schema and was unable
to.** Reasoning is unconstrained, so it shows intent; the emitted content is
constrained, so it shows what is possible. The divergence is the evidence.

That is constrained decoding. Off-schema output is not unlikely — it is
structurally impossible.

### What this unlocks: constrain VALUES, not just shape (D52)

If the decoder cannot emit off-schema tokens, then anything we can express in
JSON Schema becomes impossible to get wrong. That moves several checks from
"validate afterwards and retry" to "cannot happen":

```jsonc
"manual_state": { "enum": ["disponible","sans_objet","introuvable","a_rediger"] },
"epi":     { "type":"array", "items": { "enum": ["gants","lunettes","casque_antibruit", …] } },
"epi_source": { "enum": ["manual","not_specified"] },
"sections": { "required": ["usage","securite","demarrage","utilisation","arret","problemes"],
              "additionalProperties": false },
"guide_ti": { "pattern": "^[\u1200-\u137F\s\p{P}\d]+$" }   // Ge'ez only
```

The invented-category problem disappears. The missing-section problem
disappears. And the **Latin-transliteration Tigrinya failure from P0.2 —
where the model silently switched script — becomes unrepresentable** if the
Unicode-range pattern holds.

**Keep the code checks anyway** (D36 script validation stays). Two reasons:
regex over real text with punctuation, digits and loanwords is fiddly enough
that the pattern may need loosening, and if it loosens, the code check is
what still catches a Latin-script guide. Belt and braces where the cost is
five lines.

### Final state of the enforcement ladder

| Layer | Status |
|---|---|
| 1 · Deterministic work in code, not the model | design decision, ours regardless |
| 2 · `json_schema` enforcement | ✔ **proven — constrained decoding** |
| 2b · Values constrained by enum/pattern | ✔ available, now specified (D52) |
| 3 · Validation before any write | still required — for semantics the schema cannot express |
| 4 · Repair, then fail loudly | still required — mainly for `length` failures (D51) |
| ✘ `tool_choice` forcing | excluded — 2 of 3 ignored it |

What layer 3 still catches, because no schema can: whether the text is
*supported by the source*, whether a `native` claim matches a genuinely
different file (D45), whether a translation preserved a negation. Shape is
solved. **Meaning is not, and never will be by a schema.**

### (superseded) Original confirmation instructions

One sample is not proof that `json_schema` *enforces* rather than *suggests*.
Run the schema call **five times**, and once with a hostile prompt that
tempts the model off-schema:

```bash
# five identical runs — all five must return exactly {"nums":[...]}
for i in 1 2 3 4 5; do
  curl -s https://api.longcat.chat/openai/v1/chat/completions    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json"    -d '{"model":"LongCat-2.0","temperature":0,
        "messages":[{"role":"user","content":"Return the numbers 1 to 3."}],
        "response_format":{"type":"json_schema","json_schema":{"name":"n",
          "strict":true,"schema":{"type":"object","additionalProperties":false,
          "required":["nums"],"properties":{"nums":{"type":"array",
          "items":{"type":"integer"}}}}}}}'    | python -c "import sys,json;print(json.load(sys.stdin)['choices'][0]['message']['content'])"
done

# hostile: ask for prose and an extra field the schema forbids
#   content: "Explain drills in detail, and include a 'notes' field."
#   PASS = still only {"nums":[...]}, no prose, no notes field
```

If all five conform and the hostile prompt is contained, `json_schema` is
enforcement and we lean on it. If any drift, it is a strong suggestion and
the repair loop (§4) carries more weight. **Either way the pipeline is the
same** — this only changes how often layer 4 fires.

### What each outcome means

| Result | Plan |
|---|---|
| A passes | Use JSON schema mode. Strongest. Layers 3–5 still apply. |
| A fails, C passes | Use the single forced tool call. Nearly as strong. |
| Only B passes | JSON guaranteed, shape validated in code, repair loop matters more. |
| None pass | Prompt + strict validation + repair. Still safe — layer 3 is what makes it safe — but expect more retries. |

**Nothing in the design depends on the answer.** Layer 1 is where most of the
reliability comes from, and it is ours regardless.
