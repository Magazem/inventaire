/**
 * Stage 3 — write the guide.
 *
 * Everything deterministic already happened in code (D47): the manual was
 * found, fetched, converted, provenance-checked, and cut down to ONE
 * language. What arrives here is text in one language and a request for six
 * sections. The model writes prose. It chooses nothing else — not a format,
 * not a filename, not a language set, not whether something is good enough.
 *
 * Variance can only occur where a decision is delegated, so almost nothing
 * is delegated.
 */
import { pageLanguageMap, detectLanguage } from './probe.js';
import { extractPpeFromText } from './ppe.js';

const json = (d, s = 200) => new Response(JSON.stringify(d, null, 2), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });

const LONGCAT = 'https://api.longcat.chat/openai/v1/chat/completions';
const MODEL = 'LongCat-2.0';

/** The six sections, in render order. Exactly these, always all six. */
export const SECTIONS = ['usage', 'securite', 'demarrage', 'utilisation', 'arret', 'problemes'];

/** PPE and hazard ids — must match schema.sql exactly (D52 enum). */
export const EPI_IDS = ['gants', 'lunettes', 'casque_antibruit', 'casque',
  'chaussures', 'masque', 'gilet', 'visiere'];
export const DANGER_IDS = ['projection', 'bruit', 'surface_chaude',
  'pieces_mobiles', 'electrique'];

/**
 * What each id MEANS.
 *
 * Run #8's PPE call returned `casque` (hard hat) and `chaussures` for an
 * angle grinder, and missed `projection` and `bruit` entirely — while the
 * guide it wrote from the same text said to wear eye and hearing
 * protection. The cause was not the model: the enum handed it bare ids and
 * never said what they meant. `casque` vs `casque_antibruit` is a coin flip
 * from the identifier alone.
 */
export const ID_MEANINGS = {
  gants: 'protective gloves (only if the text requires gloves — note that some manuals FORBID cloth gloves)',
  lunettes: 'safety glasses / eye protection',
  casque_antibruit: 'hearing protection, ear defenders, ear plugs',
  casque: 'hard hat, helmet — head protection against falling objects ONLY',
  chaussures: 'safety footwear, steel-toe boots',
  masque: 'dust mask, respirator, breathing protection',
  gilet: 'high-visibility vest',
  visiere: 'face shield, full-face visor (more than glasses)',
  projection: 'HAZARD: flying particles, sparks, fragments, debris thrown from the work',
  bruit: 'HAZARD: loud noise, high sound level',
  surface_chaude: 'HAZARD: hot surface, parts that stay hot after use, burn risk',
  pieces_mobiles: 'HAZARD: moving parts, rotating disc or blade, entanglement',
  electrique: 'HAZARD: electric shock, mains voltage, damaged cable',
};

/**
 * The guide schema. Constrained decoding means anything expressible here is
 * structurally impossible to get wrong (D52) — so express as much as we can.
 *
 * One deliberate simplification: a section the manual does not cover is
 * returned as `[]`, and CODE maps it to `null` on the way into the record.
 * The data model needs that distinction (null renders "Non couvert par le
 * manuel", [] renders nothing), but making the model choose between two
 * empty values is a decision we would be handing back to it for no reason —
 * and `["array","null"]` unions are exactly the schema shape whose
 * constrained-decoding support is least certain.
 */
function guideSchema() {
  // NO maxLength here, deliberately. Run #8 ended a safety instruction as
  // "Ne déposez jamais l'outil avant l" — constrained decoding does not
  // REJECT an over-long string, it CUTS it. A schema length limit therefore
  // manufactures broken sentences instead of triggering a retry. Length is
  // checked in code (Layer 3) where it can fail properly.
  const section = { type: 'array', maxItems: 20, items: { type: 'string' } };
  const props = {};
  for (const k of SECTIONS) props[k] = section;
  return {
    name: 'guide',
    strict: true,
    schema: { type: 'object', additionalProperties: false,
              required: [...SECTIONS], properties: props },
  };
}

function ppeSchema() {
  return {
    name: 'ppe',
    strict: true,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['epi', 'dangers', 'source'],
      properties: {
        // uniqueItems because run #8 returned casque twice, masque twice and
        // pieces_mobiles five times. An enum constrains VALUES, not repetition.
        epi:     { type: 'array', maxItems: 8, uniqueItems: true,
                   items: { enum: EPI_IDS } },
        dangers: { type: 'array', maxItems: 5, uniqueItems: true,
                   items: { enum: DANGER_IDS } },
        source:  { enum: ['manual', 'not_specified'] },
      },
    },
  };
}

/**
 * One LongCat call, with all three stops from D50.
 *
 *   max_tokens      server-side ceiling
 *   client timeout  our side, via AbortController
 *   (job timeout    lives in the queue consumer, above this)
 *
 * The hostile probe HUNG without these. In production a prompt/schema
 * conflict would not fail — it would hang, hold a worker, and the queued
 * message would then expire after 24 h and the item would vanish silently.
 */
async function callLongCat(env, { system, user, schema, maxTokens = 4000,
                                  timeoutMs = 60_000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(LONGCAT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${env.LONGCAT_API_KEY}`,
                 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: maxTokens,
        // Fixed instructions first, variable text last: the constant prefix
        // hits LongCat's free cache (design §2.1).
        messages: [{ role: 'system', content: system },
                   { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: schema },
      }),
    });
    const ms = Date.now() - t0;
    if (!r.ok) return { ok: false, stop: 'http', status: r.status,
                        error: (await r.text()).slice(0, 500), ms };
    const d = await r.json();
    const choice = d.choices?.[0];
    // The probe found `content` can be ABSENT, not merely empty.
    const content = choice?.message?.content ?? null;
    return {
      ok: true, ms,
      finish_reason: choice?.finish_reason ?? null,
      content,
      usage: d.usage ?? null,
      reasoning_len: (choice?.message?.reasoning_content || '').length,
    };
  } catch (e) {
    const aborted = e?.name === 'AbortError';
    return { ok: false, stop: aborted ? 'client_timeout' : 'network',
             error: String(e), ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}

/**
 * Call, and treat `finish_reason: "length"` as its own failure class (D51).
 *
 * A length failure does not mean the model produced something wrong — it
 * means the budget was too small, and reasoning ate it. Repairing content
 * that was never generated is meaningless, so this retries with double the
 * budget once rather than entering a repair loop.
 */
async function callWithBudget(env, args) {
  const attempts = [];
  let budget = args.maxTokens ?? 4000;

  for (let i = 0; i < 2; i++) {
    const r = await callLongCat(env, { ...args, maxTokens: budget });
    attempts.push({ budget, finish_reason: r.finish_reason, ms: r.ms,
                    stop: r.stop, status: r.status,
                    reasoning_len: r.reasoning_len,
                    content_len: r.content?.length ?? null });

    if (!r.ok) return { ok: false, reason: r.stop, error: r.error, attempts };

    if (r.finish_reason === 'length' || !r.content) {
      budget *= 2;                        // D51 — bigger budget, once
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(r.content); }
    catch (e) { return { ok: false, reason: 'unparseable',
                         error: String(e), raw: r.content.slice(0, 400), attempts }; }
    return { ok: true, data: parsed, usage: r.usage, attempts };
  }
  return { ok: false, reason: 'token_budget', attempts };
}

/** Script validation (D36). Belt and braces beside the schema pattern. */
const SCRIPT_RANGES = {
  ar: /[؀-ۿݐ-ݿ]/,
  ti: /[ሀ-፿]/,
};
export function checkScript(lang, sections) {
  const range = SCRIPT_RANGES[lang];
  if (!range) return { ok: true };
  const text = SECTIONS.flatMap(k => sections[k] || []).join(' ');
  if (!text.trim()) return { ok: true, note: 'empty' };
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (!letters) return { ok: false, reason: 'no letters at all' };
  const inScript = [...letters].filter(c => range.test(c)).length;
  const ratio = inScript / letters.length;
  return {
    ok: ratio >= 0.8, ratio: +ratio.toFixed(2),
    // P0.2's Tigrinya failure was a SILENT script switch to Latin. It looked
    // like text, it was labelled Tigrinya, and nobody in the company could
    // have noticed. This is the check that catches it.
    reason: ratio >= 0.8 ? null : `only ${Math.round(ratio * 100)}% of letters are in the expected script`,
  };
}

/** Semantic validation the schema cannot express (Layer 3). */
export function validateGuide(lang, sections) {
  const problems = [];
  for (const k of SECTIONS)
    if (!Array.isArray(sections[k])) problems.push(`${k} is not an array`);
  const filled = SECTIONS.filter(k => (sections[k] || []).length > 0);
  // A guide with nothing in usage or securite is not a guide.
  if (!filled.includes('usage')) problems.push('usage is empty');
  if (!filled.includes('securite')) problems.push('securite is empty');
  const script = checkScript(lang, sections);
  if (!script.ok) problems.push(`script check failed: ${script.reason}`);
  const all = SECTIONS.flatMap(k => sections[k] || []);
  const tooLong = all.filter(s => s.length > 400);
  if (tooLong.length) problems.push(`${tooLong.length} item(s) over 400 chars`);
  // A safety instruction that stops mid-sentence is worse than a missing
  // one — it reads as complete. Run #8 produced exactly that.
  const truncated = all.filter(s => s.length > 120 && !/[.!?:»"')\]]\s*$/.test(s));
  if (truncated.length)
    problems.push(`${truncated.length} item(s) appear truncated mid-sentence: ` +
                  truncated.map(s => '…' + s.slice(-40)).join(' | '));
  return { ok: problems.length === 0, problems, filled, script };
}

const LANG_NAME = { fr: 'French', en: 'English', de: 'German', it: 'Italian',
  pt: 'Portuguese', es: 'Spanish', nl: 'Dutch', ar: 'Arabic', ti: 'Tigrinya' };

function systemPrompt(lang) {
  const name = LANG_NAME[lang] || lang;
  return [
    `You rewrite manufacturer instruction manuals into short workplace guides for ${name} speakers.`,
    '',
    'RULES:',
    `1. Write ONLY in ${name}.`,
    '2. Use ONLY what the supplied text states. Never add knowledge of your own.',
    '3. If the supplied text does not cover a section, return an empty array for it.',
    '4. ONE instruction per array item. Never join two instructions into one',
    '   item, and never write a paragraph — split it into separate items.',
    '   Keep each item under 300 characters.',
    '5. Short sentences. Assume the reader has never used this machine and',
    '   does not read technical language well.',
    '6. Never soften or omit a warning. Never invert a negation.',
    '',
    'THE SIX SECTIONS:',
    'usage       — what the machine is for (1-3 items)',
    'securite    — safety rules and required protective equipment',
    'demarrage   — ordered steps to start, in order',
    'utilisation — how to hold and operate it while running',
    'arret       — ordered steps to stop and put away',
    'problemes   — common faults and what to do',
  ].join('\n');
}

/** Write one guide, one language, from supplied text. Layer 5: narrow calls. */
export async function writeGuide(env, { text, lang, brand, model }) {
  const head = `Machine: ${brand || ''} ${model || ''}`.trim();
  const call = await callWithBudget(env, {
    system: systemPrompt(lang),
    user: `${head}\n\nMANUAL TEXT:\n\n${text}`,
    schema: guideSchema(),
    // Sized for REASONING PLUS OUTPUT, not output alone. Run #9 produced
    // 3 521 characters of reasoning before writing a single guide token —
    // and a richer prompt makes a reasoning model think MORE, not less.
    maxTokens: 8000,
    timeoutMs: 150_000,
  });
  if (!call.ok) return call;

  const sections = {};
  for (const k of SECTIONS) sections[k] = Array.isArray(call.data[k]) ? call.data[k] : [];
  const check = validateGuide(lang, sections);

  // `[]` from the model means "the manual does not cover this". The record
  // stores null, which renders as "Non couvert par le manuel" — a claim we
  // can stand behind. `[]` would render as nothing, which reads as "there
  // is nothing to say" and is a different and misleading statement.
  const stored = {};
  for (const k of SECTIONS) stored[k] = sections[k].length ? sections[k] : null;

  return { ok: check.ok, sections: stored, validation: check,
           usage: call.usage, attempts: call.attempts };
}

/**
 * PPE as its own narrow call with an enum — invented categories cannot occur.
 *
 * It runs on the GUIDE's own safety text, not on 60 000 characters of raw
 * manual. Three reasons, in order:
 *
 *   1. Run #9 starved on reasoning against a large input and a small budget.
 *      A few hundred characters in makes this call small and fast.
 *   2. The pictograms then match the text the worker is actually reading.
 *      Deriving them from a different body of text than the guide invites
 *      the two to disagree, and the worker cannot tell which is right.
 *   3. The guide is already faithful to the source — that is what stage 3
 *      was validated for.
 *
 * A slice of the raw manual is still passed as backup context, capped, in
 * case the guide's securite section is thin.
 */
export async function extractPpe(env, { text, brand, model }) {
  const call = await callWithBudget(env, {
    system: [
      'You list the protective equipment and hazards that the supplied manual text requires.',
      '',
      'WHAT EACH ID MEANS — choose only from these, and only on what the text says:',
      ...Object.entries(ID_MEANINGS).map(([k, v]) => `  ${k} = ${v}`),
      '',
      'RULES:',
      '1. Each id at most ONCE. Never repeat one.',
      '2. Include an id only if the text states that protection or hazard.',
      '   Never infer it from the type of machine.',
      '3. If the text says NOT to use something (for example cloth gloves),',
      '   that is not a requirement — do not list it.',
      '4. If the text requires eye protection, that is `lunettes`, not `casque`.',
      '   `casque` is a hard hat and is rare on hand tools.',
      '5. If the text states no protective equipment at all, return empty arrays',
      '   and source "not_specified".',
    ].join('\n'),
    user: `Machine: ${brand || ''} ${model || ''}\n\nSAFETY TEXT:\n\n${text}`,
    schema: ppeSchema(),
    maxTokens: 5000,
    timeoutMs: 90_000,
  });
  if (!call.ok) return call;
  // Dedupe in code as well. Belt and braces: `uniqueItems` support in
  // constrained decoding is not something we have proven, and run #8 shows
  // what it costs when repetition slips through.
  const uniq = a => [...new Set(Array.isArray(a) ? a : [])];
  return { ok: true, epi: uniq(call.data.epi), dangers: uniq(call.data.dangers),
           source: call.data.source || 'not_specified', attempts: call.attempts };
}

/** Tier derivation (data model 4.1) — computed, never typed. */
export function deriveTier({ origin, checks = [], verified_by = null }) {
  if (origin?.method === 'native') return 'native';
  if (checks.some(c => c.result === 'errors')) return 'auto';
  if (verified_by) return 'verified';
  if (checks.some(c => c.method === 'cross_engine' && c.result === 'clean')) return 'cross_checked';
  return 'auto';
}

/**
 * Cut the slice for one language out of a converted manual.
 * Returns null when this document does not carry that language at all.
 */
export function sliceForLanguage(md, lang) {
  const map = pageLanguageMap(md);
  if (map.ok && map.languages?.[lang]) {
    const e = map.languages[lang];
    return { text: md.slice(e.from, e.to), method: 'page_headers',
             pages: [e.first_page, e.last_page], chars: e.to - e.from };
  }
  const det = detectLanguage(md);
  if (det.language === lang)
    return { text: md, method: 'whole_document', detected: det, chars: md.length };
  return null;
}

/** Probe: /api/probe/guide?brand=Makita&model=GA5030R&lang=fr */
export async function probeGuideHandler(request, env, deps) {
  const u = new URL(request.url);
  const brand = u.searchParams.get('brand');
  const model = u.searchParams.get('model');
  const lang = u.searchParams.get('lang') || 'fr';
  if (!brand || !model) return json({ error: 'pass ?brand=&model=&lang=' }, 400);

  const canon = model.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const t0 = Date.now();
  const acq = await deps.acquireManual(env, brand, model, canon);
  if (!acq.accepted)
    return json({ stage: 'source', outcome: acq.outcome, attempts: acq.attempts });

  const md = await deps.fetchMarkdown(env, acq.accepted.url);
  if (!md) return json({ stage: 'convert', error: 'conversion returned nothing' });

  const slice = sliceForLanguage(md, lang);
  if (!slice)
    return json({ stage: 'slice', error: `this document has no ${lang} section`,
                  available: Object.keys(pageLanguageMap(md).languages || {}),
                  detected: detectLanguage(md) });

  const guide = await writeGuide(env, { text: slice.text, lang, brand, model });

  // PPE is matched in CODE against the guide's own safety text (D62). No
  // model call: the guide already names the equipment, in the target
  // language, and choosing a pictogram from a named phrase is a string rule.
  const safetyText = guide.ok
    ? [...(guide.sections.securite || []), ...(guide.sections.usage || []),
       ...(guide.sections.utilisation || []), ...(guide.sections.arret || [])].join('\n')
    : slice.text.slice(0, 20_000);
  const ppe = extractPpeFromText(safetyText, lang);

  const origin = {
    method: acq.accepted.trust_tier_allowed === 'native' && slice.method === 'page_headers'
      ? 'native' : 'translated',
    source_url: acq.accepted.url,
    tier_source: acq.accepted.provenance === 'manufacturer' ? 1 : 2,
    pattern: slice.method === 'page_headers' ? 'A' : 'B',
    pages: slice.pages || null,
  };

  return json({
    stage: 'done', ms: Date.now() - t0,
    source: { url: acq.accepted.url, provenance: acq.accepted.provenance,
              tier_allowed: acq.accepted.trust_tier_allowed },
    slice: { method: slice.method, chars: slice.chars, pages: slice.pages || null },
    tier: deriveTier({ origin, checks: [], verified_by: null }),
    origin,
    guide, ppe,
  });
}
