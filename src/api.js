/**
 * Capture API. Implements spec/data-model.md v1.0.
 *
 * Design rules enforced here rather than trusted to the client:
 *  - IDs are assigned SERVER-SIDE (D32). Two colleagues capturing at once
 *    would otherwise both be handed ECRAN-005.
 *  - A human "pas besoin de mode d'emploi" sets sans_objet and is never
 *    overwritten by the pipeline (data model §3.1).
 *  - epi_confirme starts false and only a human sets it true (D30).
 *  - New models are queued for AI; known models are not (no duplicate work).
 */

/** SQL mirror of canonicalKey(): strip space, hyphen, dot, slash, underscore. */
const CANON_SQL = `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
  model_number,' ',''),'-',''),'.',''),'/',''),'_',''))`;

const now = () => new Date().toISOString();
const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** Atomic per-scope counter. RETURNING makes this one round trip. */
async function nextNumber(env, scope) {
  await env.DB.prepare(
    `INSERT INTO counters (scope, next) VALUES (?, 1)
     ON CONFLICT(scope) DO NOTHING`).bind(scope).run();
  const row = await env.DB.prepare(
    `UPDATE counters SET next = next + 1 WHERE scope = ? RETURNING next - 1 AS n`
  ).bind(scope).first();
  return row.n;
}

const pad = (n, w) => String(n).padStart(w, '0');

/**
 * Normalisation (D32). Two outputs, on purpose:
 *
 *  normaliseModelNumber()  a TIDY DISPLAY form — "KT-AS 18 Li" stays readable
 *  canonicalKey()          a MATCHING form — punctuation and spaces removed
 *
 * They must be separate. Matching on the display form fails exactly the case
 * D32 was written for: "KT-AS18LI" on a sticker vs "KT-AS 18 Li" on the
 * manufacturer's site. Those are the same machine and must dedupe, but they
 * should not be displayed as a run-together string.
 */
export function normaliseModelNumber(raw) {
  if (!raw) return null;
  let s = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  // spec noise commonly copied off a sticker: thread size, disc diameter
  s = s.replace(/\bM\d{1,2}\b/g, '').replace(/\b\d{2,3}\s?MM\b/g, '');
  // regional / packaging suffixes
  s = s.replace(/-(QS|QX|QW|GB|LX|B\d?)\b/g, '');
  return s.replace(/\s+/g, ' ').trim() || null;
}

/** Everything that is not a letter or digit is noise for matching purposes. */
export function canonicalKey(raw) {
  const n = normaliseModelNumber(raw);
  return n ? n.replace(/[^A-Z0-9]/g, '') : null;
}

export async function listsHandler(env) {
  const [cats, emps, statuts, epi, types] = await Promise.all([
    env.DB.prepare(`SELECT id, noms, icone FROM categories ORDER BY ordre`).all(),
    env.DB.prepare(`SELECT id, noms, type FROM emplacements ORDER BY ordre`).all(),
    env.DB.prepare(`SELECT id, noms, couleur FROM statuts`).all(),
    env.DB.prepare(`SELECT id, noms, genre FROM epi`).all(),
    env.DB.prepare(`SELECT DISTINCT type FROM models ORDER BY type`).all(),
  ]);
  const parse = r => (r.results || []).map(x => ({ ...x, noms: JSON.parse(x.noms) }));
  return json({
    categories: parse(cats), emplacements: parse(emps),
    statuts: parse(statuts), epi: parse(epi),
    types: (types.results || []).map(r => r.type),
  });
}

/** Does this brand+model already exist? Avoids paying for the AI twice. */
export async function lookupHandler(request, env) {
  const { brand, model_number } = await request.json();
  const norm = normaliseModelNumber(model_number);
  const key = canonicalKey(model_number);
  if (!brand || !key) return json({ found: false });
  const row = await env.DB.prepare(
    `SELECT model_id, type, names, manual_state, photo
       FROM models WHERE UPPER(brand) = ? AND ${CANON_SQL} = ? LIMIT 1`
  ).bind(brand.trim().toUpperCase(), key).first();
  if (!row) return json({ found: false, normalised: norm });
  const units = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM units WHERE model_id = ?`).bind(row.model_id).first();
  return json({ found: true, normalised: norm,
    model: { ...row, names: JSON.parse(row.names), unit_count: units.n } });
}

/** Photo upload → R2. Returns the key the item submission will reference. */
export async function photoHandler(request, env) {
  const kind = new URL(request.url).searchParams.get('kind') || 'item';
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'empty' }, 400);
  if (bytes.byteLength > 6_000_000) return json({ error: 'too_large' }, 413);
  const key = `incoming/${Date.now()}-${crypto.randomUUID()}-${kind}.jpg`;
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  return json({ key, bytes: bytes.byteLength });
}

export async function createItemHandler(request, env, who) {
  const b = await request.json();
  const t = now();

  // ---- validate before writing anything -------------------------------
  const errors = [];
  if (!b.type || !/^[A-Z][A-Z0-9_]*$/.test(b.type))
    errors.push('type must be UPPERCASE ASCII (it appears on labels and filenames)');
  if (!b.category) errors.push('category required');
  if (b.suivi && !['unites', 'quantite'].includes(b.suivi)) errors.push('bad suivi');
  if (!b.sans_manuel && !b.consommable) {
    if (!b.brand) errors.push('brand required unless "pas besoin de mode d\'emploi"');
    if (!b.model_number) errors.push('model number required unless "pas besoin de mode d\'emploi"');
  }
  if (errors.length) return json({ errors }, 400);

  const suivi = b.suivi || 'unites';
  const norm = normaliseModelNumber(b.model_number);

  // ---- reuse an existing model where possible --------------------------
  let modelId = b.model_id || null;
  let created = false;

  const key = canonicalKey(b.model_number);
  if (!modelId && b.brand && key) {
    const hit = await env.DB.prepare(
      `SELECT model_id FROM models WHERE UPPER(brand)=? AND ${CANON_SQL} = ? LIMIT 1`
    ).bind(b.brand.trim().toUpperCase(), key).first();
    if (hit) modelId = hit.model_id;
  }

  if (!modelId) {
    modelId = 'M-' + pad(await nextNumber(env, 'MODEL'), 4);
    created = true;

    // A human ticking "no manual needed" is authoritative and the pipeline
    // must never overwrite it (data model §3.1).
    const manualState = b.sans_manuel ? 'sans_objet' : 'a_rediger';
    const iaEtat = b.sans_manuel ? 'skipped' : 'pending';

    await env.DB.prepare(
      `INSERT INTO models (model_id,type,brand,model_number,model_number_raw,category,
         suivi,consommable,mouvements,photo,photo_plaque,manuels,names,search_terms,
         manual_state,extraction,danger_eleve,approbation,epi,dangers,epi_confirme,
         epi_confirme_par,epi_source,guides,ia_etat,ia_tentatives,ia_derniere,ia_erreur,
         ia_meta,created_at,created_by,updated_at,updated_by)
       VALUES (?,?,?,?,?,?, ?,?,0, ?,?,'{}', ?,'{}', ?,NULL, ?,NULL,'[]','[]',0,
         NULL,'not_specified','{}', ?,0,NULL,NULL,'{}', ?,?,?,?)`
    ).bind(
      modelId, b.type, b.brand || null, norm, (b.model_number || b.name || '').trim(),
      b.category, suivi, b.consommable ? 1 : 0,
      b.photo || null, b.photo_plaque || null,
      JSON.stringify(b.name ? { fr: b.name } : {}),
      manualState,
      b.danger_eleve ? 1 : 0,
      iaEtat, t, who, t, who
    ).run();
  }

  // ---- the physical thing ---------------------------------------------
  let unitId = null;
  if (suivi === 'unites') {
    unitId = `${b.type}-${pad(await nextNumber(env, b.type), 3)}`;
    await env.DB.prepare(
      `INSERT INTO units (unit_id,model_id,photo,emplacement,statut,notes,historique,
         added_at,added_by) VALUES (?,?,?,?, 'en_service', ?, '[]', ?,?)`
    ).bind(unitId, modelId, b.photo || null, b.emplacement || null,
           b.notes || '', t, who).run();
  } else {
    const q = b.quantites && typeof b.quantites === 'object' ? b.quantites : {};
    await env.DB.prepare(
      `INSERT INTO stock (model_id,unite_mesure,quantites,quantites_calculees,
         calcule_at,dernier_mouvement_at,seuil_bas,dernier_mv,updated_at,updated_by)
       VALUES (?,?,?,NULL,NULL,NULL,?,0,?,?)
       ON CONFLICT(model_id) DO UPDATE SET quantites=excluded.quantites,
         updated_at=excluded.updated_at, updated_by=excluded.updated_by`
    ).bind(modelId, b.unite_mesure || 'u', JSON.stringify(q),
           b.seuil_bas ?? null, t, who).run();
  }

  // ---- queue the AI, only for genuinely new models needing a guide -----
  let queued = false;
  if (created && !b.sans_manuel) {
    try {
      await env.JOBS.send({ type: 'source', model_id: modelId, reason: 'new_model' });
      queued = true;
    } catch (e) {
      // The DB is the truth; the sweep will pick this up (design §5.1).
      await env.DB.prepare(
        `UPDATE models SET ia_erreur=? WHERE model_id=?`
      ).bind('queue send failed: ' + String(e), modelId).run();
    }
  }

  await env.DB.prepare(
    `INSERT INTO journal (at,model_id,etape,ok,detail) VALUES (?,?,?,1,?)`
  ).bind(t, modelId, created ? 'model_created' : 'unit_added',
         JSON.stringify({ unit_id: unitId, by: who, queued })).run();

  return json({ ok: true, model_id: modelId, unit_id: unitId,
                created_model: created, queued });
}

/** Recent captures, so you can see what you just did and spot mistakes. */
export async function recentHandler(env) {
  const rows = await env.DB.prepare(
    `SELECT u.unit_id, u.added_at, m.model_id, m.type, m.brand, m.model_number,
            m.names, m.manual_state, m.ia_etat
       FROM units u JOIN models m ON m.model_id = u.model_id
      ORDER BY u.added_at DESC LIMIT 20`).all();
  return json({ items: (rows.results || []).map(r => ({ ...r, names: JSON.parse(r.names) })) });
}

/**
 * Read-only inspection dump. This is a DIAGNOSTIC view, not the admin page —
 * it exists so a capture can be checked immediately instead of waiting for
 * the admin page in a later phase. Everything here is SELECT only.
 */
export async function inspectHandler(env) {
  const [models, units, stock, journal] = await Promise.all([
    env.DB.prepare(
      `SELECT model_id,type,brand,model_number,model_number_raw,category,suivi,
              consommable,photo,photo_plaque,names,manual_state,danger_eleve,
              approbation,epi_confirme,ia_etat,ia_tentatives,ia_erreur,
              created_at,created_by
         FROM models ORDER BY created_at DESC`).all(),
    env.DB.prepare(
      `SELECT unit_id,model_id,photo,emplacement,statut,notes,added_at,added_by
         FROM units ORDER BY added_at DESC`).all(),
    env.DB.prepare(
      `SELECT model_id,unite_mesure,quantites,seuil_bas,updated_at FROM stock`).all(),
    env.DB.prepare(
      `SELECT at,model_id,etape,ok,detail FROM journal
        ORDER BY at DESC LIMIT 100`).all(),
  ]);
  const M = (models.results || []).map(r => ({ ...r, names: JSON.parse(r.names || '{}') }));
  return json({
    counts: { models: M.length, units: (units.results || []).length },
    models: M,
    units: units.results || [],
    stock: stock.results || [],
    journal: journal.results || [],
  });
}

/** Serve one R2 photo. Session-gated like every other /api/ route. */
export async function photoGetHandler(request, env) {
  const key = new URL(request.url).searchParams.get('key');
  if (!key) return json({ error: 'key required' }, 400);
  const obj = await env.PHOTOS.get(key);
  if (!obj) return json({ error: 'not_found', key }, 404);
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'image/jpeg',
      'cache-control': 'private, max-age=3600',
    },
  });
}

/**
 * Re-queue a model for the AI pipeline.
 *
 * Needed because a capture only queues a job when the model is NEW (D32 —
 * a second Honda must not pay for the same guide twice). So anything
 * captured before the pipeline existed, or whose job expired from the free
 * plan's 24 h queue, sits at `ia_etat: pending` forever with no way to nudge
 * it except waiting for the 03:00 sweep. This is that nudge.
 */
export async function requeueHandler(request, env, who) {
  const u = new URL(request.url);
  const one = u.searchParams.get('model_id');

  const rows = one
    ? await env.DB.prepare(
        `SELECT model_id, manual_state FROM models WHERE model_id = ?`).bind(one).all()
    : await env.DB.prepare(
        `SELECT model_id, manual_state FROM models
          WHERE ia_etat IN ('pending','failed') AND manual_state != 'sans_objet'
          LIMIT 50`).all();

  const out = [];
  for (const r of rows.results || []) {
    // A human ticking "pas besoin de mode d'emploi" is authoritative and the
    // pipeline never overrides it (data model §3.1).
    if (r.manual_state === 'sans_objet') {
      out.push({ model_id: r.model_id, skipped: 'sans_objet — set by a human' });
      continue;
    }
    await env.DB.prepare(
      `UPDATE models SET ia_etat='pending', ia_tentatives=0, ia_erreur=NULL,
              manual_state = CASE WHEN manual_state='introuvable'
                                  THEN 'a_rediger' ELSE manual_state END,
              updated_at=? WHERE model_id=?`
    ).bind(now(), r.model_id).run();
    await env.JOBS.send({ type: 'source', model_id: r.model_id, reason: 'manual_requeue' });
    await env.DB.prepare(
      `INSERT INTO journal (at,model_id,etape,ok,detail) VALUES (?,?,?,1,?)`
    ).bind(now(), r.model_id, 'requeued', JSON.stringify({ by: who })).run();
    out.push({ model_id: r.model_id, queued: true });
  }
  if (!out.length) return json({ ok: true, note: 'nothing was waiting', queued: 0 });
  return json({ ok: true, queued: out.filter(o => o.queued).length, models: out });
}
