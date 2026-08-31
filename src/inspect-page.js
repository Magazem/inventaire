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
</style>
<header>
  <h1>Inventaire — contrôle</h1>
  <span class="counts" id="counts">chargement…</span>
  <span style="flex:1"></span>
  <button onclick="load()">Rafraîchir</button>
  <button onclick="requeue()">Relancer tout ce qui attend</button>
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

async function requeue(id){
  const q = id ? ('?model_id=' + encodeURIComponent(id)) : '';
  const r = await fetch('/api/requeue' + q, { method: 'POST' });
  const d = await r.json();
  document.getElementById('counts').textContent =
    (d.queued || 0) + ' modèle(s) relancé(s) — recharger dans une minute';
  setTimeout(load, 1500);
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
    d.counts.models + ' modèle(s) · ' + d.counts.units + ' exemplaire(s)';

  const byModel = {};
  for (const u of d.units) (byModel[u.model_id] ||= []).push(u);
  const stockBy = {};
  for (const s of d.stock) stockBy[s.model_id] = s;

  let h = '<h2>Modèles</h2>';
  if (!d.models.length) h += '<p class="empty">Rien de saisi pour l\\'instant.</p>';
  for (const m of d.models){
    const us = byModel[m.model_id] || [];
    const st = stockBy[m.model_id];
    h += '<div class="card">' +
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
        (m.manual_state === 'sans_objet' ? '' :
          '<div class="tags"><button class="mini" onclick="requeue(\'' +
          esc(m.model_id) + '\')">Relancer l\'IA pour ce modèle</button></div>') +
        (us.length ? '<div class="units">Exemplaires : ' +
           us.map(u => '<span>' + esc(u.unit_id) + (u.emplacement ? ' · ' + esc(u.emplacement) : '') +
                       '</span>').join('') + '</div>' : '') +
        (st ? '<div class="units">Stock : <code>' + esc(st.quantites) + '</code> ' +
              esc(st.unite_mesure) + '</div>' : '') +
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
