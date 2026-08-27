/**
 * Inventaire — Phase A capture backend.
 * See spec/data-model.md (frozen) and spec/output-contract.md.
 *
 * This first deploy is deliberately small: it proves the chain
 * (GitHub → Actions → Cloudflare → D1 + R2 + Queue) before any real
 * logic is written on top of it. If /health is green, everything after
 * is application code rather than infrastructure guesswork.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health') return json(await health(env));
    if (url.pathname === '/') return new Response(page(), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

    return json({ error: 'not_found', path: url.pathname }, 404);
  },

  /** Queue consumer — the AI pipeline lands here (design §5.3). */
  async queue(batch, env, ctx) {
    for (const msg of batch.messages) {
      try {
        console.log('job received', JSON.stringify(msg.body));
        // Pipeline arrives in the next push. Ack so nothing is stranded.
        msg.ack();
      } catch (err) {
        console.error('job failed', err);
        msg.retry();
      }
    }
  },

  /**
   * Daily sweep. Free-plan queue messages expire after 24h, so a job can
   * vanish silently; the database is the truth and re-queues anything
   * stranded (design §5.1, data model §3.3).
   */
  async scheduled(event, env, ctx) {
    const stranded = await env.DB
      .prepare(`SELECT model_id FROM models
                 WHERE ia_etat = 'pending' AND ia_tentatives < 3
                 LIMIT 50`)
      .all();
    for (const row of stranded.results ?? []) {
      await env.JOBS.send({ model_id: row.model_id, reason: 'sweep' });
    }
    console.log(`sweep re-queued ${stranded.results?.length ?? 0}`);
  },
};

/** Prove every binding is actually live, not merely configured. */
async function health(env) {
  const out = { ok: true, checked_at: new Date().toISOString(), bindings: {} };

  try {
    const r = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`
    ).first();
    const cats = await env.DB.prepare(`SELECT COUNT(*) AS n FROM categories`).first();
    out.bindings.d1 = { ok: true, tables: r.n, categories: cats.n };
  } catch (e) {
    out.ok = false;
    out.bindings.d1 = { ok: false, error: String(e) };
  }

  try {
    const key = '_health/probe.txt';
    await env.PHOTOS.put(key, `ok ${new Date().toISOString()}`);
    const back = await env.PHOTOS.get(key);
    out.bindings.r2 = { ok: !!back, read_back: back ? await back.text() : null };
    if (!back) out.ok = false;
  } catch (e) {
    out.ok = false;
    out.bindings.r2 = { ok: false, error: String(e) };
  }

  try {
    await env.JOBS.send({ probe: true, at: new Date().toISOString() });
    out.bindings.queue = { ok: true, note: 'test message sent' };
  } catch (e) {
    out.ok = false;
    out.bindings.queue = { ok: false, error: String(e) };
  }

  out.bindings.longcat_key = { ok: !!env.LONGCAT_API_KEY,
    note: env.LONGCAT_API_KEY ? 'secret present' : 'not set yet — expected until we add it' };

  return out;
}

function page() {
  return `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inventaire — backend</title>
<style>
 body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:8vh auto;padding:0 20px;
      color:#16191d;background:#f4f5f7}
 h1{font-size:24px;margin:0 0 4px} p{color:#4a5159}
 .card{background:#fff;border:1px solid #d9dde2;border-radius:12px;padding:20px;margin-top:20px}
 a{color:#1b4d8f} code{background:#eceff3;padding:2px 6px;border-radius:4px;font-size:14px}
 .pill{display:inline-block;background:#e4f3ea;color:#1a6b3c;font-weight:650;
       padding:3px 10px;border-radius:20px;font-size:14px}
</style>
<h1>Inventaire — backend</h1>
<p><span class="pill">déployé</span> Phase A. Capture app not built yet.</p>
<div class="card">
  <p><a href="/health">/health</a> — checks that D1, R2 and the queue are
  genuinely reachable, not just configured.</p>
  <p style="margin-bottom:0">Deployed from
  <code>github.com/Magazem/inventaire</code> via GitHub Actions.</p>
</div>`;
}
