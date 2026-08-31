# Should we use DeepL for translation?

Short answer: **not for the problem we actually have** — but your instinct
(use a real translation engine, not an LLM) is right, and there is a better
version of it.

## The blocker

**DeepL does not support Tigrinya.** Confirmed in DeepL's own developer
documentation: the supported-language list includes French, German, Italian,
Portuguese and Arabic — and no Tigrinya, in any variant.

So DeepL would improve the five languages that ALREADY PASSED and do nothing
for the one language that FAILED. That is backwards from what we need.

## The quota is also not what it looks like

  DeepL API Free    500,000 chars/month  — CAN NO LONGER BE PURCHASED
  DeepL Developer   1,000,000 chars      — ONE TIME, LIFETIME, NON-RESETTING

The 1M you saw is a lifetime allocation, not monthly.

Budget check (a guide is ~400 words ~= 2,400 characters; DeepL bills the
source characters once per target language):

  2,400 chars x 5 supported languages   = 12,000 chars per machine
  1,000,000 / 12,000                    = ~83 machines

So the entire free allocation covers roughly 80 of your 250-350 models,
once, forever. Paid would be roughly $80-120 for the full run, against
about $3 on the token pack you already own.

## The better version of your idea: Google for Tigrinya

**Google Cloud Translation DOES support Tigrinya** (code `ti`, on its
neural translation model). That matters far more than DeepL's quality edge,
because it gives us something we have not had:

  A SECOND, INDEPENDENT ENGINE FOR THE LANGUAGE NOBODY CAN CHECK.

Right now our Tigrinya verification is LongCat marking its own homework,
which the test showed is weak (~50% errors found, probably more missed).
Replace it with cross-engine comparison:

  LongCat translates EN -> Tigrinya
  Google  translates EN -> Tigrinya   (completely different architecture)
  compare the two:
      they agree      -> genuine confidence, two independent systems concur
      they disagree   -> flag for a human, do not publish

Two independent engines agreeing is real evidence. One engine agreeing with
itself is not. This attacks the exact failure the test found, which is
something DeepL structurally cannot do.

Volume is small because it is one language only:
  2,400 chars x 350 models = ~840,000 characters, total, one time.
That sits inside or near Google's free monthly allowance — confirm the
current figure at build time, but this is single-digit dollars either way.

## A good use for the DeepL 1M — calibration, not production

A non-renewing allocation is worth more spent on MEASUREMENT than on output.

Spend it once, on ~40 guides, translating to French, German, Italian and
Portuguese with DeepL, and compare against LongCat's versions of the same
guides. That answers a question we currently cannot answer: are LongCat's
European translations actually good, or merely unchecked?

  ~40 guides x 2,400 chars x 4 languages = ~384,000 chars
  Leaves most of the allocation spare.

If LongCat matches DeepL closely, we keep LongCat for everything and have
evidence for it. If it does not, we know before 350 items are published.

## Recommendation

  1. KEEP LongCat as the translation engine.        (cost, and it passed)
  2. ADD Google Cloud Translation for TIGRINYA ONLY, as an independent
     cross-check. This replaces self-back-translation for that language.
  3. ARABIC needs no engine change — you speak it and are verifying it.
     That makes you the named checker, which is stronger than any engine.
  4. SPEND the DeepL 1M once, as a calibration audit of the European
     languages, not as production translation.

Net effect: the failing language gains real verification, the passing
languages gain evidence, and the cost stays near zero.

## One caveat

Google Cloud needs a billing account and an API key — more setup than DeepL.
It is Phase A only, so no key ever reaches the workshop (D18), and it can be
switched off the moment bulk capture ends.
