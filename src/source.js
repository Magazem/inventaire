/**
 * Stage 1 — find the manual.
 *
 * Order matters, and probe runs #1 and #2 are why:
 *
 *   1. A VERIFIED MANUFACTURER URL RULE, where P0.3 found one. Makita's rule
 *      is now proven end-to-end: it returned a 21 MB InDesign original with
 *      ten cleanly labelled language sections.
 *   2. WEB SEARCH, ranked by domain. Searching for the DeWalt DWE492 manual
 *      returns aggregators for the entire first page — the manufacturer's
 *      own file never surfaces. Unranked search would have picked a
 *      ManualsLib reprint every time, which is exactly what happened in
 *      probe run #1.
 *
 * A reprint is still usable content. It simply can never be `native` (D53).
 */

const json = (d, s = 200) => new Response(JSON.stringify(d, null, 2), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });

/**
 * Manufacturer domains and direct URL rules.
 *
 * `domains` is what makes a search result trustworthy. `direct` is the P0.3
 * URL template, where one exists — only Makita's is a pure model-number
 * substitution; the others key on article numbers or market-specific slugs
 * we do not hold, so they fall through to ranked search (D46).
 */
export const BRANDS = {
  MAKITA: {
    domains: ['makita.', 'icmsmakita.eu'],
    direct: model => [
      `https://www.icmsmakita.eu/CMS/custom/fi/attachments/user_manuals/User_manuals_EU2/${model}.pdf`,
    ],
  },
  DEWALT:    { domains: ['dewalt.', 'servicenet.dewalt.com', 'service.dewalt.co.uk'] },
  BOSCH:     { domains: ['bosch-diy.com', 'bosch-professional.com', 'bosch-pt.com', 'bosch.'] },
  EINHELL:   { domains: ['einhell.', 'einhell-service.com'] },
  HUSQVARNA: { domains: ['husqvarna.'] },
  STIHL:     { domains: ['stihl.', 'ssc.stihl.com'] },
  HILTI:     { domains: ['hilti.'] },
  METABO:    { domains: ['metabo.', 'metabo-service.com'] },
  FESTOOL:   { domains: ['festool.'] },
  MILWAUKEE: { domains: ['milwaukeetool.', 'milwaukee.'] },
  RYOBI:     { domains: ['ryobitools.', 'ryobi.'] },
  KARCHER:   { domains: ['kaercher.', 'karcher.'] },
  HONDA:     { domains: ['honda.', 'hondaengines.'] },
};

/**
 * Reprint sites. Not banned — demoted. When nothing else is reachable a
 * reprint is better than no guide at all; it just never earns `native`.
 */
export const AGGREGATORS = [
  'manualslib', 'manua.ls', 'manualzz', 'manualowl', 'manualsdir', 'manualscat',
  'device.report', 'all-guides', 'all-guidesbox', 'safemanuals', 'manuall.',
  'manuals.co.uk', 'free-instruction-manuals', 'notice-facile', 'manymanuals',
  'manualsbase', 'manualmachine', 'usermanual.wiki', 'scribd', 'issuu',
  'slideshare', 'studylib', 'docplayer', 'pdfcoffee', 'yumpu',
];

/** Words that mark a link as a manual rather than a shop listing. */
const MANUAL_WORDS = [
  'manual', 'instruction', 'bedienungsanleitung', 'gebrauchsanweisung',
  'notice', 'mode-demploi', 'mode_demploi', "mode d'emploi", 'handleiding',
  'istruzioni', 'manuale', 'instrucciones', 'instrucoes', 'instruções',
  'anleitung', 'betriebsanleitung', 'user-guide', 'userguide',
];

const SHOP_WORDS = ['amazon.', 'ebay.', 'aliexpress', 'rs-online', 'conrad.',
  'leroymerlin', 'bauhaus', 'hornbach', 'toolstation', 'screwfix', '/product/',
  '/shop/', '/p/', 'price', 'buy'];

const host = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };

/**
 * Score one search result. Positive is better; the reasons are returned so
 * a wrong ranking can be diagnosed instead of guessed at.
 */
export function scoreCandidate(url, title, brandKey, canonModel) {
  const h = host(url);
  const lower = (url + ' ' + (title || '')).toLowerCase();
  const reasons = [];
  let score = 0;

  const brand = BRANDS[brandKey];
  if (brand && brand.domains.some(d => h.includes(d))) {
    score += 60; reasons.push('manufacturer domain');
  } else if (brandKey && h.includes(brandKey.toLowerCase())) {
    score += 25; reasons.push('brand name in domain');
  }

  const agg = AGGREGATORS.find(a => h.includes(a));
  if (agg) { score -= 45; reasons.push(`aggregator (${agg})`); }

  if (/\.pdf(\?|$)/i.test(url)) { score += 30; reasons.push('.pdf'); }

  if (canonModel) {
    const urlCanon = url.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (urlCanon.includes(canonModel)) { score += 20; reasons.push('model in URL'); }
    else if ((title || '').toUpperCase().replace(/[^A-Z0-9]/g, '').includes(canonModel)) {
      score += 10; reasons.push('model in title');
    } else { score -= 15; reasons.push('model number absent'); }
  }

  if (MANUAL_WORDS.some(w => lower.includes(w))) { score += 10; reasons.push('manual wording'); }
  if (SHOP_WORDS.some(w => lower.includes(w))) { score -= 20; reasons.push('looks like a shop'); }

  return { score, reasons };
}

/** One Serper call. Returns [] rather than throwing — search is a fallback. */
export async function serperSearch(env, q, { num = 10, gl = 'lu', hl = 'en' } = {}) {
  if (!env.SERPER_API_KEY) return { error: 'no SERPER_API_KEY', results: [] };
  try {
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': env.SERPER_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ q, num, gl, hl }),
    });
    if (!r.ok) return { error: `serper ${r.status}`, results: [] };
    const d = await r.json();
    return { query: q, results: (d.organic || []).map(o => ({
      title: o.title, link: o.link, snippet: o.snippet, position: o.position })) };
  } catch (e) {
    return { error: String(e), results: [] };
  }
}

/**
 * Is this URL actually a reachable PDF? One ranged request, ~1 KB.
 * Cheap enough to run on every candidate before committing to a 21 MB fetch.
 */
export async function verifyPdf(url) {
  try {
    const r = await fetch(url, {
      headers: { range: 'bytes=0-1023',
                 'user-agent': 'Mozilla/5.0 (inventaire manual fetcher)' },
      redirect: 'follow',
    });
    if (!r.ok && r.status !== 206) return { ok: false, status: r.status };
    const buf = await r.arrayBuffer();
    const magic = new TextDecoder().decode(buf.slice(0, 5));
    return {
      ok: magic.startsWith('%PDF'),
      status: r.status,
      content_type: r.headers.get('content-type'),
      magic,
      size_header: r.headers.get('content-range') || r.headers.get('content-length'),
    };
  } catch (e) { return { ok: false, error: String(e) }; }
}

/**
 * Find the best manual URL for a brand + model.
 *
 * Returns every candidate with its score and reasons, not just the winner —
 * when the pipeline picks badly, the reason has to be visible without
 * re-running anything.
 */
export async function findManual(env, brandRaw, modelRaw, canonModel) {
  const brandKey = (brandRaw || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  const brand = BRANDS[brandKey];
  const model = (modelRaw || '').trim();
  const out = { brand: brandKey, model, tried: [], candidates: [] };

  // ---- 1. the verified URL rule, if this manufacturer has one -----------
  if (brand?.direct) {
    for (const url of brand.direct(model)) {
      const v = await verifyPdf(url);
      out.tried.push({ via: 'url_rule', url, ...v });
      if (v.ok) {
        out.candidates.push({ url, via: 'url_rule', score: 200,
          reasons: ['verified manufacturer URL rule (P0.3)'], verified: v });
      }
    }
  }

  // ---- 2. ranked search -------------------------------------------------
  if (!out.candidates.length) {
    const queries = [
      `${brandRaw} ${model} instruction manual filetype:pdf`,
      `${brandRaw} ${model} manual pdf`,
    ];
    const seen = new Set();
    for (const q of queries) {
      const s = await serperSearch(env, q);
      out.tried.push({ via: 'search', query: q,
                       count: s.results.length, error: s.error });
      for (const r of s.results) {
        if (seen.has(r.link)) continue;
        seen.add(r.link);
        const { score, reasons } = scoreCandidate(r.link, r.title, brandKey, canonModel);
        out.candidates.push({ url: r.link, title: r.title, via: 'search', score, reasons });
      }
      // A manufacturer-domain PDF is as good as it gets; stop paying for
      // queries once one is in hand. Serper's free pot is 2 500 total.
      if (out.candidates.some(c => c.score >= 90)) break;
    }
    out.candidates.sort((a, b) => b.score - a.score);

    // Verify only the top few — verification costs a request each.
    for (const c of out.candidates.slice(0, 3)) {
      c.verified = await verifyPdf(c.url);
      if (!c.verified.ok) c.score -= 60;
    }
    out.candidates.sort((a, b) => b.score - a.score);
  }

  const best = out.candidates.find(c => c.verified?.ok) || null;
  out.best = best;
  out.provenance_hint = best
    ? (AGGREGATORS.some(a => host(best.url).includes(a))
        ? 'reprint — cannot be labelled native (D53)'
        : 'candidate original — confirm from PDF metadata after fetch')
    : 'nothing reachable';
  return out;
}

/** Probe endpoint: /api/probe/source?brand=Makita&model=GA5030R */
export async function probeSourceHandler(request, env) {
  const u = new URL(request.url);
  const brand = u.searchParams.get('brand');
  const model = u.searchParams.get('model');
  if (!brand || !model) return json({ error: 'pass ?brand=&model=' }, 400);
  const canon = model.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const t0 = Date.now();
  const r = await findManual(env, brand, model, canon);
  return json({ ...r, ms: Date.now() - t0 });
}
