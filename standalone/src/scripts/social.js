/* ============================================================
   social.js - the copy dossier's filters, copy buttons and editor.

   The page at /social is complete before this runs: every line is rendered
   server-side from src/data/pages/social.json. This file only ever overlays what
   has been changed since - it fetches the overrides, applies them, and posts edits
   back to /api/social. If the fetch fails, the committed copy is what stays on
   screen, which is the right fallback.
   ============================================================ */

// ---- overrides -------------------------------------------------------
// The page is already correct when this runs; everything here is an overlay.
const lines = Array.from(document.querySelectorAll('.txt'));
// A caption or CTA belongs to several sets, so one id addresses several elements.
// Everything below works on the group, or an edit would appear in one set and not
// the others, and a save would carry whichever copy the map happened to keep.
const byId = new Map();
for (const el of lines) {
  const group = byId.get(el.dataset.lineId);
  if (group) group.push(el);
  else byId.set(el.dataset.lineId, [el]);
}
const status = document.getElementById('status');
const saveBtn = document.getElementById('save');
const editToggle = document.getElementById('editToggle');

const say = (msg, tone) => {
  status.textContent = msg || '';
  status.dataset.tone = tone || '';
};

function markEdited(id, edited) {
  for (const el of byId.get(id) ?? []) {
    const flag = el.parentElement.querySelector('.editflag');
    if (flag) flag.hidden = !edited;
    el.dataset.edited = edited ? '1' : '';
  }
}

/** Put the same text into every copy of a line, so the sets never disagree. */
function setText(id, text) {
  for (const el of byId.get(id) ?? []) el.textContent = text;
}

function applyOverrides(map) {
  for (const [id, text] of Object.entries(map || {})) {
    if (!byId.has(id)) continue;
    setText(id, text);
    markEdited(id, true);
  }
}

fetch('/api/social')
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => data && applyOverrides(data.overrides))
  .catch(() => {
    /* The repo version is already on screen; a failed fetch changes nothing. */
  });

// ---- copy ------------------------------------------------------------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy');
  if (!btn) return;
  const wrap = btn.closest('.v');
  const text = wrap.querySelector('.txt').textContent.trim();
  const done = () => {
    btn.classList.add('done');
    btn.textContent = 'Copied';
    setTimeout(() => {
      btn.classList.remove('done');
      btn.textContent = 'Copy';
    }, 1400);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
  } else {
    fallback(text, done);
  }
});

function fallback(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    done();
  } catch (err) {
    /* nothing to do - the text is still selectable on the page */
  }
  document.body.removeChild(ta);
}

// ---- edit mode -------------------------------------------------------
let editing = false;

editToggle.addEventListener('click', () => {
  editing = !editing;
  document.body.dataset.edit = editing ? 'on' : '';
  editToggle.setAttribute('aria-pressed', String(editing));
  editToggle.textContent = editing ? 'Done' : 'Edit';
  saveBtn.hidden = !editing;
  lines.forEach((el) => {
    el.contentEditable = editing ? 'plaintext-only' : 'false';
    if (el.contentEditable !== 'plaintext-only' && editing) el.contentEditable = 'true';
  });
  say(editing ? 'Click any line to change it.' : '');
});

const dirty = () =>
  lines.filter((el) => el.textContent.trim() !== (el.dataset.current ?? el.dataset.seed).trim());

document.addEventListener('input', (e) => {
  if (!e.target.classList || !e.target.classList.contains('txt')) return;
  for (const el of byId.get(e.target.dataset.lineId) ?? []) {
    if (el !== e.target) el.textContent = e.target.textContent;
  }
  // A shared caption is one changed line however many sets show it.
  const n = new Set(dirty().map((el) => el.dataset.lineId)).size;
  saveBtn.textContent = n ? `Save (${n})` : 'Save';
});

saveBtn.addEventListener('click', async () => {
  const edits = [
    ...new Map(dirty().map((el) => [el.dataset.lineId, el.textContent.trim()])),
  ].map(([id, text]) => ({ id, text }));
  if (!edits.length) return say('Nothing changed.', '');
  saveBtn.disabled = true;
  say('Saving…', '');
  try {
    const res = await fetch('/api/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'save', edits }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'save failed');
    edits.forEach(({ id, text }) => {
      const copies = byId.get(id) ?? [];
      for (const el of copies) el.dataset.current = text;
      markEdited(id, text.trim() !== copies[0].dataset.seed.trim());
    });
    saveBtn.textContent = 'Save';
    say(`Saved ${edits.length} line${edits.length === 1 ? '' : 's'}.`, 'ok');
  } catch (err) {
    say('Save failed - your text is still on screen. Copy it before reloading.', 'bad');
  } finally {
    saveBtn.disabled = false;
  }
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.revert');
  if (!btn) return;
  const id = btn.dataset.revert;
  say('Reverting…', '');
  try {
    const res = await fetch('/api/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'revert', ids: [id] }),
    });
    if (!res.ok) throw new Error();
    const seed = byId.get(id)[0].dataset.seed;
    setText(id, seed);
    for (const copy of byId.get(id)) delete copy.dataset.current;
    markEdited(id, false);
    say('Reverted to the repo version.', 'ok');
  } catch (err) {
    say('Revert failed.', 'bad');
  }
});

// ---- filter and search ----------------------------------------------
const kinds = document.getElementById('kinds');
const search = document.getElementById('search');
const counter = document.getElementById('count');
const entries = Array.from(document.querySelectorAll('.line'));
const groups = Array.from(document.querySelectorAll('.grouphead'));
const copySections = Array.from(document.querySelectorAll('section[data-kind]'));
const refSections = Array.from(document.querySelectorAll('section.reference'));

let kind = 'all';

entries.forEach((el) => {
  el._kind = el.closest('section[data-kind]').dataset.kind;
});

function apply() {
  const q = search.value.trim().toLowerCase();
  let shown = 0;

  entries.forEach((el) => {
    const ok =
      (kind === 'all' || kind.split(',').includes(el._kind)) &&
      (!q || el.textContent.toLowerCase().includes(q));
    el.hidden = !ok;
    if (ok) shown += 1;
  });

  groups.forEach((g) => {
    const sib = g.nextElementSibling;
    g.hidden = !(sib && Array.from(sib.children).some((c) => !c.hidden));
  });

  copySections.forEach((s) => {
    s.hidden = !Array.from(s.querySelectorAll('.line')).some((c) => !c.hidden);
  });

  const filtering = kind !== 'all' || Boolean(q);
  refSections.forEach((s) => (s.hidden = filtering));

  counter.textContent = shown + (shown === 1 ? ' entry' : ' entries');
}

function chipset(host, onPick) {
  host.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    Array.from(host.querySelectorAll('.chip')).forEach((c) =>
      c.setAttribute('aria-pressed', String(c === b)),
    );
    onPick(b);
    apply();
  });
}

chipset(kinds, (b) => (kind = b.dataset.filter));
search.addEventListener('input', apply);
apply();
