/**
 * /inspect — read-only diagnostic view.
 *
 * Purpose: after a capture, see exactly what landed in D1 and R2. It is NOT
 * the admin page (that comes with the local HTML tool and File System Access,
 * design §6). Nothing here writes. It is safe to open at any time.
 */
export function inspectPage() {
  return `<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inventaire — contrôle</title>
<style>
  :root{
    --bg:#f6f7f9; --card:#fff; --ink:#16181d; --muted:#6b7280;
    --line:#e3e6ea; --accent:#2563eb; --warn:#b45309; --bad:#b91c1c; --good:#15803d;
  }
  @media (prefers-color-scheme:dark){
    :root{ --bg:#14161a; --card:#1c1f25; --ink:#e9eaed; --muted:#9aa1ac;
           --line:#2c313a; --accent:#7aa2f7; --warn:#e0a458; --bad:#f07178; --good:#79c07d; }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  header{position:sticky;top:0;z-index:5;background:var(--card);
         border-bottom:1px solid var(--line);padding:12px 16px;
         display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  h1{font-size:17px;margin:0;font-weight:650}
  .counts{color:var(--muted);font-size:13px}
  main{padding:16px;max-width:1100px;margin:0 auto}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;
     color:var(--muted);margin:28px 0 10px;font-weight:650}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;
        padding:14px;margin-bottom:10px;display:flex;gap:14px}
  .thumbs{display:flex;gap:8px;flex:0 0 auto}
  .thumbs img{width:88px;height:88px;object-fit:cover;border-radius:8px;
              border:1px solid var(--line);background:var(--bg)}
  .noimg{width:88px;height:88px;border:1px dashed var(--line);border-radius:8px;
         display:grid;place-items:center;color:var(--muted);font-size:11px;text-align:center}
  .body{flex:1;min-width:0}
  .idline{font-weight:650;font-size:15px}
  .idline small{font-weight:400;color:var(--muted);margin-left:8px}
  .meta{color:var(--muted);font-size:13px;margin-top:2px;
        word-break:break-word}
  .tags{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap}
  .tag{font-size:12px;padding:2px 8px;border-radius:999px;
       border:1px solid var(--line);color:var(--muted)}
  .tag.b{color:var(--bad);border-color:var(--bad)}
  .tag.w{color:var(--warn);border-color:var(--warn)}
  .tag.g{color:var(--good);border-color:var(--good)}
  .units{margin-top:8px;font-size:13px}
  .units span{display:inline-block;border:1px solid var(--line);border-radius:6px;
              padding:1px 7px;margin:2px 4px 2px 0;font-family:ui-monospace,monospace}
  table{width:100%;border-collapse:collapse;font-size:13px;background:var(--card);
        border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);
        vertical-align:top}
  th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase}
  tr:last-child td{border-bottom:0}
  .wrap{overflow-x:auto}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
  .empty{color:var(--muted);padding:20px;text-align:center;
         border:1px dashed var(--line);border-radius:10px}
  button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid var(--line);
         background:transparent;color:var(--ink);cursor:pointer}
  a{color:var(--accent)}
  .mini{font-size:12px;padding:3px 9px;border-radius:999px}
  .why{margin-top:10px;font-size:13px}
  .why summary{cursor:pointer;color:var(--warn);font-weight:600}
  .why table{margin-top:8px}
  .muted{color:var(--muted)}
  .acts{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}
  .acts button{font-size:12px;padding:4px 10px;border-radius:999px}
  .danger{color:var(--bad);border-color:var(--bad)}
  .card.gone{opacity:.55}
  .card.gone .idline::after{content:' — dans la corbeille';color:var(--bad);
    font-weight:600;font-size:13px}
  .edit{margin-top:10px;font-size:13px}
  .edit summary{cursor:pointer;color:var(--accent);font-weight:600}
  .edit .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
    gap:8px;margin-top:8px}
  .edit label{display:block;font-size:12px;color:var(--muted)}
  .edit input{width:100%;font:inherit;padding:6px 8px;border:1px solid var(--line);
    border-radius:8px;background:var(--bg);color:var(--ink)}
  .warn{color:var(--warn);font-size:12px;margin-top:6px}
  .bin{background:var(--card);border:1px solid var(--bad);border-radius:10px;
    padding:12px;margin-bottom:14px}
  .up{margin-top:10px;font-size:13px}
  .up summary{cursor:pointer;color:var(--accent);font-weight:600}
  .up input[type=file]{font:inherit;margin-top:8px;max-width:100%}
  .up .report{margin-top:8px;font-size:12px;white-space:pre-wrap;
    font-family:ui-monospace,monospace;color:var(--muted)}
  .up .report.bad{color:var(--bad)}
  .up .report.good{color:var(--good)}
</style>
<header>
  <h1>Inventaire — contrôle</h1>
  <span class="counts" id="counts">chargement…</span>
  <span style="flex:1"></span>
  <button onclick="load()">Rafraîchir</button>
  <button id="requeue-all">Relancer tout ce qui attend</button>
  <button id="purge" class="danger">Vider la corbeille</button>
  <a href="/capture">→ saisie</a>
</header>
<main id="out"><p class="empty">chargement…</p></main>
<script>
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const img = (k, alt) => k
  ? '<a href="/api/photo?key=' + encodeURIComponent(k) + '" target="_blank">' +
    '<img src="/api/photo?key=' + encodeURIComponent(k) + '" alt="' + esc(alt) + '"></a>'
  : '<div class="noimg">pas de<br>photo</div>';

function tagsFor(m){
  const t = [];
  const ia = { pending:['w','IA en attente'], skipped:['','IA ignorée'],
               done:['g','IA terminée'], error:['b','IA en erreur'] }[m.ia_etat]
             || ['', 'IA ' + m.ia_etat];
  t.push('<span class="tag ' + ia[0] + '">' + esc(ia[1]) +
         (m.ia_tentatives ? ' ×' + m.ia_tentatives : '') + '</span>');
  const ms = { a_rediger:['w','mode d\\'emploi à rédiger'],
               sans_objet:['','pas de mode d\\'emploi (voulu)'],
               redige:['g','mode d\\'emploi rédigé'] }[m.manual_state]
             || ['', esc(m.manual_state)];
  t.push('<span class="tag ' + ms[0] + '">' + ms[1] + '</span>');
  if (m.danger_eleve) t.push('<span class="tag b">machine dangereuse</span>');
  if (m.consommable)  t.push('<span class="tag">consommable</span>');
  if (m.suivi === 'quantite') t.push('<span class="tag">suivi par quantité</span>');
  if (m.ia_erreur) t.push('<span class="tag b">' + esc(m.ia_erreur).slice(0,80) + '</span>');
  return '<div class="tags">' + t.join('') + '</div>';
}

// Delegated: the cards are rebuilt on every load, so a listener on the
// container outlives them. It also keeps quotes out of generated markup,
// which is what broke this page the first time.
document.addEventListener('click', e => {
  const rq = e.target.closest('[data-requeue]');
  if (rq) { requeue(rq.getAttribute('data-requeue')); return; }
  if (e.target.id === 'requeue-all') { requeue(); return; }
  if (e.target.id === 'purge') { purge(); return; }
  const tr = e.target.closest('[data-trash]');
  if (tr) { trash(tr.getAttribute('data-kind'), tr.getAttribute('data-trash')); return; }
  const rs = e.target.closest('[data-restore]');
  if (rs) { restore(rs.getAttribute('data-kind'), rs.getAttribute('data-restore')); return; }
  const sv = e.target.closest('[data-save]');
  if (sv) { saveEdit(sv.getAttribute('data-save')); return; }
  const upb = e.target.closest('[data-upload]');
  if (upb) { uploadManual(upb.getAttribute('data-upload'), upb.hasAttribute('data-force')); return; }
});

/**
 * Send a PDF the person found themselves. The server runs the SAME check
 * it runs on anything the search finds, and says yes or no with reasons.
 * "Forcer" is only offered after a refusal, and the override is recorded.
 */
// No escape sequences in strings on this page: the outer template literal
// eats the backslash. A newline is built, not written.
const NL = String.fromCharCode(10);

async function uploadManual(id, force){
  const box = document.getElementById('up-' + id);
  const inp = box.querySelector('input[type=file]');
  const rep = box.querySelector('.report');
  const f = inp.files && inp.files[0];
  if (!f) { rep.textContent = 'Choisir un fichier PDF d abord.'; rep.className = 'report bad'; return; }
  rep.className = 'report'; rep.textContent = 'Verification en cours (' + Math.round(f.size/1024) + ' Ko)...';
  const q = '?model_id=' + encodeURIComponent(id) + '&name=' + encodeURIComponent(f.name) + (force ? '&force=1' : '');
  const r = await fetch('/api/models/manual' + q, { method: 'POST',
    headers: { 'content-type': 'application/pdf' }, body: f });
  const d = await r.json();
  if (d.accepted) {
    rep.className = 'report good';
    rep.textContent = 'ACCEPTE' + (d.forced ? ' (force)' : '') + ' - ' + fmtReport(d.report) +
      NL + 'Langues lancees : ' + (d.queued||[]).join(', ') + '. Recharger dans deux minutes.';
    box.querySelector('[data-force]').hidden = true;
    setTimeout(load, 2500);
  } else {
    rep.className = 'report bad';
    rep.textContent = 'REFUSE - ' + (d.reasons || [d.error]).join(' / ') +
      (d.report ? NL + fmtReport(d.report) : '');
    if (d.report && !d.report.scan_without_text) box.querySelector('[data-force]').hidden = false;
  }
}
function fmtReport(r){
  if (!r) return '';
  return (r.pages||0) + ' pages, ' + Math.round((r.chars||0)/1000) + 'k car., modele nomme x' +
    (r.model_hits||0) + (r.model_form ? ' (' + r.model_form + ')' : '') + ', ' +
    (r.instruction_phrases||0) + ' phrases d instruction, langues : ' +
    ((r.languages||[]).join(', ') || r.document_language || '?') + '. ' + (r.looks_like||'');
}

function uploadBlock(m){
  if (m.corbeille || m.manual_state === 'sans_objet') return '';
  const label = m.manual_state === 'disponible'
    ? 'Remplacer le PDF du mode d emploi' : 'Joindre le PDF du mode d emploi';
  return '<details class="up" id="up-' + esc(m.model_id) + '"><summary>' + label + '</summary>' +
    '<input type="file" accept="application/pdf,.pdf">' +
    '<div class="acts"><button data-upload="' + esc(m.model_id) + '">Verifier et joindre</button>' +
    '<button class="danger" data-upload="' + esc(m.model_id) + '" data-force hidden>Forcer l acceptation</button></div>' +
    '<div class="report"></div></details>';
}

const post = (url, body) => fetch(url, { method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body || {}) }).then(r => r.json());

async function trash(kind, id){ await post('/api/trash', { kind, id }); load(); }
async function restore(kind, id){ await post('/api/restore', { kind, id }); load(); }

async function purge(){
  const n = document.querySelectorAll('.card.gone').length;
  const box = document.getElementById('counts');
  // Two deliberate steps, and the second one names what it will remove.
  if (!window.__armed) {
    window.__armed = true;
    box.textContent = 'Cliquer encore sur "Vider la corbeille" pour supprimer definitivement.';
    setTimeout(() => { window.__armed = false; }, 8000);
    return;
  }
  window.__armed = false;
  const d = await post('/api/purge');
  box.textContent = 'Supprime : ' + (d.purged?.models||0) + ' modele(s), ' +
                    (d.purged?.units||0) + ' exemplaire(s).';
  load();
}

async function saveEdit(id){
  const box = document.getElementById('edit-' + id);
  const val = n => box.querySelector('[name=' + n + ']').value.trim();
  const d = await post('/api/models/edit', {
    model_id: id, brand: val('brand'), model_number: val('mnum'),
    type: val('type').toUpperCase(), name: val('name'),
    requeue: box.querySelector('[name=rq]').checked });
  const w = box.querySelector('.warn');
  if (d.error) { w.textContent = d.error; return; }
  w.textContent = (d.warnings || []).join(' | ') ||
    ('Enregistre' + (d.requeued ? ' et relance.' : '.'));
  setTimeout(load, 1200);
}

async function requeue(id){
  const q = id ? ('?model_id=' + encodeURIComponent(id)) : '';
  const r = await fetch('/api/requeue' + q, { method: 'POST' });
  const d = await r.json();
  document.getElementById('counts').textContent =
    (d.queued || 0) + ' modèle(s) relancé(s) — recharger dans une minute';
  setTimeout(load, 1500);
}

/**
 * Why was no manual accepted?
 *
 * Collapsed by default — it is long, and most of the time nobody needs it.
 * Open it and every candidate is there with its score, and every document
 * actually fetched is there with the reason it was refused.
 */
// No regex literal here on purpose: a backslash inside the page's outer
// template literal is consumed before the browser ever sees it, which is
// what broke this file twice.
function shortUrl(u){
  let x = String(u || '');
  if (x.indexOf('https://') === 0) x = x.slice(8);
  else if (x.indexOf('http://') === 0) x = x.slice(7);
  return x.length > 64 ? x.slice(0, 64) + '...' : x;
}

function actionRow(m){
  if (m.corbeille)
    return '<div class="acts"><button data-restore="' + esc(m.model_id) +
      '" data-kind="model">Restaurer</button></div>';
  return '<div class="acts">' +
    (m.manual_state === 'sans_objet' ? '' :
      '<button data-requeue="' + esc(m.model_id) + '">Relancer l IA</button>') +
    '<button class="danger" data-trash="' + esc(m.model_id) +
      '" data-kind="model">Mettre a la corbeille</button></div>';
}

/** Inline edit — the repair for a mistyped model number (no re-photographing). */
function editBlock(m){
  if (m.corbeille) return '';
  const f = (n, label, v) => '<div><label>' + label + '</label>' +
    '<input name="' + n + '" value="' + esc(v || '') + '"></div>';
  return '<details class="edit" id="edit-' + esc(m.model_id) + '">' +
    '<summary>Corriger</summary><div class="grid">' +
    f('brand', 'Marque', m.brand) +
    f('mnum', 'Numero de modele', m.model_number_raw || m.model_number) +
    f('type', 'Type', m.type) +
    f('name', 'Nom', m.names.fr) +
    '</div>' +
    '<label style="margin-top:8px;display:block"><input type="checkbox" name="rq" checked ' +
    'style="width:auto"> relancer l IA apres correction</label>' +
    '<div class="acts"><button data-save="' + esc(m.model_id) + '">Enregistrer</button></div>' +
    '<div class="warn"></div></details>';
}

function whyBlock(m){
  let w = null;
  try { w = JSON.parse(m.ia_meta || 'null'); } catch(e) { return ''; }
  if (!w || !w.tried) return '';
  const rows = w.tried.map(t => {
    const bits = [];
    if (t.pages != null) bits.push(t.pages + ' p.');
    if (t.chars != null) bits.push(Math.round(t.chars/1000) + 'k car.');
    if (t.model_hits != null) bits.push('modele x' + t.model_hits);
    if (t.instruction_phrases != null) bits.push(t.instruction_phrases + ' phrases d instruction');
    if (t.status != null) bits.push('HTTP ' + t.status);
    return '<tr><td>' + esc(t.stage) + '</td>' +
      '<td><code>' + esc(shortUrl(t.url)) + '</code></td>' +
      '<td>' + esc(t.verdict || '-') + '</td>' +
      '<td>' + esc((t.reasons||[]).join('; ')) + '<br><span class="muted">' +
      esc(bits.join(' - ')) + '</span></td></tr>';
  }).join('');
  const cands = w.considered.map(c =>
    '<tr><td>' + c.score + '</td><td><code>' +
    esc(shortUrl(c.url)) + '</code></td>' +
    '<td colspan="2">' + esc((c.reasons||[]).join('; ')) + '</td></tr>').join('');
  return '<details class="why"><summary>Pourquoi aucun mode d emploi ? (' +
    w.tried.length + ' document(s) essaye(s))</summary>' +
    '<div class="wrap"><table>' +
    '<tr><th colspan="4">Documents telecharges et examines</th></tr>' +
    '<tr><th>etape</th><th>url</th><th>verdict</th><th>raison</th></tr>' + rows +
    '<tr><th colspan="4">Candidats classes (non telecharges)</th></tr>' + cands +
    '</table></div></details>';
}

async function load(){
  const out = document.getElementById('out');
  const r = await fetch('/api/inspect');
  if (r.status === 401){
    out.innerHTML = '<p class="empty">Session expirée. ' +
      '<a href="/capture">Se reconnecter</a>, puis revenir ici.</p>';
    document.getElementById('counts').textContent = '';
    return;
  }
  const d = await r.json();
  document.getElementById('counts').textContent =
    d.counts.models + ' modele(s) - ' + d.counts.units + ' exemplaire(s)' +
    (d.counts.corbeille ? ' - ' + d.counts.corbeille + ' dans la corbeille' : '');

  const byModel = {};
  for (const u of d.units) (byModel[u.model_id] ||= []).push(u);
  const stockBy = {};
  for (const s of d.stock) stockBy[s.model_id] = s;

  let h = '<h2>Modèles</h2>';
  if (!d.models.length) h += '<p class="empty">Rien de saisi pour l\\'instant.</p>';
  for (const m of d.models){
    const us = byModel[m.model_id] || [];
    const st = stockBy[m.model_id];
    h += '<div class="card' + (m.corbeille ? ' gone' : '') + '">' +
      '<div class="thumbs">' + img(m.photo, m.model_id) +
        (m.photo_plaque ? img(m.photo_plaque, 'plaque') : '') + '</div>' +
      '<div class="body">' +
        '<div class="idline">' + esc(m.names.fr || m.type) +
          ' <small>' + esc(m.model_id) + ' · ' + esc(m.type) + '</small></div>' +
        '<div class="meta">' +
          (m.brand ? esc(m.brand) + ' ' : '') + '<code>' + esc(m.model_number || '—') + '</code>' +
          (m.model_number_raw && m.model_number_raw !== m.model_number
            ? ' <span title="saisi">(saisi : ' + esc(m.model_number_raw) + ')</span>' : '') +
          ' · ' + esc(m.category) +
          ' · ' + esc(m.created_by) + ' le ' + esc((m.created_at||'').slice(0,16).replace('T',' ')) +
        '</div>' +
        tagsFor(m) +
        editBlock(m) +
        uploadBlock(m) +
        actionRow(m) +
        (us.length ? '<div class="units">Exemplaires : ' +
           us.map(u => '<span' + (u.corbeille ? ' style="text-decoration:line-through;opacity:.6"' : '') +
             '>' + esc(u.unit_id) + (u.emplacement ? ' - ' + esc(u.emplacement) : '') +
             (m.corbeille ? '' :
               ' <button class="mini" data-' + (u.corbeille ? 'restore' : 'trash') + '="' +
               esc(u.unit_id) + '" data-kind="unit">' + (u.corbeille ? 'x' : 'annuler') +
               '</button>') + '</span>').join('') + '</div>' : '') +
        (st ? '<div class="units">Stock : <code>' + esc(st.quantites) + '</code> ' +
              esc(st.unite_mesure) + '</div>' : '') +
        whyBlock(m) +
      '</div></div>';
  }

  h += '<h2>Journal</h2><div class="wrap"><table><tr>' +
       '<th>quand</th><th>modèle</th><th>étape</th><th>détail</th></tr>' +
       d.journal.map(j => '<tr><td>' + esc((j.at||'').slice(0,19).replace('T',' ')) +
         '</td><td><code>' + esc(j.model_id) + '</code></td><td>' + esc(j.etape) +
         '</td><td><code>' + esc(j.detail) + '</code></td></tr>').join('') +
       '</table></div>';

  out.innerHTML = h;
}
load();
</script>
</html>`;
}
