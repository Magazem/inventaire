# Data model — FROZEN v1.0

P1.1. Companion to design study v16. **Audited against decisions D1–D44
before freezing**; 16 problems found and fixed. The audit notes are in
section 14 — worth reading, because two of them would have been dangerous.

---

## 0. What "frozen" means

Not "unchangeable" — "changeable at a known cost".

**FREE** — no migration
  - adding a category, location, status, pictogram, glossary term (D9/D27/D41)
  - adding an OPTIONAL field
  - `index.js` rollups — they are regenerated from the model files, so their
    shape is never frozen

**CHEAP** — one scripted pass over the files
  - adding a REQUIRED field with a default
  - splitting or renaming a file
  - **adding a language.** Not free: it touches `names` and `search_terms`
    on every model, `noms` on every list entry, a new font in the
    stylesheet — plus writing ~350 guides. Scripted work is small; content
    work is not. Do not promise this as free.

**EXPENSIVE — this is what we are freezing**
  - the ID format, and anything printed on a physical label
  - the six guide section keys
  - the `guides` / `names` / `search_terms` shape
  - `checks` being a LIST, not an object (section 4)
  - the meaning of `manual_state`, the trust tiers, or `danger_eleve`
  - `manuels` being a MAP per language, not a single path (section 3)
  - the unit of measure on stock quantities (section 5)

`schema_version` lives in the **file wrapper only** — never inside a record.
One level, or a migration script reads it from the wrong place.

---

## 1. Files on disk

```
\\SERVER\inventaire\data\
  index.js            window.INVENTAIRE_INDEX
  modeles/M-0042.js   window.INVENTAIRE_MODELE_M_0042
  unites.js           window.INVENTAIRE_UNITES
  stock.js            window.INVENTAIRE_STOCK
  mouvements/M-0051.js window.INVENTAIRE_MOUVEMENTS_M_0051   (sharded)
  categories.js  emplacements.js  statuts.js  epi.js  glossaire.js
  journal.js          window.INVENTAIRE_JOURNAL    AI job audit trail
```

Every file is exactly:

```js
window.INVENTAIRE_XXX = { schema_version: 1,
                          generated_at: "2026-08-20T14:32:00Z",
                          data: … };
```

Naming matches design 6.3 (`window.INVENTAIRE_*`). `.js` not `.json`
because a page opened from disk cannot read JSON.

**Movements are sharded per model**, same rule as guides — otherwise one
unbounded file is rewritten on every stock change and read by every page.

### Write rule (D15)

A guide edit rewrites **one model file**. It rewrites `index.js` **only if**
`manual_state`, `langs`, or a rollup changed — which a guide edit often
does, so this is not "never". What D15 actually forbids is regenerating the
**site**. No HTML is ever rebuilt. Say it that way in `LISEZ-MOI.txt`;
"never touch the index" is false and produces stale search.

---

## 2. Identifiers

| Kind | Format | Example | Assigned by |
|---|---|---|---|
| Model | `M-` + 4 digits | `M-0042` | server (Phase A) / admin page (Phase B) |
| Unit | `TYPE-` + 3 digits | `ECRAN-005` | same, sequential per type |
| Movement | `MV-` + 6 digits | `MV-000123` | admin page, from `dernier_mv` in `stock.js` |
| List entries | lowercase slug | `jardinage` | admin, on creation |

- **Never assigned by the phone.** Two colleagues capturing at once would
  both get `ECRAN-005` (D6).
- **Unit IDs are never reused**, even after scrapping — the number may be
  written on something physical.
- `TYPE` is uppercase ASCII, no accents, no spaces: it appears on labels
  and in filenames.
- In Phase B there is no server (D18), so the admin page assigns from a
  stored counter. Name it now or the first movement has no id.

---

## 3. MODEL

Legend: **R** required · *O* optional · `~` nullable

```js
{
  model_id:          "M-0042",              R
  type:              "MEULEUSE",            R   uppercase, drives unit IDs
  brand:             "Makita",              R   null for consumables ~
  model_number:      "GA5030R",             R   null for consumables ~
  model_number_raw:  "GA530R M14 125mm",    R   exactly as typed off the sticker
  category:          "bricolage",           R   -> categories.js

  suivi:             "unites",              R   "unites" | "quantite"
  consommable:       false,                 R   D28 — see below
  mouvements:        false,                 R   movement logging on?

  photo:             "photos/M-0042.jpg",   R   null for consumables ~ (D28)
  photo_plaque:      "photos/M-0042-plaque.jpg",  O ~
  manuels: {                                R   MAP, not a path — D43 pattern B
    en: "manuels/M-0042-en.pdf",
    fr: "manuels/M-0042-fr.pdf"             a DIFFERENT document per locale
  },

  names:        { en:"…", fr:"…", ar:"…", de:"…", ti:"…", pt:"…", it:"…" },  R
  search_terms: { fr:["disqueuse"], ar:["بطارية جافة"], … },                 R (may be empty arrays)

  manual_state: "disponible",               R  see 3.1
  extraction:   "ok",                       R  "ok"|"failed_scanned"|"failed_other"|null

  // SAFETY — two separate things. See 3.2. This split matters.
  danger_eleve:  true,                      R   PERMANENT property of the machine
  approbation:   { par: "Marc", at: "2026-08-21" },   R ~  null = not approved
  epi:           ["gants","lunettes"],      R   -> epi.js where genre="obligatoire"
  dangers:       ["projection","bruit"],    R   -> epi.js where genre="danger"
  epi_confirme:  true,                      R   D30 — false = "à définir", NOT "none"
  epi_confirme_par: "Marc",                 R ~
  epi_source:    "manual",                  R   "manual" | "not_specified"

  guides:  { … },                           R   section 4
  ia:      { … },                           R   section 3.3
  ia_meta: { … },                           O   section 3.4

  created_at, created_by, updated_at, updated_by,   R
  versions: [ … ]                           R   section 6
}
```

**Consumables** (`consommable: true`) may have `brand`, `model_number`,
`photo`, `photo_plaque` and `manuels` all null (D28: names and quantities
only). Every other required field still applies. The flag exists because
D28 defers *which* consumables get movement logging until the list exists —
and you cannot list them without a marker. The capture flow already
collects it (design 5.2 step 2); the model must not throw it away.

### 3.1 `manual_state` — four values (D19), plus `extraction`

`disponible` · `sans_objet` · `introuvable` · `a_rediger`

`extraction` is **separate on purpose**. The MAXX in our test was a manual
that *was found* — URL known, PDF downloadable — but scanned with no text
layer. Writing `introuvable` ("searched, nothing found") would be a false
statement to the worker and would bury a recoverable to-do (someone can
OCR or retype it) inside a state design 4.4 treats as finished. So:
`manual_state: "a_rediger"`, `extraction: "failed_scanned"`,
`manuels.en` still populated.

**A human-set `sans_objet` is never overwritten by the pipeline.** If the
capturer ticked "pas besoin de mode d'emploi", the AI result is discarded.

### 3.2 Why `danger_eleve` and `approbation` are two fields

The first draft had a single `safety_flag`, used for two incompatible jobs.
Design 5.7 uses it as an approval gate; D31/5.4 uses it as a permanent
rendering rule (dangerous machines show pictograms and *formation
obligatoire* instead of unverified translated text). With one boolean both
exits are wrong: leave it `true` and the model can never publish; clear it
on approval and you erase the fact that the machine is dangerous —
silently switching the worker page back to unverified Tigrinya text on
exactly the machines where that was forbidden.

So: **`danger_eleve` is permanent and never cleared.** `approbation: null`
blocks publication; setting it unblocks. Publication gates on
`approbation === null`, never on the hazard flag.

### 3.3 `ia` — job state (design 5.1)

```js
ia: { etat: "done",        // "pending" | "done" | "failed" | "skipped"
      tentatives: 1,
      derniere_tentative: "2026-08-20T09:20:00Z",
      erreur: null }
```

Free-plan queue messages expire after 24 h, so a stalled job vanishes
silently. Without this, at export time a guideless model is
indistinguishable between *AI never ran* (re-queue), *AI ran and found
nothing* (`introuvable`, finished) and *human said not needed*
(`sans_objet`, finished). Design 5.6's "capture wide" strategy guarantees a
large population of these. This is cloud-side state that must survive the
export, so it lives in the record.

### 3.4 `ia_meta` — the audit trail

```js
ia_meta: { candidates_tried: ["GA530R","GA5030R","GA 5030 R"],
           unsupported_omitted: ["…"],
           source_lang: "en" }
```

`candidates_tried` is why a false `introuvable` can be diagnosed without
re-running. `unsupported_omitted` is what the model was tempted to add and
left out — a run where it is always empty is a run where nothing was being
resisted, which is worth noticing. Both also land in `journal.js`.

---

## 4. GUIDES — one entry per language

```js
guides: {
  fr: {
    sections: {              // exactly these six keys, always all six
      usage:       ["À quoi sert la machine…"],
      securite:    ["Porter des gants.", "Ne jamais retirer le carter."],
      demarrage:   ["Vérifier le disque.", "Brancher.", "…"],
      utilisation: ["Tenir à deux mains."],
      arret:       ["Relâcher.", "Débrancher."],
      problemes:   null        // null = not covered by the manual
    },

    tier: "native",            // DERIVED — never hand-set. See 4.1

    origin: {
      method: "native",        // "native" | "translated"
      from_lang: null,         // ~ set when translated
      source_url: "https://…/be-fr/…",   // ~
      source_ref: "Husqvarna — Manuel d'utilisation 545RXT (husqvarna.com/be-fr, 2026-08-20)",
      tier_source: 1,          // 1 manufacturer | 2 aggregator (D33)
      pattern: "B",            // "A" section of multilingual PDF | "B" per-locale
      pages: null              // [32,42] for pattern A
    },

    checks: [                  // LIST, append-only — never one object
      { method: "cross_engine", result: "clean", notes: null,
        at: "2026-08-20T09:25:00Z", par: null }
    ],

    verified_by: "yazan",  verified_at: "2026-08-20",   // ~
    edited_by: null,       edited_at: null              // ~
  },
  en: {…}, ar: {…}, de: {…}, ti: {…}, pt: {…}, it: {…}
}
```

**Provenance is per language, not per model.** D43 means the French guide
may come from a different document than the English one — a different
locale, possibly a different tier. Storing one source line on the model
would show a reader "Makita's own site" under French text that actually
came off an aggregator. On a safety document, in a system whose entire
anti-hallucination argument rests on the source line being true, that is
not acceptable. Hence `source_ref` and `tier_source` inside `origin`.

**`checks` is a list** because Tigrinya gets a cross-engine check now (D35)
and a comprehension test at the machine later (D31), and a term correction
after that (5.5). A single object loses the earlier evidence. Methods:
`cross_engine` · `back_translation` · `comprehension` · `human_translation`.

**A section the manual does not cover is `null`, never `[]`.** `null`
renders as *"Non couvert par le manuel."*; `[]` renders as nothing, which
reads as "there is nothing to say" — a different and misleading claim.

**Each section is an array of strings.** One element = a paragraph, several
= ordered steps. `demarrage`/`utilisation`/`arret` render numbered, the rest
as bullets. That is a rendering rule, not data.

**A language may be absent entirely** — the worker page falls back to
French with a notice (design 6.7), never a blank page.

### 4.1 `tier` derivation (D44) — computed, never typed

In order; first match wins:

```
origin.method == "native"                         -> "native"
checks has {result:"errors"}                      -> "auto"   (D37, always)
verified_by is set                                -> "verified"
checks has {method:"cross_engine", result:"clean"} -> "cross_checked"
otherwise                                          -> "auto"
```

Validation: `tier` must be recomputable from `origin` + `checks` +
`verified_by`. A stored `tier` that disagrees is a hard error, not a
warning. A guide with a failed check can never be `verified` or
`cross_checked` — that is what D37 means in practice.

---

## 5. UNIT, STOCK, MOVEMENT

```js
// unites.js
{ unit_id: "MEULEUSE-003",  model_id: "M-0042",     R
  photo: null,                                       O ~ falls back to model photo
  emplacement: null,                                 R ~ null IS legal — 7.2 lists them
  statut: "en_service",                              R  -> statuts.js
  notes: "",                                         O
  historique: [                                      R  append-only, never edited
    { at:"2026-09-12T14:20:00Z", statut:"hors_service",
      signale_par:"Marc",                            // free text, no accounts (D21)
      raison:"Le moteur ne démarre plus, fumée à l'allumage" } ],
  added_at, added_by }                               R

// stock.js
{ model_id: "M-0051",                                R
  unite_mesure: "u",                 R  "u"|"L"|"kg"|"m"  — freeze it NOW
  quantites: { atelier: 10, camionnette_2: 5 },      R ~  null when mouvements=true
  quantites_calculees: null,          R ~  set by replay when mouvements=true
  calcule_at: null,                   R ~
  dernier_mouvement_at: null,         R ~  so the worker page never loads the log
  seuil_bas: 3,                                      O ~
  dernier_mv: 123,                    R  movement id counter
  updated_at, updated_by }

// mouvements/M-0051.js
{ id:"MV-000123", model_id:"M-0051", at:"…",         R
  sens:"sortie",                     R  "entree"|"sortie"|"inventaire_initial"
  quantite:10, emplacement:"atelier",                R
  personne:"Marc",                   R  free text
  note:"" }                                          O
```

**The two stock modes are structural, not a convention.** When
`mouvements` is true, `quantites` is **null** and the truth is
`quantites_calculees`, replayed from the log. When false, `quantites` is
the truth and `quantites_calculees` is null. Enforced in validation —
otherwise a movement-tracked item carries a `quantites` object that isn't
the truth, is indistinguishable from one that is, and any code path will
happily write to it. That is exactly the "number and log disagree, both
lose credibility" failure design 4.6 exists to prevent.

`unite_mesure` is frozen now because D20 names *huile* as a consumable and
`{ atelier: 10 }` cannot say whether that is 10 litres or 10 cans. Adding
it later changes the meaning of values already captured.

`historique` and `mouvements` are **append-only**. Corrections are new
entries. That is what makes them evidence.

---

## 6. Version history

```js
versions: [ { at:"…", by:"yazan", what:"guides.fr",
              snapshot_file:"_sauvegardes/2026-08-20/M-0042-1432.js" } ]
```

Pointers, not copies, or the model file grows without limit. Restore =
copy the snapshot back and append a new entry. Never delete an entry.

---

## 7. The lists (user-editable — D9/D27/D41)

```js
// categories.js    { id, noms:{7 langs}, icone, ordre }
// emplacements.js  { id, noms, type:"atelier"|"vehicule"|"depot"|"bureau", ordre }
// statuts.js       { id, noms, couleur, visible_worker: true }
// epi.js           { id, noms, picto:"pictos/M004.svg",
//                    genre:"obligatoire"|"danger" }        <- BOTH live here
// glossaire.js     { ar:{ "maintenance-free battery":"بطارية جافة" }, fr:{…} }
```

`epi[]` references `genre:"obligatoire"`; `dangers[]` references
`genre:"danger"`. Both validated. Without this stated, `dangers` reads as
free text and the yellow-triangle rendering in design 7.5 silently breaks.

`statuts.visible_worker: false` hides a status from the worker page
(e.g. `retire`) while keeping it in admin.

---

## 8. index.js — the only file the worker page loads at startup

Target under ~500 KB for 350 models + 500 units.

```js
{ models: [
    { id:"M-0042", type:"MEULEUSE", brand:"Makita",
      model_number:"GA5030R", model_number_raw:"GA530R M14 125mm",
      category:"bricolage", photo:"photos/M-0042.jpg",
      names:{ en:"…", fr:"…", ar:"…", de:"…", ti:"…", pt:"…", it:"…" },
      terms:["disqueuse","بطارية جافة"],     // flattened search_terms (D42)
      manual_state:"disponible", suivi:"unites", consommable:false,
      langs:["en","fr","de","it"],
      // rollups so the admin dashboard needs no model files:
      epi_ok:true, non_verifie:["ti"], flags:[], danger_eleve:true,
      unit_count:3 } ],
  units: [                                    // needed — see below
    { uid:"MEULEUSE-003", mid:"M-0042", emp:"camionnette_2", st:"en_service" } ] }
```

**Units must be in the index.** Design 7.1 requires search to match the
**ID** — and under D7 the ID physically on the machine is the *unit* ID.
A worker reading the label off a grinder must be able to type it. Without
this the label scheme is unsearchable, and the status band (4.5), "units
with no location" (7.2) and the startup count (6.6) all need model files.
Short keys keep it to a few tens of KB.

**`terms` is flattened across languages deliberately** — a worker with the
interface in French still finds the item by typing the Arabic trade term.

**The rollups are regenerated, never authoritative** — so their shape is
free to change (section 0). They exist so the admin dashboard (7.2) does
not open 350 files to draw its opening screen, which is the exact cost
design 6.2 was built to avoid.

Guide text is never in the index.

---

## 9. The AI output contract (D34)

One JSON object, never files. Anything else is a failed job.

```js
{ model_number_normalised, candidates_tried: [...],
  manual_state, extraction,
  names: {…}, search_terms: {…},
  epi: [...], dangers: [...], epi_source: "manual"|"not_specified",
  guides: { en: { sections:{…}, origin:{…} }, … },   // origin carries
                                                     // source_ref + tier_source
  checks:  { ti: [ {method,result,notes} ] },
  unsupported_omitted: [...] }
```

The model does **not** return `tier` — it is derived (4.1). It does not
return `approbation`, `epi_confirme`, `consommable` or `ia` — those are
human or system state. Everything returned lands somewhere: `guides`,
`ia_meta`, or `journal.js`.

---

## 10. Validation — enforced in code, not by asking the model nicely

1. **Script check (D36).** `ti` in Ge'ez (U+1200–U+137F), `ar` in Arabic
   (U+0600–U+06FF). Latin transliteration rejected. *This exact failure
   happened in P0.2.*
2. **Six sections present**, each an array or `null`.
3. **No guide without a source.** A guide requires non-empty
   `origin.source_ref` (D1).
4. **`tier` recomputable** from origin + checks + verified_by (4.1).
   Disagreement is a hard error.
5. **`epi_confirme` defaults false** on every new record; only a human
   action sets it true (D30).
6. **`approbation === null` blocks publication** when `danger_eleve`.
7. **Failed checks flagged, never auto-fixed** (D37).
8. **Human `sans_objet` is never overwritten** by the pipeline.
9. **Stock mode exclusivity**: exactly one of `quantites` /
   `quantites_calculees` is non-null.
10. **Reference integrity**: every `category`, `emplacement`, `statut`,
    `epi`, `dangers` id resolves, with the right `genre`.
11. **Unit IDs unique and never reused.** Duplicate model numbers flagged.
12. **Atomic write**: temp, rename, retry, read back, verify (design 6.4 —
    Kaspersky makes this real).

---

## 11. Deliberately excluded from v1

Decisions, not oversights: purchase date, price, supplier, warranty;
maintenance and inspection schedules; user accounts and permissions
(explicitly rejected — D21, every "who" is free text); multi-site;
item-level QR (supported already, nothing to change — D7).

---

## 12. Still open, and safe to leave open

None of these block P1.2; each is FREE or CHEAP per section 0:

- which pictograms exist — `epi.js` is data, filled in at the machines
- which consumables get `mouvements: true` — needs the list first (D28),
  and `consommable` now makes that list possible
- serial numbers on units — optional field, add any time
- an 8th language — CHEAP, not free (section 0)

---

## 13. What the audit caught

Recorded because the reasoning matters more than the fields:

1. **`safety_flag` meant two things.** Approval gate *and* permanent hazard
   rendering. Either exit erased something — including, in one direction,
   silently restoring unverified Tigrinya text to dangerous machines. Split
   into `danger_eleve` + `approbation`.
2. **Provenance was per model, not per language** — so a French guide from
   an aggregator would display the manufacturer's name. False provenance on
   a safety document.
3. **Unit IDs were unsearchable** — the index held only models, so the
   number printed on the machine could not be typed into the search box.
   That is the entire labelling scheme (D7), defeated.
4. **"Found but scanned" had no state**, forcing a false `introuvable`.
5. **No AI job state**, so an expired queue message was indistinguishable
   from a finished job at export time.
6. **`checks` was a single object** — recording the comprehension test
   would have erased the cross-engine evidence.
7. **`quantites` was ambiguous** in movement mode; **no unit of measure**
   (10 litres or 10 cans?); movements unsharded.
8. **`manuels` was a single path**, though D43 pattern B guarantees one
   document per locale — a French reader would get the English PDF.
9. **`tier` had no derivation rule**, so two implementers would produce
   two different trust signals from identical data.
10. **`dangers[]` had no referent**, so the hazard pictograms would
    silently not render.
11. **"Adding a language" was classed FREE.** It is CHEAP scripted work
    plus ~350 guides of content. Promising it as free would have hurt.
12. Plus: `schema_version` at two levels, index-write rule stated as
    "never" when guide edits do change it, movement IDs undefined for
    Phase B where no server exists, and five AI-contract fields with
    nowhere to land — including `unsupported_omitted`, whose stated
    purpose is to make honesty observable and which nothing stored.
