/**
 * The pipeline — what actually runs when someone photographs a machine.
 *
 * SHAPE, AND WHY: one queue job per LANGUAGE, not one per model.
 *
 * Run #10 measured 75-100 s for a single guide. Seven languages in one job
 * is nine minutes, well past any sane job timeout, and a failure at language
 * six would redo all five that had already succeeded. So the work fans out:
 *
 *     capture  ->  [source]  ->  [guide:fr] [guide:en] [guide:de] ...
 *
 * `source` runs once: find the manual, fetch it, convert it, and PARK THE
 * MARKDOWN IN R2. Each language job then reads that, so the 21 MB PDF is
 * fetched and converted once rather than seven times.
 *
 * Every job is independently retryable, and one bad language cannot cost
 * the others. The database stays the truth (design §5.1) — the daily sweep
 * re-queues anything the free plan's 24 h message expiry loses.
 */
import { acquireManual, fetchMarkdown } from './source.js';
import { sliceForLanguage, writeGuide, deriveTier, SECTIONS } from './guide.js';
import { extractPpeFromText } from './ppe.js';

/** Languages generated at capture (design D25). Tigrinya waits on the manager. */
export const TARGET_LANGS = ['fr', 'en', 'de', 'it', 'pt', 'ar'];

/** The language a translation is made FROM, in order of preference. */
const PIVOTS = ['en', 'fr', 'de'];

const now = () => new Date().toISOString();
const mdKey = id => `manuals/${id}.md`;

async function getModel(env, modelId) {
  return env.DB.prepare(
    `SELECT model_id, brand, model_number, type, names, manuels, guides,
            manual_state, extraction, epi, dangers, epi_source, epi_confirme,
            ia_etat, ia_tentatives
       FROM models WHERE model_id = ?`).bind(modelId).first();
}

async function journal(env, modelId, etape, ok, detail) {
  await env.DB.prepare(
    `INSERT INTO journal (at, model_id, etape, ok, detail) VALUES (?,?,?,?,?)`
  ).bind(now(), modelId, etape, ok ? 1 : 0, JSON.stringify(detail)).run();
}

/**
 * JOB 1 — find and park the manual.
 *
 * Ends in one of three states, all of them honest:
 *   found            -> markdown in R2, one guide job queued per language
 *   introuvable      -> D58 kicks in; the worker is told to ask the manager
 *   failed_scanned   -> a PDF exists but has no text layer. NOT `introuvable`,
 *                       because that would bury a recoverable to-do: someone
 *                       can OCR or retype it (data model §3.1).
 */
export async function jobSource(env, { model_id }) {
  const m = await getModel(env, model_id);
  if (!m) return { ok: false, reason: 'model gone' };
  if (m.manual_state === 'sans_objet')
    return { ok: true, skipped: 'human said no manual needed' };

  const canon = (m.model_number || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const acq = await acquireManual(env, m.brand, m.model_number, canon);

  if (!acq.accepted) {
    await env.DB.prepare(
      `UPDATE models SET manual_state='introuvable', ia_etat='done',
              ia_derniere=?, ia_erreur=?, updated_at=? WHERE model_id=?`
    ).bind(now(), acq.outcome, now(), model_id).run();
    await journal(env, model_id, 'source_introuvable', false,
                  { outcome: acq.outcome, tried: acq.attempts?.length ?? 0 });
    return { ok: true, state: 'introuvable' };
  }

  const md = await fetchMarkdown(env, acq.accepted.url);
  if (!md || md.length < 8000) {
    await env.DB.prepare(
      `UPDATE models SET manual_state='a_rediger', extraction='failed_scanned',
              ia_etat='done', ia_derniere=?, ia_erreur=?, updated_at=?
       WHERE model_id=?`
    ).bind(now(), 'no text layer — needs OCR or retyping', now(), model_id).run();
    await journal(env, model_id, 'source_no_text', false, { url: acq.accepted.url });
    return { ok: true, state: 'failed_scanned' };
  }

  await env.PHOTOS.put(mdKey(model_id), md,
    { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } });

  await env.DB.prepare(
    `UPDATE models SET manual_state='disponible', extraction='ok',
            manuels=?, ia_meta=?, ia_derniere=?, updated_at=? WHERE model_id=?`
  ).bind(
    JSON.stringify({ source_url: acq.accepted.url }),
    JSON.stringify({ provenance: acq.accepted.provenance,
                     tier_allowed: acq.accepted.trust_tier_allowed,
                     pages: acq.accepted.qualification?.pages ?? null,
                     chars: md.length }),
    now(), now(), model_id).run();

  for (const lang of TARGET_LANGS)
    await env.JOBS.send({ type: 'guide', model_id, lang });

  await journal(env, model_id, 'source_ok', true,
    { url: acq.accepted.url, provenance: acq.accepted.provenance,
      chars: md.length, queued: TARGET_LANGS.length });
  return { ok: true, state: 'disponible', queued: TARGET_LANGS };
}

/**
 * JOB 2 — write ONE guide, in ONE language.
 *
 * Native where the manual carries that language, translated where it does
 * not — and the difference is recorded, never blurred, because the trust
 * tier shown to a worker depends on it (D44/D45).
 */
export async function jobGuide(env, { model_id, lang }) {
  const m = await getModel(env, model_id);
  if (!m) return { ok: false, reason: 'model gone' };

  const obj = await env.PHOTOS.get(mdKey(model_id));
  if (!obj) return { ok: false, reason: 'no parked manual — re-run source' };
  const md = await obj.text();

  const meta = JSON.parse(m.ia_meta || '{}');
  const guides = JSON.parse(m.guides || '{}');
  const manuels = JSON.parse(m.manuels || '{}');

  const slice = sliceForLanguage(md, lang);
  let result, origin;

  if (slice) {
    result = await writeGuide(env, { text: slice.text, lang,
                                     brand: m.brand, model: m.model_number });
    origin = {
      method: meta.tier_allowed === 'native' ? 'native' : 'translated',
      from_lang: null,
      source_url: manuels.source_url || null,
      tier_source: meta.provenance === 'manufacturer' ? 1 : 2,
      pattern: slice.method === 'page_headers' ? 'A' : 'B',
      pages: slice.pages || null,
    };
  } else {
    // The manual does not carry this language. Translate from a guide we
    // already have — never from the raw manual in another language, which
    // would be a second translation of an already-translated text.
    const pivot = PIVOTS.find(p => guides[p]?.sections);
    if (!pivot)
      return { ok: false, reason: `no ${lang} in the manual and no pivot guide yet`,
               retry: true };
    const pivotText = SECTIONS
      .map(k => `[${k}]\n` + (guides[pivot].sections[k] || []).join('\n'))
      .join('\n\n');
    result = await writeGuide(env, { text: pivotText, lang,
                                     brand: m.brand, model: m.model_number });
    origin = {
      method: 'translated', from_lang: pivot,
      source_url: manuels.source_url || null,
      tier_source: meta.provenance === 'manufacturer' ? 1 : 2,
      pattern: null, pages: null,
    };
  }

  if (!result.ok && !result.sections) {
    await bumpFailure(env, model_id, `${lang}: ${result.reason || 'validation'}`);
    return { ok: false, reason: result.reason, lang };
  }

  guides[lang] = {
    sections: result.sections,
    tier: deriveTier({ origin, checks: [], verified_by: null }),
    origin,
    checks: [],
    verified_by: null, verified_at: null,
    edited_by: null, edited_at: null,
    validation: result.validation?.problems?.length ? result.validation.problems : null,
  };

  // PPE comes from the FRENCH guide — one language, so the pictograms are
  // decided once rather than drifting between translations.
  let ppeSql = '', ppeArgs = [];
  if (lang === 'fr' && !m.epi_confirme) {
    const safety = [...(result.sections.securite || []), ...(result.sections.usage || []),
                    ...(result.sections.utilisation || []), ...(result.sections.arret || [])]
                   .join('\n');
    const ppe = extractPpeFromText(safety, 'fr');
    ppeSql = ', epi=?, dangers=?, epi_source=?';
    ppeArgs = [JSON.stringify(ppe.epi), JSON.stringify(ppe.dangers), ppe.source];
  }

  const done = TARGET_LANGS.every(l => guides[l]);
  await env.DB.prepare(
    `UPDATE models SET guides=?${ppeSql}, ia_etat=?, ia_derniere=?, updated_at=?
      WHERE model_id=?`
  ).bind(JSON.stringify(guides), ...ppeArgs,
         done ? 'done' : 'pending', now(), now(), model_id).run();

  await journal(env, model_id, `guide_${lang}`, true,
    { tier: guides[lang].tier, method: origin.method, from: origin.from_lang,
      problems: guides[lang].validation });
  return { ok: true, lang, tier: guides[lang].tier };
}

async function bumpFailure(env, modelId, err) {
  await env.DB.prepare(
    `UPDATE models SET ia_tentatives = ia_tentatives + 1, ia_etat='pending',
            ia_derniere=?, ia_erreur=? WHERE model_id=?`
  ).bind(now(), String(err).slice(0, 300), modelId).run();
}

/** Dispatch. Unknown job types are acked, not retried forever. */
export async function runJob(env, body) {
  const type = body?.type || (body?.model_id ? 'source' : null);
  if (type === 'source') return jobSource(env, body);
  if (type === 'guide')  return jobGuide(env, body);
  return { ok: true, ignored: type };
}
