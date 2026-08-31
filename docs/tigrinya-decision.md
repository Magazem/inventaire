# Tigrinya — decision brief

One page for the conversation with your manager. Updated 20 Aug 2026 — **now backed by test results, not speculation.**

---

## What the test found (new — this is the evidence)

Twelve real machines were run through the pipeline. The English guides were good: 11 of 12 written, all judged usable.

**The Tigrinya was not.** Of the 11 guides:

| | |
|---|---|
| Clean | 5 |
| **Meaning-level errors** | **5** |
| Wrong script entirely (Latin letters, not Ge'ez) | 1 |

Actual errors found:

- **"Always wear eye protection"** became **"Always DON'T wear eye protection"**
- **"extremely hot, could burn you"** became **"very cold, could burn you"**
- **"replace the blade if damaged"** became **"replace the blade if stuck"**
- "parallel" → "patience"; "across the grain" → "overlapping"; "sparks" → "fire"

That is roughly a **50% error rate**, and it is the *optimistic* figure — the model was checking its own work, which is the weakest form of verification. An independent check would likely find more.

**The important part: an automatic check caught every one of these.** The system is not blind. But it means unsupervised Tigrinya publication is not defensible.

---

## The problem

We planned to verify each language with someone in-house. For Tigrinya that person doesn't exist — nobody who reads Tigrinya also reads French well enough to check a translation against the original.

So Tigrinya guides would be **machine-translated safety text that nobody in the company can check.** That is the situation where AI translation carries the most risk, because an error is undetectable internally — and the test above shows the risk is real, not theoretical.

---

## The instinct to check first

> *"Leaving it to them is less legal liability on us."*

Probably not, and this is worth being clear on before the decision.

Under EU health-and-safety law (Framework Directive 89/391) and its Luxembourg implementation, **the employer already has a duty to inform and train workers adequately about the risks of their work** — and instructions are supposed to be given as though the worker has no prior knowledge of the risks. That duty exists today, with or without this inventory. It is discharged through **training**, not through a web page.

So:

- **Removing Tigrinya does not remove the obligation.** It removes a help.
- **A worker who can't read the instructions operates the machine anyway** — the risk doesn't disappear, it just becomes invisible to you.
- What actually limits exposure is being explicit that **this tool supplements training, it does not replace it.** That framing should be visible in the tool itself, in every language.

*I'm not a lawyer and this is not legal advice. If liability is genuinely the deciding factor, it's a short question for whoever handles your insurance or compliance — and worth asking, because the answer probably points the other way from the intuition.*

---

## The insight that resolves most of it

**We don't need to verify the translation. We need to verify comprehension.**

You cannot ask a Tigrinya reader "does this match the French?" — nobody can do that. But you can ask:

> *"Read this, then show me how you'd start this machine."*

If what they do matches the machine, the translation worked. If they do something wrong or look confused, it didn't. **That test needs no French, no second language, and no translator** — just a Tigrinya-speaking worker and ten minutes at the machine.

It is also the better test. A translation can be linguistically faithful and still incomprehensible. What matters is whether the person ends up doing the right thing.

---

## Two other checks that need no Tigrinya speaker at all

**Cross-engine comparison (stronger — and now the plan).** Google Cloud Translation supports Tigrinya; DeepL does not. So a completely different engine translates the same English guide into Tigrinya, and the two versions are compared. Two independent systems agreeing is real evidence; one system agreeing with itself is not. Volume is tiny — one language, roughly 840,000 characters for the whole inventory, once.

**Back-translation.** Take the Tigrinya output, translate it back to English with a *different* model, and compare against the original. Gross errors — a dropped "not", an inverted instruction, a missing warning — show up immediately. It won't catch clumsy phrasing, but clumsy phrasing isn't what hurts someone. Automatic, costs almost nothing, can run on every item.

**Paid human translation, for the dangerous machines only.** Not 400 items — the ten or twenty where a wrong instruction could injure someone. A professional Tigrinya translator for that handful is a small, one-off cost, and it puts verified text exactly where the risk is.

---

## Four options for tomorrow

| | Option | What workers get | Honest trade-off |
|---|---|---|---|
| **A** | Tigrinya for everything, clearly labelled *traduction automatique* | Full coverage | Unverified text on dangerous machines |
| **B** | **Tigrinya for ordinary items; safety-critical machines show pictograms + "formation obligatoire" only** | Help where it's safe to help, no unverified text where it's not | Some machines have no Tigrinya guide — by design |
| **C** | No Tigrinya at all | French or Arabic, or nothing | Doesn't reduce the underlying duty; just removes a help |
| **D** | **B, plus paid human translation for the ~15 dangerous machines** | Full coverage, verified where it counts | A small one-off cost |

**My recommendation, now firmer given the results: B, with D if the manager will fund it.** Option A is no longer defensible — a 50% error rate including an inverted safety instruction is not something to label your way out of. B is free and ships immediately. D closes the gap for the price of an afternoon's translation work.

**Also settled since:** Arabic now has a named checker — you — so it no longer sits in the unverified group.

**One thing the results changed:** the automatic back-translation check is now a permanent part of the pipeline, and it runs on **every** language nobody can verify — including **Arabic**, which has never been checked and shows the same kind of drift. Tigrinya was simply the case we looked at first.

Whichever is chosen, add the comprehension test in the pilot — it costs ten minutes and it's the only evidence you'll have either way.

---

## What this changes in the design

1. **Every language gets a named checker, or it's marked unverified.** Tigrinya is the sharpest case of a general question: who checks Arabic? Portuguese? If a language has no checker, it gets the same treatment as Tigrinya, honestly labelled.
2. **Pictograms carry the safety load, not the text.** Already in the design (§7.5) and this promotes it from "nice" to "the primary safety channel for anyone we can't verify a language for".
3. **A permanent banner in every language**: *"Ce guide complète la formation. Il ne la remplace pas."* Cheap, honest, and the single most useful sentence in the whole system.
4. **Unverified languages are labelled in the interface**, not silently equal to verified ones. A worker seeing *"traduction automatique"* calibrates their trust correctly; a worker seeing nothing assumes it's official.

---

## The one thing not to do

Ship Tigrinya that looks exactly as authoritative as French, with no label, no check, and no pictograms behind it. That's the only genuinely bad option — and it's also the easy default if nobody decides.
