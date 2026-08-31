/**
 * Inventaire — Phase A capture backend.
 * See spec/data-model.md (frozen) and spec/output-contract.md.
 */
import { capturePage } from './capture-page.js';
import { inspectPage } from './inspect-page.js';
import { probePdfHandler } from './probe.js';
import { probeSourceHandler, probeAcquireHandler,
         acquireManual, fetchMarkdown } from './source.js';
import { probeGuideHandler } from './guide.js';
import { runJob } from './pipeline.js';
import { makeSession, whoami, checkPassword } from './auth.js';
import { listsHandler, lookupHandler, photoHandler, createItemHandler,
         recentHandler, inspectHandler, photoGetHandler,
         requeueHandler } from './api.js';

const json = (d, s = 200) => new Response(JSON.stringify(d, null, 2), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === '/health') return json(await health(env));
    if (p === '/' || p === '/capture')
      return new Response(capturePage(), {
        headers: { 'content-type': 'text/html; charset=utf-8',
                   'cache-control': 'no-store' } });
    // Read-only diagnostic view. The page itself is a shell; its data comes
    // from /api/inspect, which is session-gated like everything else.
    if (p === '/inspect')
      return new Response(inspectPage(), {
        headers: { 'content-type': 'text/html; charset=utf-8',
                   'cache-control': 'no-store' } });

    if (p === '/api/login' && request.method === 'POST') {
      const { password, who } = await request.json();
      if (!(await checkPassword(env, password))) return json({ error: 'bad' }, 401);
      const name = (who || 'inconnu').slice(0, 40).replace(/[|]/g, '');
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json',
                   'set-cookie': await makeSession(env, name) } });
    }

    // Everything below requires a session.
    if (p.startsWith('/api/')) {
      const who = await whoami(request, env);
      if (!who) return json({ error: 'unauthorized' }, 401);

      if (p === '/api/lists') return listsHandler(env);
      if (p === '/api/recent') return recentHandler(env);
      if (p === '/api/inspect') return inspectHandler(env);
      if (p === '/api/photo') return photoGetHandler(request, env);
      if (p === '/api/requeue' && request.method === 'POST')
        return requeueHandler(request, env, who);
      // P1.2 probe — session-gated because it fetches an arbitrary URL.
      if (p === '/api/probe/pdf') return probePdfHandler(request, env);
      if (p === '/api/probe/source') return probeSourceHandler(request, env);
      if (p === '/api/probe/acquire') return probeAcquireHandler(request, env);
      if (p === '/api/probe/guide')
        return probeGuideHandler(request, env, { acquireManual, fetchMarkdown });
      if (p === '/api/models/lookup' && request.method === 'POST')
        return lookupHandler(request, env);
      if (p === '/api/photos' && request.method === 'POST')
        return photoHandler(request, env);
      if (p === '/api/items' && request.method === 'POST')
        return createItemHandler(request, env, who);
    }

    return json({ error: 'not_found', path: p }, 404);
  },

  /** AI pipeline consumer. Lands here from /api/items and from the sweep. */
  async queue(batch, env) {
    for (const msg of batch.messages) {
      try {
        const r = await runJob(env, msg.body);
        console.log('job', JSON.stringify(msg.body), '->', JSON.stringify(r));
        // A job that asks to retry (a guide waiting on its pivot) goes back
        // on the queue. Everything else is acked: the DATABASE is the truth,
        // and the daily sweep re-queues anything genuinely stranded.
        if (r?.retry) msg.retry(); else msg.ack();
      } catch (err) {
        console.error('job failed', err);
        msg.retry();
      }
    }
  },

  /**
   * Daily sweep. Free-plan queue messages expire after 24h, so a job can
   * vanish silently; the database is the truth (design §5.1).
   */
  async scheduled(event, env) {
    const stranded = await env.DB.prepare(
      `SELECT model_id FROM models
        WHERE ia_etat = 'pending' AND ia_tentatives < 3 LIMIT 50`).all();
    for (const row of stranded.results ?? [])
      await env.JOBS.send({ type: 'source', model_id: row.model_id, reason: 'sweep' });
    console.log(`sweep re-queued ${stranded.results?.length ?? 0}`);
  },
};

async function health(env) {
  const out = { ok: true, checked_at: new Date().toISOString(), bindings: {} };
  try {
    const t = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`).first();
    const c = await env.DB.prepare(`SELECT COUNT(*) AS n FROM categories`).first();
    const m = await env.DB.prepare(`SELECT COUNT(*) AS n FROM models`).first();
    const u = await env.DB.prepare(`SELECT COUNT(*) AS n FROM units`).first();
    out.bindings.d1 = { ok: true, tables: t.n, categories: c.n, models: m.n, units: u.n };
  } catch (e) { out.ok = false; out.bindings.d1 = { ok: false, error: String(e) }; }

  try {
    const k = '_health/probe.txt';
    await env.PHOTOS.put(k, `ok ${new Date().toISOString()}`);
    const back = await env.PHOTOS.get(k);
    out.bindings.r2 = { ok: !!back, read_back: back ? await back.text() : null };
    if (!back) out.ok = false;
  } catch (e) { out.ok = false; out.bindings.r2 = { ok: false, error: String(e) }; }

  try {
    await env.JOBS.send({ probe: true, at: new Date().toISOString() });
    out.bindings.queue = { ok: true, note: 'test message sent' };
  } catch (e) { out.ok = false; out.bindings.queue = { ok: false, error: String(e) }; }

  const key = env.LONGCAT_API_KEY;
  const kok = typeof key === 'string' && key.length > 10;
  out.bindings.longcat_key = { ok: kok, note: kok
    ? `secret readable (${key.length} chars)` : 'not set' };
  if (!kok) out.ok = false;

  out.bindings.ai = { ok: !!env.AI, note: env.AI
    ? 'binding present (toMarkdown)' : 'no AI binding — PDF text extraction cannot run' };

  const sk = env.SERPER_API_KEY;
  const sok = typeof sk === 'string' && sk.length > 10;
  out.bindings.serper_key = { ok: sok, note: sok
    ? `set (${sk.length} chars)` : 'not set — manual search disabled' };

  const pw = env.CAPTURE_PASSWORD;
  const pok = typeof pw === 'string' && pw.length >= 8;
  // Report shape, never value. A length two higher than you expect means
  // PowerShell stored the surrounding quotes; trimmed !== raw means stray
  // whitespace or a newline came along. Both make login fail "wrongly".
  const shape = [];
  if (typeof pw === 'string') {
    if (pw !== pw.trim()) shape.push('has leading/trailing whitespace');
    if (/^["'].*["']$/.test(pw)) shape.push('starts and ends with a quote character');
    if (pw.charCodeAt(0) === 0xFEFF) shape.push('starts with a UTF-8 BOM');
  }
  out.bindings.capture_password = {
    ok: pok && shape.length === 0,
    note: pok
      ? `set (${pw.length} chars)` + (shape.length ? ' — ' + shape.join('; ') : '')
      : 'NOT SET — see SETUP-WINDOWS.md',
  };
  if (!out.bindings.capture_password.ok) out.ok = false;

  return out;
}
