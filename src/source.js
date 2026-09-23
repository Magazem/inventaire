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

import { pageLanguageMap, detectLanguage } from './probe.js';

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
  // bynder.sbdinc.com is Stanley Black & Decker's asset host — where DeWalt
  // actually serves its PDFs. Found in run #7 by reading their own pages.
  DEWALT:    { domains: ['dewalt.', 'servicenet.dewalt.com', 'service.dewalt.co.uk',
                         'bynder.sbdinc.com'] },
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
  // Added after run #6: manualsonline was NOT on this list, so its index
  // page matched SUPPORT_PATHS ('/manuals/'), earned the +40 support-page
  // bonus, and its reprint was accepted labelled `support_page`. D53 was
  // defeated through a side door — not by a bad source, by a bad LABEL.
  'manualsonline', 'pdfstore-manualsonline', 'prod.a.ki', 'manualsdir',
  'manualsbrain', 'manualzilla', 'manualagent', 'retrevo', 'manualnguide',
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

/**
 * Catalogue / brochure / price-list signals.
 *
 * Probe run #4 picked a Husqvarna SALES CATALOGUE as the best candidate for
 * the 545RXT: manufacturer domain, a real PDF, 16.8 MB — and the URL path
 * said `/brochure-and-catalogue/` in plain sight. A guide written from a
 * marketing brochure is worse than no guide, because it would look fine.
 */
const CATALOGUE_WORDS = [
  'catalog', 'catalogue', 'catálogo', 'catalogo', 'katalog', 'brochure',
  'brochures', 'prospekt', 'pricelist', 'price-list', 'rrp', 'promo',
  'promotion', 'offres', 'angebot', 'mailer', 'newsletter', 'flyer',
  'assortiment', 'sortiment', 'range-guide', 'lookbook',
];

/** A manufacturer support page is not the manual — but it LINKS to it. */
const SUPPORT_PATHS = ['/support/', '/assistance/', '/beratung/', '/supporto/',
  '/suporte/', '/service/', '/downloads/', '/manuals/', '/documentation'];

const host = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };

/**
 * Score one search result. Positive is better; the reasons are returned so
 * a wrong ranking can be diagnosed instead of guessed at.
 */
export function scoreCandidate(url, title, brandKey, canonModel, opts = {}) {
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

  // ---- the model number is not a bonus, it is the point ---------------
  // Run #4's brochure scored 75 with "model number absent" costing only 15.
  // A document that never names the model cannot be that model's manual.
  // Links harvested FROM a model-specific support page inherit the model
  // from that page — Husqvarna's own PDF filenames are opaque asset ids
  // (`aj-874490.pdf`) and would all be disqualified on a name they never
  // carried. The content check still requires the model to appear in the
  // text, so nothing is waved through.
  let named = false;
  if (canonModel && opts.requireModel !== false) {
    const urlCanon = url.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const titleCanon = (title || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (urlCanon.includes(canonModel)) { score += 25; named = true; reasons.push('model in URL'); }
    else if (titleCanon.includes(canonModel)) { score += 20; named = true; reasons.push('model in title'); }
    else { score -= 100; reasons.push('MODEL NUMBER ABSENT — disqualifying'); }
  }

  const cat = CATALOGUE_WORDS.find(w => lower.includes(w));
  if (cat) { score -= 70; reasons.push(`catalogue/brochure (${cat})`); }

  if (MANUAL_WORDS.some(w => lower.includes(w))) { score += 10; reasons.push('manual wording'); }
  if (SHOP_WORDS.some(w => lower.includes(w))) { score -= 20; reasons.push('looks like a shop'); }

  // A manufacturer support page for THIS model is the most valuable HTML
  // there is — not the manual, but the page the manual hangs off.
  //
  // The host test is the whole point. Run #6 followed an AGGREGATOR index
  // page that happened to contain '/manuals/' in its path, then labelled
  // the reprint it found as manufacturer-sourced. A page is only a support
  // page if the manufacturer serves it.
  const isSupport = SUPPORT_PATHS.some(sp => url.toLowerCase().includes(sp));
  const isPdf = /\.pdf(\?|$)/i.test(url);
  const manufacturerHost = !!(brand && brand.domains.some(d => h.includes(d))) && !agg;
  const follow = isSupport && named && !isPdf && manufacturerHost;
  const followReprint = isSupport && named && !isPdf && !manufacturerHost;
  if (follow) reasons.push('manufacturer support page — follow for PDF links');
  if (followReprint) reasons.push('third-party index page — followable, but its links are reprints');

  return { score, reasons, follow, followReprint, named, manufacturerHost, aggregator: agg };
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
        // Spread the whole result: `follow` and `named` were being dropped
        // here, so support pages were never followed (run #5).
        const sc = scoreCandidate(r.link, r.title, brandKey, canonModel);
        out.candidates.push({ url: r.link, title: r.title, via: 'search', ...sc });
      }
      // A manufacturer-domain PDF is as good as it gets; stop paying for
      // queries once one is in hand. Serper's free pot is 2 500 total.
      if (out.candidates.some(c => c.score >= 90)) break;
    }
    out.candidates.sort((a, b) => b.score - a.score);

    // Verify the top few in parallel — 1 KB each, so breadth is cheap and
    // run #4 showed three was too narrow: the real manual sat at rank four.
    // Support pages are skipped; they are MEANT to be HTML.
    const toCheck = out.candidates.filter(c => !c.follow && c.score > -50).slice(0, 8);
    await Promise.all(toCheck.map(async c => {
      c.verified = await verifyPdf(c.url);
      if (c.verified.ok) {
        // Confirmed PDF beats a guess from the file extension. Run #5's real
        // manual was served from `?controller=attachment&id_attachment=152`.
        c.score += 25; c.reasons.push('confirmed PDF on fetch');
      } else {
        c.score -= 60; c.reasons.push(`not a PDF (${c.verified.content_type || c.verified.status})`);
      }
    }));
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

/**
 * Follow a manufacturer support page and harvest the PDF links on it.
 *
 * `husqvarna.com/uk/support/545rxt/` is the RIGHT page — it simply is not
 * the PDF. Run #4 scored it, verified it as HTML, and threw it away. The
 * manual it links to was never seen.
 */
export async function followForPdfs(url) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (inventaire manual fetcher)' },
      redirect: 'follow',
    });
    if (!r.ok) return { ok: false, status: r.status, links: [] };
    const html = (await r.text()).slice(0, 900_000);
    const found = new Set();
    // href/src attributes, plus bare URLs in inlined JSON (support pages
    // routinely deliver their document list as embedded state).
    const re = /(?:href|src|"url"|"link"|"file")\s*[:=]\s*["']([^"']+?\.pdf(?:\?[^"']*)?)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null && found.size < 40) {
      try { found.add(new URL(m[1], url).href); } catch { /* skip */ }
    }
    return { ok: true, links: [...found] };
  } catch (e) { return { ok: false, error: String(e), links: [] }; }
}

/**
 * THE DECIDING CHECK — is this document actually a manual for this model?
 *
 * Everything before this point judges a document by its URL, and run #4
 * proved that cannot work: a catalogue and a manual are indistinguishable
 * from the outside. So ranking now only decides what to TRY. The content
 * decides what to ACCEPT.
 *
 * Four questions, in order of how decisive they are:
 *   1. Does the text name this model?      A catalogue names hundreds.
 *   2. Does it read like instructions?     Safety phrasing, not sales copy.
 *   3. Is it long enough to be a manual?
 *   4. Does it have language sections?     Then we can slice it (D54).
 */
const INSTRUCTION_PHRASES = [
  'safety instructions', 'safety warnings', 'intended use', 'warning',
  'caution', 'personal protective equipment', 'before use', 'maintenance',
  'consignes de sécurité', 'avertissement', 'utilisation conforme',
  'sicherheitshinweise', 'warnung', 'bestimmungsgemäße',
  'istruzioni di sicurezza', 'avvertenza',
  'instruções de segurança', 'instrucciones de seguridad',
];

/** Accent-insensitive so "sécurité" matches a phrase written "securite". */
const flat = s => (s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, ' ').replace(/\s+/g, ' ');
const SALES_PHRASES = ['rrp', 'recommended retail', 'prix conseillé', 'incl. vat',
  'order now', 'our range', 'new for 20', 'find your dealer', 'promotion'];

/**
 * Parts catalogues and exploded views.
 *
 * The Honda run's top candidate was
 * `.../pieces-detachees/Honda/Tondeuse/HRH536K4/vue-eclatee-HRH536K4-QXEH-A.pdf`
 * — 26 pages naming the model 29 times, with one instruction phrase in the
 * whole document. It was refused, correctly, but only because it was thin
 * on instructions. It should be refused for what it IS: a parts diagram is
 * not a weak manual, it is a different kind of document.
 */
// STRONG signals: a document ABOUT parts. Counted in URL, title and text.
const PARTS_STRONG = [
  'vue eclatee', 'pieces detachees', 'exploded view', 'parts list',
  'parts catalog', 'parts catalogue', 'illustrated part', 'explosionszeichnung',
  'ersatzteilliste', 'lista ricambi', 'despiece', 'catalogo de pecas',
  'part number index', 'ipl',
];
// WEAK signals: appear in the BODY of nearly every real manual — STIHL says
// "use only STIHL spare parts" in every edition, and the MS180 manual was
// thrown out for it (44 pages, model named 40×). Counted in URL/title ONLY.
const PARTS_WEAK = ['spare parts', 'ersatzteil', 'pieces de rechange', 'ricambi'];

/**
 * How a French mower manual actually talks.
 *
 * A genuine 63-page Honda owner's manual matched exactly ONE instruction
 * phrase, because the list was written from power-tool language. If its
 * model number had matched, a real manual would have been thrown out. The
 * additions below are all multi-word, so they do not fire on catalogues.
 */
const EXTRA_INSTRUCTION_PHRASES = [
  'consignes de securite', 'precautions de securite', 'regles de securite',
  'avant chaque utilisation', 'avant de demarrer', 'arreter le moteur',
  'entretien periodique', 'porter des lunettes', 'porter des gants',
  'securite de fonctionnement', 'notice originale',
  'safety precautions', 'safety rules', 'before starting the engine',
  'stop the engine', 'periodic maintenance', 'operating safety',
  'original instructions', 'read this manual',
  'sicherheitsvorschriften', 'vor der inbetriebnahme', 'motor abstellen',
  'norme di sicurezza', 'prima dell uso',
  'normas de seguranca', 'antes de utilizar', 'indicacoes de seguranca',
  'instrucoes de seguranca', 'tecnicas de trabalho', 'antes de ligar o motor',
  'desligar o motor', 'desligue o motor', 'manutencao', 'precaucoes',
  'normas de seguridad', 'antes de usar',
];

/**
 * Does this text name this model? — the way manufacturers actually write it.
 *
 * STIHL ships one manual for a family and titles it "BG 56, 66, 86" or
 * "MS 170, 180". Canonicalising that to BG566686 and searching for BG86
 * finds nothing, and the real manual is refused for "model number never
 * appears" with the number sitting in the title. Yazan checked the paper
 * manual in the box: it was always printed this way. This is not an
 * aggregator merging documents; it is how the manufacturer publishes.
 *
 * Three forms are tried, and the one that matched is reported:
 *   exact    BG86C  (the canonical key, as before)
 *   core     BG86   (letters + first digit run, suffix dropped: /C, -E, R…)
 *   family   BG … 86 (the letter prefix, then the number within a short run
 *                    of non-letter characters — commas, slashes, spaces)
 */
export function modelMentions(md, rawModel) {
  const canon = String(rawModel || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!canon) return { hits: 0, form: null };
  const canonText = md.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const count = (hay, needle) => needle ? hay.split(needle).length - 1 : 0;

  const exact = count(canonText, canon);
  if (exact) return { hits: exact, form: 'exact', key: canon };

  const m = canon.match(/^([A-Z]+)(\d+)/);
  if (!m) return { hits: 0, form: null, key: canon };
  const [, prefix, digits] = m;
  const core = prefix + digits;

  if (core !== canon) {
    const c = count(canonText, core);
    if (c) return { hits: c, form: 'core', key: core };
  }

  // Family enumeration on the raw text: "BG 56, 66, 86" / "MS 170/180".
  // The digits must be a whole number (no "86" inside "586"), and only
  // non-letters may sit between prefix and number so "BG … 86" cannot
  // reach across into a different model line.
  const fam = new RegExp('\\b' + prefix + '\\b[^A-Za-z]{0,40}?\\b' + digits + '\\b', 'g');
  const f = (md.match(fam) || []).length;
  if (f) return { hits: f, form: 'family', key: `${prefix} … ${digits}` };

  return { hits: 0, form: null, key: canon };
}

export function qualifyManual(md, canonModel, url = '') {
  const lower = md.toLowerCase();
  const flatText = flat(md.slice(0, 200_000));
  const flatUrl = flat(url);
  const mention = modelMentions(md, canonModel);
  const modelHits = mention.hits;

  const instruction = [
    ...INSTRUCTION_PHRASES.filter(p => lower.includes(p)),
    ...EXTRA_INSTRUCTION_PHRASES.filter(p => flatText.includes(flat(p))),
  ];
  const parts = [
    ...PARTS_STRONG.filter(p => flatUrl.includes(flat(p)) || flatText.includes(flat(p))),
    ...PARTS_WEAK.filter(p => flatUrl.includes(flat(p))),
  ];
  // A parts diagram is mostly numbers. A manual is mostly words.
  const digits = (md.match(/\d/g) || []).length;
  const letters = (md.match(/\p{L}/gu) || []).length || 1;
  const digitRatio = digits / letters;
  const sales = SALES_PHRASES.filter(p => lower.includes(p));
  const map = pageLanguageMap(md);
  const pages = map.total_pages || 0;
  // When the document does not label its pages it is almost always a
  // SINGLE-language edition (pattern B). Knowing which one is not optional:
  // filing the French manual as German would be silent and permanent.
  const detected = (map.coverage || 0) < 0.3 ? detectLanguage(md) : null;

  const reasons = [];
  let verdict = 'manual';
  if (modelHits === 0) { verdict = 'reject'; reasons.push('the model number never appears in the text'); }
  // A parts diagram names the model constantly and instructs on nothing.
  // Needs a parts signal AND thin instructions AND a number-heavy body —
  // any one alone is not enough, which is what run #11 taught.
  if (parts.length && instruction.length < 4 && digitRatio > 0.12) {
    verdict = 'reject';
    reasons.push(`parts catalogue / exploded view (${parts.slice(0, 2).join(', ')}; ` +
                 `digit ratio ${digitRatio.toFixed(2)})`);
  }
  // The phrase count exists to catch catalogues and spec sheets, not to
  // veto a manual whose language the list covers poorly. STIHL FS300: 44
  // pages, model named 15 times exactly, Portuguese, one phrase matched —
  // refused. A long document that names the model that often, with no
  // parts or sales signals and at least one instruction phrase, is a
  // manual whatever the phrase list thinks of its vocabulary.
  const strongMention = modelHits >= 5 && (mention.form === 'exact' || mention.form === 'core');
  const manualShaped = pages >= 20 && md.length >= 40_000 && !parts.length && sales.length < 2;
  if (instruction.length < 3 && !(strongMention && manualShaped && instruction.length >= 1)) {
    verdict = 'reject'; reasons.push(`only ${instruction.length} instruction phrases`);
  }
  if (md.length < 8000) { verdict = 'reject'; reasons.push('too short to be a manual'); }
  if (sales.length >= 2 && instruction.length < 6) {
    verdict = 'reject'; reasons.push(`reads like sales material (${sales.join(', ')})`);
  }
  // A catalogue DOES name many models — but names this one only in passing.
  if (verdict === 'manual' && pages > 40 && modelHits <= 2) {
    verdict = 'doubtful';
    reasons.push(`${pages} pages but the model is named only ${modelHits}×`);
  }
  return {
    verdict, reasons,
    parts_signals: parts,
    digit_ratio: +digitRatio.toFixed(3),
    instruction_matched: instruction.slice(0, 6),
    structure: (map.coverage || 0) >= 0.3
      ? 'multilingual, page-labelled' : 'single-language (or unlabelled)',
    document_language: detected,
    model_hits: modelHits,
    model_form: mention.form,        // exact | core | family — how it was named
    instruction_phrases: instruction.length,
    sales_phrases: sales,
    chars: md.length,
    pages,
    language_map: map,
  };
}

/**
 * Walk the ranked candidates and return the FIRST that actually qualifies.
 *
 * Every attempt is reported, pass or fail. When the pipeline ends up with a
 * poor source, the reason has to be readable afterwards without re-running
 * anything — that is what made run #1's ManualsLib reprint diagnosable.
 */
export async function acquireManual(env, brandRaw, modelRaw, canonModel, opts = {}) {
  const maxTries = opts.maxTries ?? 4;
  const found = await findManual(env, brandRaw, modelRaw, canonModel);
  const attempts = [];

  // Support pages are followed first — they are the manufacturer telling us
  // where its own documents live.
  const queue = [];
  for (const c of found.candidates) {
    if (c.follow) {
      const f = await followForPdfs(c.url);
      attempts.push({ stage: 'follow', url: c.url, links: f.links?.length ?? 0,
                      error: f.error, status: f.status });
      for (const link of (f.links || []).slice(0, 6)) {
        const { score, reasons } = scoreCandidate(link, '', found.brand, canonModel,
                                                  { requireModel: false });
        queue.push({ url: link, via: 'support_page', score: score + 40,
                     reasons: [...reasons, 'linked from a manufacturer support page'] });
      }
    }
  }
  // Anything already proven not to be a PDF is skipped rather than allowed
  // to burn a try — each try is a full fetch plus conversion.
  queue.push(...found.candidates.filter(c => !c.follow && c.verified?.ok !== false));
  queue.sort((a, b) => b.score - a.score);

  let accepted = null;
  for (const c of queue.slice(0, maxTries)) {
    const head = await verifyPdf(c.url);
    if (!head.ok) { attempts.push({ stage: 'head', url: c.url, ...head }); continue; }

    let md = '';
    try {
      const r = await fetch(c.url, {
        headers: { 'user-agent': 'Mozilla/5.0 (inventaire manual fetcher)' },
        redirect: 'follow' });
      const buf = await r.arrayBuffer();
      const conv = await env.AI.toMarkdown({
        name: (c.url.split('/').pop() || 'manual.pdf').split('?')[0],
        blob: new Blob([buf], { type: 'application/pdf' }) });
      md = conv?.data || '';
    } catch (e) {
      attempts.push({ stage: 'convert', url: c.url, error: String(e) });
      continue;
    }

    const q = qualifyManual(md, canonModel, c.url);
    attempts.push({ stage: 'qualify', url: c.url, score: c.score, via: c.via,
                    provenance: c.provenance,
                    verdict: q.verdict, reasons: q.reasons,
                    model_hits: q.model_hits, model_form: q.model_form,
                    pages: q.pages, chars: q.chars,
                    instruction_phrases: q.instruction_phrases,
                    instruction_matched: q.instruction_matched,
                    parts_signals: q.parts_signals,
                    structure: q.structure,
                    document_language: q.document_language?.language,
                    languages: Object.keys(q.language_map.languages || {}) });
    if (q.verdict === 'manual') {
      // The trust tier is decided HERE, once, from where the bytes came
      // from — not inferred later from a URL somebody has stopped looking at.
      const h = host(c.url);
      const isAgg = AGGREGATORS.some(a => h.includes(a));
      const brandCfg = BRANDS[found.brand];
      const fromManufacturer = !isAgg && !!brandCfg?.domains.some(d => h.includes(d));
      accepted = {
        url: c.url, via: c.via, score: c.score,
        provenance: c.provenance || (fromManufacturer ? 'manufacturer'
                    : isAgg ? 'reprint' : 'third_party'),
        trust_tier_allowed: fromManufacturer ? 'native' : 'auto',
        qualification: q,
      };
      break;
    }
  }

  return { brand: found.brand, model: found.model, ranked: found.candidates,
           attempts, accepted,
           outcome: accepted ? 'manual acquired'
             : attempts.some(a => a.stage === 'qualify')
               ? 'candidates found but none qualified — needs a human-supplied manual (D57)'
               : 'nothing reachable at all — needs a human-supplied manual (D57)' };
}

/** Fetch a PDF and convert it to markdown. Shared by acquire and guide. */
export async function fetchMarkdown(env, url) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (inventaire manual fetcher)' },
      redirect: 'follow' });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const conv = await env.AI.toMarkdown({
      name: (url.split('/').pop() || 'manual.pdf').split('?')[0],
      blob: new Blob([buf], { type: 'application/pdf' }) });
    return conv?.data || null;
  } catch { return null; }
}

/** Probe endpoint: /api/probe/acquire?brand=Husqvarna&model=545RXT */
export async function probeAcquireHandler(request, env) {
  const u = new URL(request.url);
  const brand = u.searchParams.get('brand');
  const model = u.searchParams.get('model');
  if (!brand || !model) return json({ error: 'pass ?brand=&model=' }, 400);
  const canon = model.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const t0 = Date.now();
  const r = await acquireManual(env, brand, model, canon);
  return json({ ...r, ms: Date.now() - t0 });
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
