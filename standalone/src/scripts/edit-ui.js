/* ============================================================
   edit-ui.js — the inline copy editor at /edit/.

   Drives the page in the frame: marks every element carrying a data-line-id,
   makes one editable on click, tracks what changed, and posts the set to
   /api/edit, which commits it to the repo.

   The frame is same-origin (the shop and this page are on one host), so the
   editor reaches into its document directly rather than messaging it.

   Edits survive switching pages: they are held here, keyed by the field
   address, until they are saved or discarded. A field edited back to what it
   said originally stops counting as a change.
   ============================================================ */

const frame = document.querySelector('[data-frame]');
const picker = document.querySelector('[data-page-picker]');
const countEl = document.querySelector('[data-count]');
const saveBtn = document.querySelector('[data-save]');
const discardBtn = document.querySelector('[data-discard]');
const statusEl = document.querySelector('[data-status]');

/** address -> { text, original } for everything touched this session. */
const edits = new Map();

/* Injected into the frame so editable text is findable and obviously editable.
   Scoped to [data-line-id] so it cannot affect anything else. */
const FRAME_CSS = `
  [data-line-id] {
    outline: 1px dashed rgba(255, 0, 0, 0.35);
    outline-offset: 3px;
    cursor: text;
    transition: outline-color 120ms ease, background-color 120ms ease;
  }
  [data-line-id]:hover { outline-color: rgba(255, 0, 0, 0.9); }
  [data-line-id][data-editing] {
    outline: 2px solid #f00;
    background: rgba(255, 0, 0, 0.06);
  }
  [data-line-id][data-dirty] { outline-color: #9fe08f; }
  @media (prefers-reduced-motion: reduce) { [data-line-id] { transition: none; } }
`;

function setStatus(kind, html) {
  if (!kind) {
    statusEl.hidden = true;
    statusEl.textContent = '';
    return;
  }
  statusEl.hidden = false;
  statusEl.setAttribute('data-kind', kind);
  statusEl.innerHTML = html;
}

function dirtyCount() {
  let n = 0;
  edits.forEach((entry) => {
    if (entry.text !== entry.original) n += 1;
  });
  return n;
}

function refreshBar() {
  const n = dirtyCount();
  countEl.textContent = n === 0 ? 'NO CHANGES' : n === 1 ? '1 CHANGE' : `${n} CHANGES`;
  if (n > 0) countEl.setAttribute('data-dirty', '');
  else countEl.removeAttribute('data-dirty');
  saveBtn.disabled = n === 0;
  discardBtn.disabled = n === 0;
}

/** Apply anything already edited to the page now showing in the frame. */
function paintFrame(doc) {
  doc.querySelectorAll('[data-line-id]').forEach((el) => {
    const id = el.getAttribute('data-line-id');
    const entry = edits.get(id);
    if (!entry) return;
    if (el.textContent !== entry.text) el.textContent = entry.text;
    if (entry.text !== entry.original) el.setAttribute('data-dirty', '');
    else el.removeAttribute('data-dirty');
  });
}

function beginEditing(el) {
  const id = el.getAttribute('data-line-id');
  if (!id || el.isContentEditable) return;

  if (!edits.has(id)) edits.set(id, { text: el.textContent, original: el.textContent });

  el.setAttribute('data-editing', '');
  el.setAttribute('contenteditable', 'plaintext-only');
  el.focus();

  const finish = (keep) => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-editing');
    const entry = edits.get(id);
    if (keep) {
      entry.text = el.textContent.replace(/\s+/g, ' ').trim();
      el.textContent = entry.text;
    } else {
      el.textContent = entry.text;
    }
    if (entry.text !== entry.original) el.setAttribute('data-dirty', '');
    else el.removeAttribute('data-dirty');
    refreshBar();
  };

  el.addEventListener('blur', () => finish(true), { once: true });
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      el.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      // Put the field back to whatever it said before this click.
      el.textContent = edits.get(id).text;
      el.blur();
    }
  });
}

function wireFrame() {
  let doc;
  try {
    doc = frame.contentDocument;
  } catch (error) {
    setStatus('bad', 'Cannot reach the preview frame.');
    return;
  }
  if (!doc) return;

  const style = doc.createElement('style');
  style.textContent = FRAME_CSS;
  doc.head.appendChild(style);

  // Links would navigate away from the editor; inside the frame they are inert.
  doc.addEventListener('click', (event) => {
    const editable = event.target.closest('[data-line-id]');
    if (editable) {
      event.preventDefault();
      beginEditing(editable);
      return;
    }
    const link = event.target.closest('a[href]');
    if (link) event.preventDefault();
  });

  paintFrame(doc);

  const n = doc.querySelectorAll('[data-line-id]').length;
  setStatus(n ? null : 'bad', n ? '' : 'No editable text found on this page.');
}

frame.addEventListener('load', wireFrame);

picker.addEventListener('change', () => {
  setStatus(null);
  frame.src = picker.value;
});

discardBtn.addEventListener('click', () => {
  edits.clear();
  setStatus(null);
  refreshBar();
  frame.contentWindow.location.reload();
});

saveBtn.addEventListener('click', async () => {
  const payload = [];
  edits.forEach((entry, id) => {
    if (entry.text !== entry.original) payload.push({ id, text: entry.text });
  });
  if (!payload.length) return;

  saveBtn.disabled = true;
  discardBtn.disabled = true;
  setStatus('busy', `Committing ${payload.length} change${payload.length === 1 ? '' : 's'}…`);

  try {
    const res = await fetch('/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'save', edits: payload }),
    });
    const body = await res.json();

    if (!res.ok) {
      setStatus('bad', escapeHtml(body.error || `Save failed (${res.status}).`));
      refreshBar();
      return;
    }

    if (!body.committed) {
      setStatus('ok', 'Nothing differed from what the repo already says.');
      edits.clear();
      refreshBar();
      return;
    }

    // Saved. The rebuild is a GitHub Action, so the live page follows in about a
    // minute - say so rather than letting someone refresh and think it failed.
    setStatus(
      'ok',
      `Committed <a href="${escapeHtml(body.url)}" target="_blank" rel="noopener">${escapeHtml(body.commit)}</a> — ` +
        `${body.changed} field${body.changed === 1 ? '' : 's'}. ` +
        'The site rebuilds automatically; the change is live in about a minute.'
    );
    edits.clear();
    refreshBar();
  } catch (error) {
    setStatus('bad', 'Could not reach the save endpoint.');
    refreshBar();
  }
});

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Leaving with unsaved edits loses them; say so.
window.addEventListener('beforeunload', (event) => {
  if (dirtyCount() > 0) event.preventDefault();
});

refreshBar();
