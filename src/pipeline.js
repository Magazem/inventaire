/**
 * The pipeline — what actually runs when someone photographs a machine.
 *
 * SHAPE, AND WHY: one queue job per LANGUAGE, in TWO PHASES.
 *
 *     capture -> [source] -> [guide:<native langs>] -> [translate:<the rest>]
 *
 * Run #10 measured 75-100 s per guide, so seven languages in one job is nine
 * minutes and a failure at language six redoes five successes. Hence one job
 * per language.
 *
 * Run #11 showed why it has to be two phases. STIHL HS45 is an English-only
 * PDF. The French job ran, found no French, needed the English guide as a
 * pivot — which did not exist yet — retried three times in the two minutes
 * English took, and died. Translations are therefore queued only AFTER a
 * valid pivot guide exists, by the job that wrote it.
 *
 * `source` runs once and PARKS THE MARKDOWN IN R2, so the 21 MB PDF is
 * fetched and converted once rather than seven times. The database stays the
 * truth (design §5.1) — the daily sweep re-queues only what is missing.
 */
import { acquireManual, fetchMarkdown } from './source.js';
import { sliceForLanguage, writeGuide, deriveTier, SECTIONS } from './guide.js';
import { extractPpeFromText } from './ppe.js';
import { pageLanguageMap, detectLanguage } from './probe.js';

/** Languages generated at capture (design D25). Tigrinya waits on the manager. */
export const TARGET_LANGS = ['fr', 'en', 'de', 'it', 'pt', 'ar'];

/** Pivot preference for translations. English first: richest source (D25). */
const PIVOTS = ['en', 'fr', 'de'];

const now = () => new Date().toISOString();
const mdKey = id => `manuals/${id}.md`;
const WHOLE_DOC_CAP = 100_000;

async function getModel(env, modelId) {
  // ia_meta MUST be here. Run #11's first bug: it was not, so `meta` was
  // always {}, and every native Makita guide was labelled "translated".
  return env.DB.prepare(
    `SELECT model_id, brand, model_number, type, names, manuels, guides,
            manual_state, extraction, epi, dangers, epi_source, epi_confirme,
            ia_etat, ia_tentatives, ia_meta
       FROM models WHERE model_id = ?`).bind(modelId).first();
}

async function journal(env, modelId, etape, ok, detail) {
  await env.DB.prepare(
    `INSERT INTO journal (at, model_id, etape, ok, detail) VALUES (?,?,?,?,?)`
  ).bind(now(), modelId, etape, ok ? 1 : 0, JSON.stringify(detail)).run();
}

/** Which target languages does this document carry as a REAL section? */
export function nativeLanguages(md) {
  const out = [];
  for (const lang of TARGET_LANGS) if (sliceForLanguage(md, lang)) out.push(lang);
  return out;
}

/** A guide is usable only if it exists AND passed validation. */
const validGuide = g => g && g.sections && !g.validation;

function firstValidPivot(guides) {
  return PIVOTS.find(p => validGuide(guides[p])) || null;
}

/**
 * JOB 1 — find and park the manual, then queue the NATIVE languages only.
 */
export async function jobSource(env, { model_id }) {
  const m = await getModel(env, model_id);
  if (!m) return { ok: false, reason: 'model gone' };
  if (m.manual_state === 'sans_objet')
    return { ok: true, skipped: 'human said no manual needed' };

  const canon = (m.model_number || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const acq = await acquireManual(env, m.brand, m.model_number, canon);

  if (!acq.accepted) {
    const why = {
      outcome: acq.outcome, at: now(),
      considered: (acq.ranked || []).slice(0, 6).map(c => ({
        url: c.url, score: c.score, title: c.title || null, reasons: c.reasons })),
      tried: (acq.attempts || []).map(a => ({
        stage: a.stage, url: a.url, verdict: a.verdict || null,
        reasons: a.reasons || null, pages: a.pages ?? null, chars: a.chars ?? null,
        model_hits: a.model_hits ?? null, instruction_phrases: a.instruction_phrases ?? null,
        status: a.status ?? null, links: a.links ?? null })),
    };
    // extraction reset too — a stale "ok" from an earlier run next to
    // "introuvable" is a contradiction (seen on Husqvarna 445 after an edit).
    await env.DB.prepare(
      `UPDATE models SET manual_state='introuvable', extraction=NULL, ia_etat='done',
              ia_derniere=?, ia_erreur=?, ia_meta=?, updated_at=? WHERE model_id=?`
    ).bind(now(), acq.outcome, JSON.stringify(why), now(), model_id).run();
    await journal(env, model_id, 'source_introuvable', false, why);
    return { ok: true, state: 'introuvable', why };
  }

  const md = await fetchMarkdown(env, acq.accepted.url);
  if (!md || md.length < 8000) {
    await env.DB.prepare(
      `UPDATE models SET manual_state='a_rediger', extraction='failed_scanned',
              ia_etat='done', ia_derniere=?, ia_erreur=?, updated_at=? WHERE model_id=?`
    ).bind(now(), 'no text layer — needs OCR or retyping', now(), model_id).run();
    await journal(env, model_id, 'source_no_text', false, { url: acq.accepted.url });
    return { ok: true, state: 'failed_scanned' };
  }

  await env.PHOTOS.put(mdKey(model_id), md,
    { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } });

  const natives = nativeLanguages(md);
  const docLang = natives.length ? null : detectLanguage(md).language;

  await env.DB.prepare(
    `UPDATE models SET manual_state='disponible', extraction='ok',
            manuels=?, ia_meta=?, ia_etat='pending', ia_derniere=?, updated_at=?
      WHERE model_id=?`
  ).bind(
    JSON.stringify({ source_url: acq.accepted.url }),
    JSON.stringify({ provenance: acq.accepted.provenance,
                     tier_allowed: acq.accepted.trust_tier_allowed,
                     pages: acq.accepted.qualification?.pages ?? null,
                     chars: md.length, natives, doc_lang: docLang }),
    now(), now(), model_id).run();

  // Phase 1: native languages. If the document carries NONE of our targets
  // (a Dutch-only manual, say), write English from the whole document as
  // the pivot — an LLM can write English from Dutch text; that is the one
  // job it is here for.
  const phase1 = natives.length ? natives : ['en'];
  for (const lang of phase1)
    await env.JOBS.send({ type: 'guide', model_id, lang,
                          whole_doc: !natives.length });

  await journal(env, model_id, 'source_ok', true,
    { url: acq.accepted.url, provenance: acq.accepted.provenance,
      chars: md.length, natives, doc_lang: docLang, queued: phase1 });
  return { ok: true, state: 'disponible', natives, queued: phase1 };
}

/**
 * Store ONE guide, atomically, under its own key.
 *
 * This used to read the whole `guides` JSON, add a language, and write it
 * all back. With four translations running at once — the speed the
 * reasoning switch bought us — two jobs would read the same snapshot and
 * the second write erased the first. STIHL HS45 had Portuguese for about a
 * minute, then it was gone. Last writer wins is not a storage strategy.
 *
 * json_set touches one key inside the column in a single statement, so
 * concurrent languages cannot see or clobber each other. The rollup
 * (ia_etat) is computed from a fresh read AFTER the write.
 */
async function storeGuide(env, m, lang, result, origin) {
  const entry = {
    sections: result.sections,
    tier: deriveTier({ origin, checks: [], verified_by: null }),
    origin, checks: [],
    verified_by: null, verified_at: null, edited_by: null, edited_at: null,
  };

  // PPE from the FRENCH guide only — decided once, so pictograms cannot
  // drift between translations.
  let ppeSql = '', ppeArgs = [];
  if (lang === 'fr' && !m.epi_confirme) {
    const safety = [...(result.sections.securite || []), ...(result.sections.usage || []),
                    ...(result.sections.utilisation || []), ...(result.sections.arret || [])]
                   .join('\n');
    const ppe = extractPpeFromText(safety, 'fr');
    ppeSql = ', epi=?, dangers=?, epi_source=?';
    ppeArgs = [JSON.stringify(ppe.epi), JSON.stringify(ppe.dangers), ppe.source];
  }

  await env.DB.prepare(
    `UPDATE models
        SET guides = json_set(COALESCE(NULLIF(guides,''), '{}'), '$.' || ?, json(?))${ppeSql},
            ia_erreur = NULL, ia_derniere = ?, updated_at = ?
      WHERE model_id = ?`
  ).bind(lang, JSON.stringify(entry), ...ppeArgs, now(), now(), m.model_id).run();

  // Rollup from what is ACTUALLY stored now, not from this job's snapshot.
  const fresh = await env.DB.prepare(
    `SELECT guides FROM models WHERE model_id = ?`).bind(m.model_id).first();
  const guides = JSON.parse(fresh?.guides || '{}');
  const done = TARGET_LANGS.every(l => validGuide(guides[l]));
  await env.DB.prepare(`UPDATE models SET ia_etat = ? WHERE model_id = ?`)
    .bind(done ? 'done' : 'pending', m.model_id).run();
  return guides;
}

/**
 * Failure bookkeeping. Keeps the HTTP status, because "http" alone told us
 * nothing in run #11. Returns a retry delay for the kinds of failure that
 * are the provider's problem rather than ours.
 */
async function recordFailure(env, modelId, lang, result) {
  const status = result.status ?? null;
  const detail = `${lang}: ${result.reason}` +
    (status ? ` ${status}` : '') +
    (result.error ? ` — ${String(result.error).slice(0, 160)}` : '') +
    (result.validation?.problems?.length ? ` — ${result.validation.problems.join('; ')}` : '');
  await env.DB.prepare(
    `UPDATE models SET ia_tentatives = ia_tentatives + 1, ia_etat='pending',
            ia_derniere=?, ia_erreur=? WHERE model_id=?`
  ).bind(now(), detail.slice(0, 400), modelId).run();
  await journal(env, modelId, `guide_${lang}_failed`, false,
                { reason: result.reason, status, error: String(result.error || '').slice(0, 200),
                  problems: result.validation?.problems || null });
  // 429 and 5xx: back off, do not hammer. Everything else: normal retry.
  const retryAfter = status === 429 ? 120 : (status >= 500 ? 60 : null);
  return { ok: false, lang, reason: result.reason, status, retry: true, retry_after: retryAfter };
}

/**
 * JOB 2 — write ONE guide in ONE language from the manual itself.
 * On success, if this is the first valid pivot, queue phase 2.
 */
export async function jobGuide(env, { model_id, lang, whole_doc }) {
  const m = await getModel(env, model_id);
  if (!m) return { ok: false, reason: 'model gone' };
  // Idempotent. "Relancer tout" was clicked three times in a minute and
  // queued every job three times; translations already skipped, guides did
  // not, so MS180's English was requested three times over. LongCat time is
  // the scarcest thing in this system.
  if (validGuide(JSON.parse(m.guides || '{}')[lang]))
    return { ok: true, lang, skipped: 'already present' };
  const obj = await env.PHOTOS.get(mdKey(model_id));
  if (!obj) return { ok: false, reason: 'no parked manual — re-run source' };
  const md = await obj.text();
  const meta = JSON.parse(m.ia_meta || '{}');
  const manuels = JSON.parse(m.manuels || '{}');

  let text, method, pages = null, fromLang = null;
  if (whole_doc) {
    // Cap it. STIHL FS 260C is 261 000 characters — 65 000 tokens for one
    // call, and the safety chapters are at the FRONT of every manual.
    text = md.length > WHOLE_DOC_CAP ? md.slice(0, WHOLE_DOC_CAP) : md;
    method = 'whole_document'; fromLang = meta.doc_lang || null;
  } else {
    const slice = sliceForLanguage(md, lang);
    if (!slice) return { ok: false, reason: `no usable ${lang} section` };
    text = slice.text; method = slice.method; pages = slice.pages || null;
  }

  const result = await writeGuide(env, { text, lang, brand: m.brand, model: m.model_number });
  if (!result.ok) return recordFailure(env, model_id, lang, result);

  const native = !whole_doc && meta.tier_allowed === 'native';
  const origin = {
    method: native ? 'native' : 'translated',
    from_lang: whole_doc ? fromLang : null,
    source_url: manuels.source_url || null,
    tier_source: meta.provenance === 'manufacturer' ? 1 : 2,
    pattern: method === 'page_headers' ? 'A' : 'B',
    pages,
  };
  const guides = await storeGuide(env, m, lang, result, origin);
  await journal(env, model_id, `guide_${lang}`, true,
    { tier: guides[lang].tier, method: origin.method, from: origin.from_lang, pages });

  // Phase 2, exactly once: the first valid pivot queues every missing language.
  const pivot = firstValidPivot(guides);
  let queued = [];
  if (pivot === lang) {
    const natives = meta.natives || [];
    queued = TARGET_LANGS.filter(l => l !== lang && !validGuide(guides[l]) && !natives.includes(l));
    for (const l of queued) await env.JOBS.send({ type: 'translate', model_id, lang: l, from: lang });
    if (queued.length) await journal(env, model_id, 'translations_queued', true, { from: lang, langs: queued });
  }
  return { ok: true, lang, tier: guides[lang].tier, queued_translations: queued };
}

/**
 * JOB 3 — translate ONE language from a VALID pivot guide.
 * Never from the raw manual in another language: that would be a
 * translation of a translation.
 */
export async function jobTranslate(env, { model_id, lang, from }) {
  const m = await getModel(env, model_id);
  if (!m) return { ok: false, reason: 'model gone' };
  const guides = JSON.parse(m.guides || '{}');
  if (validGuide(guides[lang])) return { ok: true, lang, skipped: 'already present' };

  const pivot = validGuide(guides[from]) ? from : firstValidPivot(guides);
  if (!pivot) return { ok: false, reason: 'no valid pivot guide', retry: true, retry_after: 90 };

  const meta = JSON.parse(m.ia_meta || '{}');
  const manuels = JSON.parse(m.manuels || '{}');
  const pivotText = SECTIONS
    .map(k => `[${k}]\n` + (guides[pivot].sections[k] || []).join('\n')).join('\n\n');

  const result = await writeGuide(env, { text: pivotText, lang, brand: m.brand,
                                         model: m.model_number, mode: 'translate',
                                         thinking: false });
  if (!result.ok) return recordFailure(env, model_id, lang, result);

  const origin = {
    method: 'translated', from_lang: pivot,
    source_url: manuels.source_url || null,
    tier_source: meta.provenance === 'manufacturer' ? 1 : 2,
    pattern: null, pages: null,
  };
  const g = await storeGuide(env, m, lang, result, origin);
  await journal(env, model_id, `guide_${lang}`, true,
    { tier: g[lang].tier, method: 'translated', from: pivot });
  return { ok: true, lang, tier: g[lang].tier, from: pivot };
}

/**
 * The sweep's helper: what does this model still need?
 * Re-sourcing is only for models with nothing parked. Run #11's sweep
 * re-fetched Makita from scratch and rewrote five good guides to chase one.
 */
export async function requeueMissing(env, model_id) {
  const m = await getModel(env, model_id);
  if (!m || m.manual_state === 'sans_objet') return { queued: [] };
  const parked = await env.PHOTOS.head(mdKey(model_id));
  if (!parked || m.manual_state !== 'disponible') {
    await env.JOBS.send({ type: 'source', model_id, reason: 'sweep' });
    return { queued: ['source'] };
  }
  const guides = JSON.parse(m.guides || '{}');
  const meta = JSON.parse(m.ia_meta || '{}');
  const natives = meta.natives || [];
  const pivot = firstValidPivot(guides);
  const queued = [];
  for (const l of TARGET_LANGS) {
    if (validGuide(guides[l])) continue;
    if (natives.includes(l)) { await env.JOBS.send({ type: 'guide', model_id, lang: l }); queued.push('guide:' + l); }
    else if (pivot) { await env.JOBS.send({ type: 'translate', model_id, lang: l, from: pivot }); queued.push('translate:' + l); }
  }
  if (!queued.length && !pivot) {
    // nothing native and no pivot: make English from the whole document
    await env.JOBS.send({ type: 'guide', model_id, lang: 'en', whole_doc: true });
    queued.push('guide:en(whole)');
  }
  return { queued };
}

/** Dispatch. Unknown job types are acked, not retried forever. */
export async function runJob(env, body) {
  const type = body?.type || (body?.model_id ? 'source' : null);
  if (type === 'source')    return jobSource(env, body);
  if (type === 'guide')     return jobGuide(env, body);
  if (type === 'translate') return jobTranslate(env, body);
  return { ok: true, ignored: type };
}
