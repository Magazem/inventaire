/**
 * P1.2 probe — can the Worker turn a manufacturer PDF into text?
 *
 * The question this answers, and why it is a probe and not an assumption:
 * the Workers FREE plan allows 10 ms of CPU per invocation, and parsing a
 * 160-page PDF in-process blows straight through that. Cloudflare's own
 * toMarkdown runs the conversion OFF the Worker, so it should cost us
 * almost no CPU — but "should" is not evidence, and the July 2026 changelog
 * moved some Workers AI capacity behind the paid plan. So we measure.
 *
 * Three things it reports, in order of importance:
 *   1. Did it work at all on this plan? (a 403 / code 5035 means paid-only)
 *   2. How much text came back, and is it the real manual or a cover page?
 *   3. Can we LOCATE a language section inside a multilingual PDF? That is
 *      stage 2 of the pipeline (P0.3 pattern A) and the probe is the
 *      cheapest place to find out it is hard.
 *
 * Session-gated: it fetches an arbitrary URL, so it must not be open.
 */

const json = (d, s = 200) => new Response(JSON.stringify(d, null, 2), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });

const MAX_PDF_BYTES = 30_000_000;

/**
 * Language markers.
 *
 * Rewritten after probe run #1. Two rules learned there:
 *
 *  1. SHORT WORDS ARE USELESS. "nicht", "the", "and" hit everywhere and told
 *     us nothing. Only multi-word phrases that a manual actually contains,
 *     and that no other language shares.
 *  2. THE COVER LIES. An aggregator index page listing "Verfügbare Sprachen
 *     DA DE EN FR IT NL PT" fires every marker at once, in the first 1% of
 *     the document, and makes every language look like it starts at the top.
 *     So the scan reports a DENSITY HISTOGRAM, not first/last position — a
 *     real language section is a contiguous block, an index page is a spike.
 */
const MARKERS = {
  en: ['safety instructions', 'intended use', 'personal protective equipment',
       'read all safety warnings', 'technical data'],
  fr: ['consignes de sécurité', 'utilisation conforme', 'mode d\'emploi',
       'équipement de protection', 'caractéristiques techniques'],
  de: ['sicherheitshinweise', 'bestimmungsgemäße verwendung', 'gebrauchsanweisung',
       'persönliche schutzausrüstung', 'technische daten'],
  it: ['istruzioni di sicurezza', 'uso previsto', 'istruzioni per l\'uso',
       'dispositivi di protezione', 'dati tecnici'],
  pt: ['instruções de segurança', 'utilização prevista', 'manual de instruções',
       'equipamento de protecção', 'dados técnicos'],
  es: ['instrucciones de seguridad', 'uso previsto', 'manual de instrucciones',
       'equipo de protección', 'datos técnicos'],
  nl: ['veiligheidsvoorschriften', 'beoogd gebruik', 'gebruiksaanwijzing',
       'persoonlijke beschermingsmiddelen', 'technische gegevens'],
  ar: ['تعليمات السلامة', 'الاستخدام المقصود', 'معدات الحماية'],
};

const BUCKETS = 20;

/**
 * Where does each language actually LIVE in the document?
 *
 * The histogram is the whole point. A genuine language section looks like
 *   [0,0,0,0,7,9,8,6,0,0,...]   — a contiguous block
 * an index page looks like
 *   [3,0,0,0,0,0,0,0,0,0,...]   — one spike at the very start
 * and interleaved languages look like
 *   [1,0,1,0,1,0,1,0,1,0,...]   — which would kill positional slicing.
 */
function scanLanguages(md) {
  const lower = md.toLowerCase();
  const L = md.length || 1;
  const out = {};
  for (const [lang, phrases] of Object.entries(MARKERS)) {
    const hist = new Array(BUCKETS).fill(0);
    let total = 0;
    for (const phrase of phrases) {
      const needle = phrase.toLowerCase();
      let i = lower.indexOf(needle);
      while (i !== -1 && total < 500) {
        hist[Math.min(BUCKETS - 1, Math.floor(BUCKETS * i / L))]++;
        total++;
        i = lower.indexOf(needle, i + needle.length);
      }
    }
    if (!total) continue;

    // The densest contiguous run of non-empty buckets = the likely section.
    let best = { from: 0, to: 0, weight: 0 };
    for (let a = 0; a < BUCKETS; a++) {
      let w = 0;
      for (let b = a; b < BUCKETS; b++) {
        if (hist[b] === 0 && b > a) break;
        w += hist[b];
        if (w > best.weight) best = { from: a, to: b, weight: w };
      }
    }
    // A language that appears ONLY as a couple of hits in the opening
    // bucket is the cover's "available languages" list, not a section.
    // Probe run #1 was fooled by exactly this.
    const indexOnly = total <= 2 && best.from === 0;
    out[lang] = {
      hits: total,
      histogram: hist,
      likely_section_pct: [best.from * 100 / BUCKETS, (best.to + 1) * 100 / BUCKETS],
      share_in_section: +(best.weight / total).toFixed(2),
      looks_like_index_only: indexOnly,
      usable_section: !indexOnly && total >= 3 && best.weight / total >= 0.5,
    };
  }
  return out;
}

/** Page boundaries — stage 2 needs something to slice on. */
function pageSignals(md) {
  const explicit = md.match(/^#+\s*Page\s+\d{1,4}\s*$/gim) || [];
  return {
    heading_pages: explicit.length,
    form_feed: (md.match(/\f/g) || []).length,
    page_word: (md.match(/\bpage\s+\d{1,3}\b/gi) || []).length,
    first_page_heading: explicit[0] || null,
    last_page_heading: explicit[explicit.length - 1] || null,
  };
}

/**
 * Is this the manufacturer's document, or somebody's reprint of it?
 *
 * Probe run #1 fetched a ManualsLib page rendered by wkhtmltopdf and it
 * looked, from every numeric field, like a perfect success. A guide written
 * from that must never be labelled `native` (D45) — so the detection has to
 * happen here, at the source, not be spotted later by a human.
 */
function provenance(md, url) {
  const head = md.slice(0, 1500);
  const grab = k => (head.match(new RegExp('^- ' + k + '=(.*)$', 'm')) || [])[1] || null;
  const creator = grab('Creator'), producer = grab('Producer'), title = grab('Title');
  const AGGREGATORS = ['manualslib', 'manualsbase', 'manua.ls', 'manualzz',
                       'manualowl', 'safemanuals', 'manualsdir'];
  const hay = (url + ' ' + (title || '')).toLowerCase();
  const aggregator = AGGREGATORS.find(a => hay.includes(a)) || null;
  const htmlPrint = /wkhtmltopdf|Qt \d|Chrome|Puppeteer|Prince/i.test(
    (creator || '') + ' ' + (producer || ''));
  return {
    creator, producer, title,
    aggregator,
    rendered_from_html: htmlPrint,
    verdict: aggregator || htmlPrint
      ? 'NOT the manufacturer document — a reprint. Cannot be labelled native (D45).'
      : 'looks like an original publisher PDF',
  };
}

/**
 * PAGE-HEADER LANGUAGE MAP — the primary slicing method.
 *
 * Discovered in probe run #2. The Makita EU manual prints the language name
 * in every page's running header, and toMarkdown preserves it:
 *
 *     ### Page 70
 *     70 DUTCH
 *     Use with a disc-shaped wire brush ...
 *
 * That is the document telling us exactly where each section begins and
 * ends. It beats phrase-frequency guessing outright: exact page boundaries
 * instead of a statistical blur, and it cannot be fooled by a cover page
 * listing every language, or by Italian and Spanish sharing "uso previsto".
 *
 * The histogram stays as the fallback for publishers who do not label pages.
 */
const LANG_NAMES = {
  en: ['ENGLISH', 'ENGLISH (ORIGINAL INSTRUCTIONS)'],
  fr: ['FRANCAIS', 'FRANÇAIS', 'FRENCH'],
  de: ['DEUTSCH', 'GERMAN'],
  it: ['ITALIANO', 'ITALIAN'],
  pt: ['PORTUGUES', 'PORTUGUÊS', 'PORTUGUESE'],
  es: ['ESPANOL', 'ESPAÑOL', 'SPANISH'],
  nl: ['NEDERLANDS', 'DUTCH'],
  da: ['DANSK', 'DANISH'],
  sv: ['SVENSKA', 'SWEDISH'],
  no: ['NORSK', 'NORWEGIAN'],
  fi: ['SUOMI', 'FINNISH'],
  pl: ['POLSKI', 'POLISH'],
  cs: ['CESKY', 'ČESKY', 'CZECH'],
  sk: ['SLOVENCINA', 'SLOVENČINA', 'SLOVAK'],
  hu: ['MAGYAR', 'HUNGARIAN'],
  ro: ['ROMANA', 'ROMÂNĂ', 'ROMANIAN'],
  el: ['ΕΛΛΗΝΙΚΑ', 'GREEK'],
  tr: ['TURKCE', 'TÜRKÇE', 'TURKISH'],
  ru: ['РУССКИЙ', 'RUSSIAN'],
  uk: ['УКРАЇНСЬКА', 'UKRAINIAN'],
  ar: ['العربية', 'ARABIC'],
  lt: ['LIETUVIU', 'LIETUVIŲ', 'LITHUANIAN'],
  lv: ['LATVIESU', 'LATVIEŠU', 'LATVIAN'],
  et: ['EESTI', 'ESTONIAN'],
  sl: ['SLOVENSCINA', 'SLOVENŠČINA', 'SLOVENIAN'],
  hr: ['HRVATSKI', 'CROATIAN'],
  bg: ['БЪЛГАРСКИ', 'BULGARIAN'],
  sr: ['SRPSKI', 'SERBIAN'],
};

/** Build name -> code once, longest first so "PORTUGUÊS" wins over "PORT". */
const NAME_TO_CODE = Object.entries(LANG_NAMES)
  .flatMap(([code, names]) => names.map(n => [n, code]))
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Split the markdown into pages on toMarkdown's own "### Page N" headings,
 * then read each page's running header for a language name.
 *
 * Returns character offsets, not page numbers, because the offsets are what
 * the pipeline actually slices on.
 */
export function pageLanguageMap(md) {
  const re = /^#{1,6}\s*Page\s+(\d+)\s*$/gim;
  const marks = [];
  let m;
  while ((m = re.exec(md)) !== null)
    marks.push({ page: Number(m[1]), at: m.index, textFrom: m.index + m[0].length });
  if (marks.length < 3) return { ok: false, reason: 'no page headings in the conversion' };

  const pages = marks.map((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : md.length;
    const body = md.slice(mk.textFrom, end);
    // Running heads sit at the very top of the page; look a little way in
    // to survive the page number and stray whitespace.
    const head = body.slice(0, 140).toUpperCase();
    let lang = null;
    for (const [name, code] of NAME_TO_CODE)
      if (head.includes(name)) { lang = code; break; }
    return { page: mk.page, lang, from: mk.at, to: end };
  });

  const labelled = pages.filter(p => p.lang).length;
  const byLang = {};
  for (const p of pages) {
    if (!p.lang) continue;
    const e = byLang[p.lang] ||= { pages: [], from: p.from, to: p.to, page_count: 0 };
    e.pages.push(p.page);
    e.from = Math.min(e.from, p.from);
    e.to = Math.max(e.to, p.to);
    e.page_count++;
  }
  // Contiguous? A language scattered across the document cannot be sliced
  // by offset and must fall back to per-page collection.
  for (const [code, e] of Object.entries(byLang)) {
    const span = e.pages[e.pages.length - 1] - e.pages[0] + 1;
    e.contiguous = span === e.page_count;
    e.first_page = e.pages[0];
    e.last_page = e.pages[e.pages.length - 1];
    e.chars = e.to - e.from;
    e.pct = [+(100 * e.from / md.length).toFixed(1), +(100 * e.to / md.length).toFixed(1)];
    delete e.pages;                       // keep the response readable
  }
  return {
    ok: labelled >= 3,
    total_pages: pages.length,
    labelled_pages: labelled,
    coverage: +(labelled / pages.length).toFixed(2),
    languages: byLang,
    unlabelled_sample: pages.filter(p => !p.lang).slice(0, 3)
      .map(p => md.slice(p.from, p.from + 90).replace(/\s+/g, ' ')),
  };
}

/**
 * WHOLE-DOCUMENT LANGUAGE DETECTION.
 *
 * Needed because run #7 found a THIRD document structure. Two were known:
 *
 *   Makita   — one multilingual PDF, language name in every page header
 *   (that one is solved by pageLanguageMap)
 *
 *   Husqvarna — SEPARATE per-locale documents. `rocha.fr` served the French
 *   manual: 38 pages, no page-header labels at all, coverage 0. The page map
 *   correctly reported failure, but "which language is this?" still has to
 *   be answered, because pattern-B manufacturers need one source PER
 *   LANGUAGE and we must not file the French manual as the German one.
 *
 * Function words, not phrases. A cover page listing "DE Bedienungsanweisung
 * / FR Manuel / IT Manuale" fires every phrase marker at once — run #4's
 * exact trap — but it cannot shift the balance of 8 000 occurrences of
 * "le", "la" and "des" across a French document.
 */
const STOPWORDS = {
  en: [' the ', ' and ', ' for ', ' with ', ' not ', ' this ', ' from ', ' that '],
  fr: [' le ', ' la ', ' les ', ' des ', ' est ', ' pour ', ' avec ', ' dans ', ' une '],
  de: [' der ', ' die ', ' das ', ' und ', ' nicht ', ' mit ', ' für ', ' den ', ' auf '],
  it: [' il ', ' lo ', ' che ', ' per ', ' con ', ' non ', ' della ', ' nel '],
  es: [' el ', ' los ', ' que ', ' para ', ' con ', ' del ', ' una ', ' por '],
  pt: [' que ', ' para ', ' com ', ' não ', ' uma ', ' dos ', ' pelo ', ' está '],
  nl: [' het ', ' een ', ' niet ', ' voor ', ' van ', ' met ', ' door ', ' deze '],
  da: [' ikke ', ' eller ', ' skal ', ' med ', ' for ', ' den ', ' det '],
  sv: [' inte ', ' eller ', ' ska ', ' med ', ' för ', ' den ', ' att '],
  fi: [' että ', ' tai ', ' kun ', ' sekä ', ' jos ', ' ole '],
  pl: [' nie ', ' lub ', ' jest ', ' oraz ', ' przez ', ' dla '],
  tr: [' için ', ' veya ', ' bir ', ' ile ', ' değil '],
};

export function detectLanguage(text) {
  // Middle 60% — skip covers and back-matter, which are the multilingual bits.
  const L = text.length;
  const body = (L > 4000 ? text.slice(Math.floor(L * 0.2), Math.floor(L * 0.8)) : text)
    .toLowerCase().replace(/\s+/g, ' ');
  const scores = {};
  for (const [lang, words] of Object.entries(STOPWORDS)) {
    let n = 0;
    for (const w of words) {
      let i = body.indexOf(w);
      while (i !== -1) { n++; i = body.indexOf(w, i + 1); }
    }
    if (n) scores[lang] = n;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { language: null, confidence: 0, scores: {} };
  const [top, topN] = ranked[0];
  const second = ranked[1]?.[1] || 0;
  return {
    language: top,
    // How far clear of the runner-up? Romance languages share function
    // words, so a narrow win is a real warning rather than a detail.
    confidence: +(1 - second / topN).toFixed(2),
    per_1k_chars: +(1000 * topN / body.length).toFixed(2),
    scores: Object.fromEntries(ranked.slice(0, 5)),
  };
}

export async function probePdfHandler(request, env) {
  const u = new URL(request.url);
  const target = u.searchParams.get('url');
  if (!target) return json({ error: 'pass ?url=<https pdf url>' }, 400);
  if (!target.startsWith('https://'))
    return json({ error: 'https only' }, 400);

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(target, {
      headers: { 'user-agent': 'Mozilla/5.0 (inventaire manual fetcher)' },
      redirect: 'follow',
    });
  } catch (e) {
    return json({ stage: 'fetch', ok: false, error: String(e), url: target });
  }
  if (!res.ok)
    return json({ stage: 'fetch', ok: false, status: res.status,
                  content_type: res.headers.get('content-type'), url: target });

  const buf = await res.arrayBuffer();
  const tFetch = Date.now() - t0;

  if (buf.byteLength > MAX_PDF_BYTES)
    return json({ stage: 'fetch', ok: false, bytes: buf.byteLength,
                  error: 'over the probe size cap' });

  const head = new TextDecoder().decode(buf.slice(0, 5));
  const looksPdf = head.startsWith('%PDF');

  if (!env.AI)
    return json({ stage: 'convert', ok: false,
      error: 'no AI binding — add [ai] binding = "AI" to wrangler.toml and redeploy' });

  const t1 = Date.now();
  let conv;
  try {
    conv = await env.AI.toMarkdown({
      name: (target.split('/').pop() || 'manual.pdf').split('?')[0],
      blob: new Blob([buf], { type: 'application/pdf' }),
    });
  } catch (e) {
    // A 403 with code 5035 is the "this needs Workers Paid" signal.
    return json({ stage: 'convert', ok: false, error: String(e),
      fetch_ms: tFetch, bytes: buf.byteLength, looks_like_pdf: looksPdf,
      read_this: 'if this mentions 403 or 5035, toMarkdown needs the paid plan' });
  }
  const tConv = Date.now() - t1;

  const md = conv?.data || '';
  return json({
    ok: conv?.format !== 'error' && md.length > 0,
    url: target,
    provenance: provenance(md, target),
    fetch: { ms: tFetch, bytes: buf.byteLength, looks_like_pdf: looksPdf,
             content_type: res.headers.get('content-type') },
    convert: { ms: tConv, format: conv?.format, mimetype: conv?.mimetype,
               tokens: conv?.tokens, error: conv?.error,
               chars: md.length,
               chars_per_page_guess: md.length ? undefined : null },
    page_language_map: pageLanguageMap(md),
    languages_found_fallback: scanLanguages(md),
    page_signals: pageSignals(md),
    first_600: md.slice(0, 600),
    middle_400: md.slice(Math.floor(md.length / 2), Math.floor(md.length / 2) + 400),
  });
}
