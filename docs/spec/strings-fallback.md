# Fixed strings — the "no manual" fallback (D58)

These are shown when `manual_state: "introuvable"`, or when
`extraction: "failed_scanned"` left us with nothing readable.

**They are not machine-translated and must never be.** There are six
sentences. They appear exactly where the system has nothing else to give a
worker, including on dangerous machines, and a mistranslation here is the
difference between someone asking and someone guessing. Cheap to get right,
expensive to get wrong — the opposite trade-off from the guides themselves.

## What the worker sees

```
┌──────────────────────────────────────────┐
│  ⚠  Mode d'emploi non disponible ici     │
│                                          │
│  Demandez-le à votre responsable.        │
│  Nous en avons une version papier.       │
│                                          │
│  Montrez-lui ces informations :          │
│  ┌────────────────────────────────────┐  │
│  │  MAKITA                            │  │
│  │  GA5030R                           │  │
│  │  MEULEUSE-004                      │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

The brand, model number and unit ID are **in a bordered box, large, and
selectable** — they are the payload. A worker photographs that box, or reads
it aloud. Everything else is framing.

Below it, unchanged from any other item: the pictograms, the required PPE,
and *"Ce guide complète la formation. Il ne la remplace pas."*

## The strings

| key | text |
|---|---|
| `fallback.title` | Mode d'emploi non disponible ici |
| `fallback.ask` | Demandez-le à votre responsable. |
| `fallback.paper` | Nous en avons une version papier. |
| `fallback.show` | Montrez-lui ces informations : |

```json
{
  "fallback.title": {
    "fr": "Mode d'emploi non disponible ici",
    "en": "Instruction manual not available here",
    "de": "Bedienungsanleitung hier nicht verfügbar",
    "it": "Manuale di istruzioni non disponibile qui",
    "pt": "Manual de instruções não disponível aqui",
    "ar": "دليل الاستخدام غير متوفر هنا",
    "ti": "__A_TRADUIRE__"
  },
  "fallback.ask": {
    "fr": "Demandez-le à votre responsable.",
    "en": "Ask your manager for it.",
    "de": "Fragen Sie Ihren Vorgesetzten danach.",
    "it": "Chiedetelo al vostro responsabile.",
    "pt": "Peça-o ao seu responsável.",
    "ar": "اطلبه من مسؤولك.",
    "ti": "__A_TRADUIRE__"
  },
  "fallback.paper": {
    "fr": "Nous en avons une version papier.",
    "en": "We have a paper copy.",
    "de": "Wir haben eine Papierversion.",
    "it": "Ne abbiamo una copia cartacea.",
    "pt": "Temos uma versão em papel.",
    "ar": "لدينا نسخة ورقية منه.",
    "ti": "__A_TRADUIRE__"
  },
  "fallback.show": {
    "fr": "Montrez-lui ces informations :",
    "en": "Show them this information:",
    "de": "Zeigen Sie ihm diese Angaben:",
    "it": "Mostrategli queste informazioni:",
    "pt": "Mostre-lhe estas informações:",
    "ar": "أظهر له هذه المعلومات:",
    "ti": "__A_TRADUIRE__"
  }
}
```

## Tigrinya — CANCELLED (D67, 8 Sep 2026)

The `ti` keys above are void. Kept only so the JSON shape is unchanged.

*(Original note, for the record:)* Deliberately left as `__A_TRADUIRE__` rather than machine-filled.

Four short sentences is the cheapest possible paid translation — this is
option **D** from the Tigrinya brief at its smallest and least arguable
scale. It is also the highest-value Tigrinya in the whole system: a worker
who cannot read the guide can still be told, correctly, *who to ask*.

Until it is translated, Tigrinya falls back to French with the
`traduction automatique` label absent — because there is no translation to
label. Showing French is honest; showing unverified Tigrinya on the one
message that routes someone to a human is not.

## Why this is not `sans_objet`

`sans_objet` means *no manual is needed* — a brush, a broom. It must never
nag. `introuvable` means *a manual exists and we could not get it*, which is
a live to-do for the admin and a real instruction for the worker. Rendering
them the same way would bury the first and insult the second.

## What it does NOT change

`introuvable` still queues for retry. A model in this state is a candidate
for the D57 upload path the moment somebody has the PDF — and the paper
manuals in the drawer are exactly that. Scanning one, once, moves the item
from this fallback to a real guide for every language.
