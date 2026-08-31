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
 * Language markers. Deliberately phrases a manual always contains, not
 * common words — "de" appears in French, Portuguese and Spanish alike and
 * would tell us nothing.
 */
const MARKERS = {
  en: ['safety instructions', 'warning', 'intended use', 'do not', 'before use'],
  fr: ['consignes de sécurité', 'avertissement', 'utilisation conforme',
       'mode d\'emploi', 'ne pas'],
  de: ['sicherheitshinweise', 'warnung', 'bestimmungsgemäße verwendung',
       'gebrauchsanweisung', 'nicht'],
  it: ['istruzioni di sicurezza', 'avvertenza', 'uso previsto',
       'istruzioni per l\'uso'],
  pt: ['instruções de segurança', 'aviso', 'utilização prevista',
       'manual de instruções'],
  es: ['instrucciones de seguridad', 'advertencia', 'uso previsto'],
  nl: ['veiligheidsvoorschriften', 'waarschuwing', 'beoogd gebruik'],
  ar: ['تعليمات', 'تحذير', 'السلامة'],
};

/** Where in the document does each language appear? Positions, not counts. */
function scanLanguages(md) {
  const lower = md.toLowerCase();
  const out = {};
  for (const [lang, phrases] of Object.entries(MARKERS)) {
    const hits = [];
    for (const phrase of phrases) {
      let i = lower.indexOf(phrase.toLowerCase());
      while (i !== -1 && hits.length < 40) {
        hits.push(i);
        i = lower.indexOf(phrase.toLowerCase(), i + 1);
      }
    }
    if (!hits.length) continue;
    hits.sort((a, b) => a - b);
    out[lang] = {
      occurrences: hits.length,
      first_at_pct: +(100 * hits[0] / md.length).toFixed(1),
      last_at_pct: +(100 * hits[hits.length - 1] / md.length).toFixed(1),
    };
  }
  return out;
}

/** Does the converter give us page boundaries? Stage 2 needs them. */
function pageSignals(md) {
  const patterns = {
    form_feed: (md.match(/\f/g) || []).length,
    md_hr: (md.match(/^---\s*$/gm) || []).length,
    page_word: (md.match(/\bpage\s+\d{1,3}\b/gi) || []).length,
  };
  return patterns;
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
    fetch: { ms: tFetch, bytes: buf.byteLength, looks_like_pdf: looksPdf,
             content_type: res.headers.get('content-type') },
    convert: { ms: tConv, format: conv?.format, mimetype: conv?.mimetype,
               tokens: conv?.tokens, error: conv?.error,
               chars: md.length,
               chars_per_page_guess: md.length ? undefined : null },
    languages_found: scanLanguages(md),
    page_signals: pageSignals(md),
    first_600: md.slice(0, 600),
    middle_400: md.slice(Math.floor(md.length / 2), Math.floor(md.length / 2) + 400),
  });
}
