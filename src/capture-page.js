export const capturePage = () => `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1b4d8f">
<title>Inventaire — saisie</title>
<style>
:root{--bg:#f4f5f7;--panel:#fff;--ink:#16191d;--ink2:#4a5159;--line:#d9dde2;
 --accent:#1b4d8f;--accent-soft:#e8f0fa;--ok:#1a6b3c;--ok-soft:#e4f3ea;
 --warn:#8a5a00;--warn-soft:#fdf1d8;--bad:#a52121;--bad-soft:#fbe9e9;--r:14px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font:400 17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
 padding-bottom:env(safe-area-inset-bottom)}
.wrap{max-width:640px;margin:0 auto;padding:0 16px 40px}
header{background:var(--accent);color:#fff;padding:14px 16px;
 padding-top:calc(14px + env(safe-area-inset-top));display:flex;align-items:center;gap:12px}
header b{font-size:18px} header .sp{margin-inline-start:auto;font-size:14px;opacity:.85}
label{display:block;font-weight:650;font-size:15px;margin:18px 0 6px}
label .opt{font-weight:400;color:var(--ink2)}
input,select,textarea{width:100%;font:inherit;font-size:17px;padding:14px;
 border:2px solid var(--line);border-radius:12px;background:#fff;min-height:52px}
input:focus,select:focus,textarea:focus{outline:0;border-color:var(--accent)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);
 padding:18px;margin-top:16px}
button{font:inherit;font-weight:650;font-size:17px;border:0;border-radius:12px;
 padding:15px 20px;min-height:54px;cursor:pointer}
.primary{background:var(--accent);color:#fff;width:100%}
.primary:disabled{opacity:.5}
.ghost{background:#fff;border:2px solid var(--line);color:var(--ink)}
.row{display:flex;gap:10px}.row>*{flex:1}
.shots{display:flex;gap:12px;margin-top:8px}
.shot{flex:1;aspect-ratio:4/3;border:2px dashed var(--line);border-radius:12px;
 background:#fff center/cover no-repeat;display:grid;place-items:center;
 text-align:center;font-size:14px;color:var(--ink2);cursor:pointer;padding:8px;position:relative}
.shot.has{border-style:solid;border-color:var(--ok)}
.shot .tag{position:absolute;inset-inline-start:6px;top:6px;background:#000a;color:#fff;
 font-size:12px;padding:2px 7px;border-radius:6px}
.check{display:flex;gap:12px;align-items:flex-start;background:var(--warn-soft);
 border-radius:12px;padding:14px;margin-top:16px;cursor:pointer}
.check input{width:24px;height:24px;min-height:0;flex:none;margin-top:2px}
.check span{font-size:16px;font-weight:600;color:var(--warn)}
.hint{font-size:14px;color:var(--ink2);margin-top:6px}
.known{background:var(--ok-soft);color:var(--ok);border-radius:12px;padding:14px;
 margin-top:10px;font-weight:600;display:none}
.known.show{display:block}
.msg{padding:14px;border-radius:12px;margin-top:16px;font-weight:600;display:none}
.msg.show{display:block}
.msg.ok{background:var(--ok-soft);color:var(--ok)}
.msg.err{background:var(--bad-soft);color:var(--bad)}
.recent{margin-top:26px}
.recent h3{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink2)}
.ritem{background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;
 margin-bottom:8px;display:flex;gap:10px;align-items:center;font-size:15px}
.ritem .id{font:600 15px ui-monospace,Menlo,Consolas,monospace}
.pill{font-size:12px;font-weight:650;padding:2px 8px;border-radius:6px;margin-inline-start:auto}
.p-ok{background:var(--ok-soft);color:var(--ok)}
.p-wait{background:var(--warn-soft);color:var(--warn)}
.p-none{background:#eceff3;color:var(--ink2)}
.queued{background:var(--warn-soft);color:var(--warn);padding:10px 14px;border-radius:10px;
 font-size:15px;font-weight:600;margin-top:12px;display:none}
.queued.show{display:block}
</style></head><body>

<header><b>Inventaire</b><span class="sp" id="who"></span></header>
<div class="wrap">

<div id="login" class="card">
  <label for="pw">Mot de passe</label>
  <input id="pw" type="password" autocomplete="current-password" enterkeyhint="go">
  <label for="nm">Votre prénom <span class="opt">— pour savoir qui a saisi quoi</span></label>
  <input id="nm" type="text" autocomplete="given-name">
  <div style="height:16px"></div>
  <button class="primary" id="go">Entrer</button>
  <div class="msg err" id="loginerr"></div>
</div>

<div id="app" hidden>
  <div class="queued" id="pending"></div>

  <div class="card">
    <label for="type">Type <span class="opt">— majuscules, sans accent</span></label>
    <input id="type" list="types" placeholder="MEULEUSE" autocapitalize="characters" enterkeyhint="next">
    <datalist id="types"></datalist>
    <div class="hint" id="nextid">Le numéro est attribué par le serveur à l'envoi.</div>

    <label>Photos</label>
    <div class="shots">
      <div class="shot" id="s1"><span class="tag">1</span><span>Photo de l'appareil</span>
        <input type="file" accept="image/*" capture="environment" hidden></div>
      <div class="shot" id="s2"><span class="tag">2</span><span>Plaque signalétique</span>
        <input type="file" accept="image/*" capture="environment" hidden></div>
    </div>
    <div class="hint">La plaque permet de refaire le mode d'emploi plus tard sans revenir à la machine.</div>

    <label class="check" for="nomanual">
      <input type="checkbox" id="nomanual">
      <span>Pas besoin de mode d'emploi<br>
        <span style="font-weight:400;font-size:14px">Brosse, marteau, outil à main… Terminé, plus rien à faire.</span></span>
    </label>

    <div id="mfields">
      <label for="brand">Marque</label>
      <input id="brand" placeholder="Makita" enterkeyhint="next">
      <label for="mnum">Numéro de modèle <span class="opt">— exactement comme sur l'autocollant</span></label>
      <input id="mnum" placeholder="GA5030R" autocapitalize="characters" enterkeyhint="next">
      <div class="known" id="known"></div>
    </div>

    <label for="name">Nom <span class="opt">— optionnel</span></label>
    <input id="name" placeholder="Meuleuse d'angle 125 mm">

    <label for="cat">Catégorie</label>
    <select id="cat"></select>

    <label for="emp">Emplacement <span class="opt">— optionnel</span></label>
    <select id="emp"><option value="">—</option></select>

    <label class="check" for="danger" style="background:var(--bad-soft)">
      <input type="checkbox" id="danger">
      <span style="color:var(--bad)">Machine dangereuse<br>
        <span style="font-weight:400;font-size:14px">Un collègue de l'atelier devra valider avant publication.</span></span>
    </label>

    <div style="height:20px"></div>
    <button class="primary" id="save">Enregistrer</button>
    <div class="msg" id="msg"></div>
  </div>

  <div class="recent"><h3>Derniers ajouts</h3><div id="rlist"></div></div>
</div>
</div>

<script>
const $ = s => document.querySelector(s);
let WHO = localStorage.getItem('inv_who') || '';
let LISTS = null;
const shots = { photo: null, photo_plaque: null };

/* ---------- photo: compress on the phone, not on the network ---------- */
async function compress(file, max = 1600, quality = 0.72) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const cv = new OffscreenCanvas(w, h);
  cv.getContext('2d').drawImage(img, 0, 0, w, h);
  return await cv.convertToBlob({ type: 'image/jpeg', quality });
}

function wireShot(el, field) {
  const input = el.querySelector('input');
  el.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const f = input.files[0]; if (!f) return;
    el.textContent = '…'; 
    try {
      const blob = await compress(f);
      shots[field] = blob;
      el.style.backgroundImage = 'url(' + URL.createObjectURL(blob) + ')';
      el.classList.add('has'); el.textContent = '';
      const tag = document.createElement('span');
      tag.className = 'tag'; tag.textContent = Math.round(blob.size/1024) + ' Ko';
      el.appendChild(tag);
    } catch (e) { el.textContent = 'échec'; }
  });
}

/* ---------- offline queue: a workshop is where wifi dies ---------- */
const PENDING = 'inv_pending';
const getPending = () => JSON.parse(localStorage.getItem(PENDING) || '[]');
const setPending = v => localStorage.setItem(PENDING, JSON.stringify(v));
function showPending() {
  const n = getPending().length;
  const el = $('#pending');
  el.classList.toggle('show', n > 0);
  el.textContent = n ? \`\${n} saisie(s) en attente d'envoi — elles partiront dès le retour du réseau.\` : '';
}
async function flushPending() {
  const q = getPending(); if (!q.length) return;
  const left = [];
  for (const job of q) {
    try {
      const r = await fetch('/api/items', { method:'POST',
        headers:{'content-type':'application/json'}, body: JSON.stringify(job) });
      if (!r.ok) left.push(job);
    } catch { left.push(job); }
  }
  setPending(left); showPending(); loadRecent();
}
addEventListener('online', flushPending);

/* ---------- boot ---------- */
async function boot() {
  const r = await fetch('/api/lists');
  if (r.status === 401) return;
  LISTS = await r.json();
  $('#login').hidden = true; $('#app').hidden = false;
  $('#who').textContent = WHO;
  $('#cat').innerHTML = LISTS.categories
    .map(c => \`<option value="\${c.id}">\${c.icone||''} \${c.noms.fr}</option>\`).join('');
  $('#emp').innerHTML = '<option value="">—</option>' + LISTS.emplacements
    .map(e => \`<option value="\${e.id}">\${e.noms.fr}</option>\`).join('');
  $('#types').innerHTML = LISTS.types.map(t => \`<option value="\${t}">\`).join('');
  showPending(); flushPending(); loadRecent();
}

$('#go').addEventListener('click', async () => {
  const pw = $('#pw').value, nm = $('#nm').value.trim();
  if (!nm) { $('#loginerr').textContent = 'Votre prénom, s\\'il vous plaît.';
             $('#loginerr').classList.add('show'); return; }
  const r = await fetch('/api/login', { method:'POST',
    headers:{'content-type':'application/json'},
    body: JSON.stringify({ password: pw, who: nm }) });
  if (!r.ok) { $('#loginerr').textContent = 'Mot de passe incorrect.';
               $('#loginerr').classList.add('show'); return; }
  WHO = nm; localStorage.setItem('inv_who', nm); boot();
});
$('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#go').click(); });

/* ---------- the "no manual" fast path hides the AI fields ---------- */
$('#nomanual').addEventListener('change', e => {
  $('#mfields').style.display = e.target.checked ? 'none' : '';
});

/* ---------- known model? don't pay for the AI twice ---------- */
let lookupTimer;
function scheduleLookup() {
  clearTimeout(lookupTimer);
  lookupTimer = setTimeout(async () => {
    const brand = $('#brand').value.trim(), mnum = $('#mnum').value.trim();
    const box = $('#known');
    if (!brand || !mnum) { box.classList.remove('show'); return; }
    try {
      const r = await fetch('/api/models/lookup', { method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ brand, model_number: mnum }) });
      const d = await r.json();
      if (d.found) {
        box.textContent = \`Déjà connu : \${d.model.names.fr || d.model.model_id} — \` +
          \`\${d.model.unit_count} exemplaire(s). Pas de nouvelle recherche IA.\`;
        box.classList.add('show');
        if (!$('#type').value) $('#type').value = d.model.type;
      } else box.classList.remove('show');
    } catch {}
  }, 400);
}
$('#brand').addEventListener('input', scheduleLookup);
$('#mnum').addEventListener('input', scheduleLookup);

/* ---------- save ---------- */
$('#save').addEventListener('click', async () => {
  const btn = $('#save'), msg = $('#msg');
  msg.className = 'msg';
  const body = {
    type: $('#type').value.trim().toUpperCase(),
    brand: $('#brand').value.trim() || null,
    model_number: $('#mnum').value.trim() || null,
    name: $('#name').value.trim() || null,
    category: $('#cat').value,
    emplacement: $('#emp').value || null,
    sans_manuel: $('#nomanual').checked,
    danger_eleve: $('#danger').checked,
    suivi: 'unites',
  };
  if (!body.type) { msg.textContent = 'Le type est obligatoire.';
                    msg.className = 'msg err show'; return; }

  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    for (const [field, blob] of Object.entries(shots)) {
      if (!blob) continue;
      const r = await fetch('/api/photos?kind=' + field, { method:'POST', body: blob });
      if (!r.ok) throw new Error('photo');
      body[field] = (await r.json()).key;
    }
    const r = await fetch('/api/items', { method:'POST',
      headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error((d.errors || ['erreur']).join(' · '));
    msg.textContent = \`Enregistré : \${d.unit_id || d.model_id}\` +
      (d.queued ? ' — recherche du mode d\\'emploi lancée.'
                : d.created_model ? '' : ' — modèle déjà connu.');
    msg.className = 'msg ok show';
    resetForm();
  } catch (e) {
    // Offline or failed: keep the entry rather than lose the walk to the machine.
    if (!navigator.onLine) {
      const q = getPending(); q.push(body); setPending(q); showPending();
      msg.textContent = 'Hors ligne — saisie gardée, elle partira au retour du réseau.';
      msg.className = 'msg ok show'; resetForm();
    } else {
      msg.textContent = 'Échec : ' + e.message;
      msg.className = 'msg err show';
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Enregistrer'; loadRecent();
  }
});

function resetForm() {
  for (const id of ['brand','mnum','name']) $('#' + id).value = '';
  $('#danger').checked = false; $('#known').classList.remove('show');
  shots.photo = shots.photo_plaque = null;
  for (const [el, t] of [[$('#s1'),"Photo de l'appareil"],[$('#s2'),'Plaque signalétique']]) {
    el.style.backgroundImage = ''; el.classList.remove('has');
    el.innerHTML = '<span class="tag">' + (el.id === 's1' ? '1' : '2') + '</span><span>' + t +
      '</span><input type="file" accept="image/*" capture="environment" hidden>';
    wireShot(el, el.id === 's1' ? 'photo' : 'photo_plaque');
  }
  // type and category deliberately kept: you photograph in batches
}

async function loadRecent() {
  try {
    const r = await fetch('/api/recent'); if (!r.ok) return;
    const d = await r.json();
    $('#rlist').innerHTML = d.items.map(i => {
      const cls = i.manual_state === 'disponible' ? 'p-ok'
                : i.manual_state === 'sans_objet' ? 'p-none' : 'p-wait';
      const lbl = i.manual_state === 'disponible' ? 'guide'
                : i.manual_state === 'sans_objet' ? '—'
                : i.ia_etat === 'pending' ? 'en cours' : 'à rédiger';
      return \`<div class="ritem"><span class="id">\${i.unit_id}</span>
        <span>\${i.names.fr || [i.brand,i.model_number].filter(Boolean).join(' ')}</span>
        <span class="pill \${cls}">\${lbl}</span></div>\`;
    }).join('') || '<div class="hint">Rien pour le moment.</div>';
  } catch {}
}

wireShot($('#s1'), 'photo'); wireShot($('#s2'), 'photo_plaque');
$('#nm').value = WHO;
boot();
</script></body></html>`;
