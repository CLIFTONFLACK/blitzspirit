/* BlitzSpirit — self-contained feedback (note) + highlight-to-edit widget.
   Themed for the brutalist "newui" homepage. No dependencies, injects its
   own styles. Posts to POST /api/feedback (same Supabase queue the heritage
   site uses). Live edits are preview-only (wrapped in mark.bs-edited). */
(function () {
  'use strict';
  if (window.__bsFeedbackLoaded) return;
  window.__bsFeedbackLoaded = true;

  var MONO = 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Roboto Mono",monospace';
  var RED = '#FF0000';

  var css =
    '.bsfb-btn{position:fixed;right:18px;bottom:18px;z-index:90;font-family:' + MONO + ';font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#fff;background:#000;border:1px solid ' + RED + ';padding:10px 14px;cursor:pointer}' +
    '.bsfb-btn:hover{background:' + RED + ';color:#fff}' +
    '.bsfb-panel,.bsfb-edit{position:fixed;right:18px;bottom:64px;z-index:96;width:min(360px,calc(100vw - 36px));background:#000;border:1px solid #2a2a2a;padding:16px;display:none;font-family:' + MONO + '}' +
    '.bsfb-edit{border-color:' + RED + ';z-index:97}' +
    '.bsfb-panel.open,.bsfb-edit.open{display:block}' +
    '.bsfb-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}' +
    '.bsfb-head .lbl{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A8A8A}' +
    '.bsfb-x{background:none;border:1px solid #2a2a2a;color:#8A8A8A;font-size:13px;line-height:1;padding:2px 8px;cursor:pointer}' +
    '.bsfb-x:hover{color:#fff;border-color:#8A8A8A}' +
    '.bsfb-panel textarea,.bsfb-edit textarea{width:100%;background:#111;border:1px solid #2a2a2a;color:#fff;font-family:' + MONO + ';font-size:12px;padding:10px;resize:vertical;min-height:84px;outline:none;box-sizing:border-box}' +
    '.bsfb-panel textarea:focus,.bsfb-edit textarea:focus{border-color:' + RED + '}' +
    '.bsfb-send{width:100%;margin-top:10px;background:' + RED + ';border:1px solid ' + RED + ';color:#fff;font-family:' + MONO + ';font-size:11px;letter-spacing:.16em;text-transform:uppercase;padding:12px;cursor:pointer}' +
    '.bsfb-send:hover{background:#fff;color:#000;border-color:#fff}' +
    '.bsfb-send:disabled{opacity:.6;cursor:default}' +
    '.bsfb-status{font-size:10px;letter-spacing:.08em;text-transform:uppercase;margin-top:8px;min-height:12px;color:#8A8A8A}' +
    '.bsfb-toolbar{position:fixed;z-index:99;transform:translate(-50%,-100%);display:none;background:#000;border:1px solid ' + RED + '}' +
    '.bsfb-toolbar.open{display:flex}' +
    '.bsfb-toolbar button{background:#000;border:none;border-right:1px solid #2a2a2a;color:#fff;font-family:' + MONO + ';font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:7px 11px;cursor:pointer;white-space:nowrap}' +
    '.bsfb-toolbar button:last-child{border-right:none}' +
    '.bsfb-toolbar button:hover{background:' + RED + '}' +
    '.bsfb-orig{font-size:11px;color:#8A8A8A;border-left:2px solid ' + RED + ';padding:4px 0 4px 10px;margin-bottom:10px;max-height:84px;overflow:auto}' +
    '.bsfb-lbl{display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8A8A8A;margin:0 0 6px}' +
    'mark.bs-edited{background:rgba(255,0,0,.18);color:inherit;box-shadow:inset 0 -2px 0 ' + RED + ';padding:0 1px}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- elements ---------- */
  var btn = document.createElement('button');
  btn.className = 'bsfb-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Leave a note');
  btn.textContent = '[ NOTE ]';

  var panel = document.createElement('div');
  panel.className = 'bsfb-panel';
  panel.setAttribute('role', 'complementary');
  panel.innerHTML =
    '<div class="bsfb-head"><span class="lbl">[ LEAVE A NOTE ]</span><button class="bsfb-x" type="button" aria-label="Close">&times;</button></div>' +
    '<textarea placeholder="WHAT\'S WRONG, UNCLEAR, OR COULD BE BETTER?"></textarea>' +
    '<button class="bsfb-send" type="button" data-send>[ SEND ]</button>' +
    '<p class="bsfb-status"></p>';

  var toolbar = document.createElement('div');
  toolbar.className = 'bsfb-toolbar';
  toolbar.innerHTML =
    '<button type="button" data-sa="comment">▶ NOTE</button>' +
    '<button type="button" data-sa="edit">✎ EDIT</button>';

  var editPanel = document.createElement('div');
  editPanel.className = 'bsfb-edit';
  editPanel.setAttribute('role', 'complementary');
  editPanel.innerHTML =
    '<div class="bsfb-head"><span class="lbl">[ EDIT ]</span><button class="bsfb-x" type="button" aria-label="Close">&times;</button></div>' +
    '<p class="bsfb-orig"></p>' +
    '<label class="bsfb-lbl">Replace with</label>' +
    '<textarea class="bsfb-replace" placeholder="REPLACEMENT TEXT…" rows="3"></textarea>' +
    '<button class="bsfb-send" type="button" data-sel-send>[ SEND ]</button>' +
    '<p class="bsfb-status"></p>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);
  document.body.appendChild(toolbar);
  document.body.appendChild(editPanel);

  var fbTextarea = panel.querySelector('textarea');
  var fbStatus = panel.querySelector('.bsfb-status');
  var selReplace = editPanel.querySelector('.bsfb-replace');
  var selStatus = editPanel.querySelector('.bsfb-status');
  var selOriginal = editPanel.querySelector('.bsfb-orig');

  var pendingQuote = '', pendingType = 'general';
  var currentQuote = '', savedRange = null, editApplied = false;

  /* ---------- post helper ---------- */
  function send(payload, statusEl, btnEl, okText, doneFn) {
    btnEl.disabled = true;
    var label = btnEl.textContent;
    btnEl.textContent = 'SENDING…';
    statusEl.style.color = '';
    statusEl.textContent = '';
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (r.ok || r.status === 201) {
        statusEl.style.color = RED;
        statusEl.textContent = okText;
        if (doneFn) setTimeout(doneFn, 1700);
      } else {
        statusEl.style.color = RED;
        statusEl.textContent = 'NO LUCK — TRY AGAIN.';
      }
      btnEl.disabled = false; btnEl.textContent = label;
    }).catch(function () {
      statusEl.style.color = RED;
      statusEl.textContent = 'NO LUCK — TRY AGAIN.';
      btnEl.disabled = false; btnEl.textContent = label;
    });
  }

  /* ---------- note panel ---------- */
  function fbOpen() { editClose(); panel.classList.add('open'); fbTextarea.focus(); }
  function fbClose() {
    panel.classList.remove('open');
    fbTextarea.value = ''; fbStatus.textContent = '';
    pendingQuote = ''; pendingType = 'general';
  }
  btn.addEventListener('click', function () {
    if (panel.classList.contains('open')) fbClose(); else fbOpen();
  });
  panel.querySelector('.bsfb-x').addEventListener('click', fbClose);
  panel.querySelector('[data-send]').addEventListener('click', function () {
    var comment = fbTextarea.value.trim();
    if (!comment) { fbTextarea.focus(); return; }
    send({ page: location.pathname, comment: comment, theme: 'dark', type: pendingType, quote: pendingQuote || null },
      fbStatus, this, 'NOTED. CHEERS.', fbClose);
  });

  /* ---------- highlight-to-note / edit ---------- */
  function hideSel() {
    toolbar.classList.remove('open');
    currentQuote = ''; savedRange = null; editApplied = false;
  }
  function editClose() {
    editPanel.classList.remove('open');
    selReplace.value = ''; selStatus.textContent = '';
  }

  function applyLiveEdit(replacement) {
    if (editApplied) return true;
    if (!savedRange) return false;
    try {
      var mark = document.createElement('mark');
      mark.className = 'bs-edited';
      mark.textContent = replacement;
      savedRange.deleteContents();
      savedRange.insertNode(mark);
      var sel = window.getSelection(); if (sel) sel.removeAllRanges();
      editApplied = true;
      return true;
    } catch (err) { return false; }
  }

  document.addEventListener('mouseup', function (e) {
    if (e.target.closest('.bsfb-toolbar,.bsfb-edit,.bsfb-panel,.bsfb-btn')) return;
    setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) { hideSel(); return; }
      var q = sel.toString().trim();
      if (q.length < 3) { hideSel(); return; }
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      if (!rect.width) { hideSel(); return; }
      currentQuote = q;
      savedRange = range.cloneRange();
      editApplied = false;
      toolbar.style.left = Math.round(rect.left + rect.width / 2) + 'px';
      toolbar.style.top = Math.round(rect.top - 4) + 'px';
      toolbar.classList.add('open');
    }, 20);
  });

  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('.bsfb-toolbar,.bsfb-edit')) hideSel();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { hideSel(); editClose(); fbClose(); }
  });
  window.addEventListener('scroll', function () {
    if (toolbar.classList.contains('open')) hideSel();
  }, true);

  toolbar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sa]');
    if (!b) return;
    var action = b.getAttribute('data-sa');
    if (action === 'comment') {
      pendingType = 'comment';
      pendingQuote = currentQuote;
      toolbar.classList.remove('open');
      fbOpen();
      fbTextarea.value = '“' + currentQuote + '”\n\n';
      currentQuote = '';
      fbTextarea.setSelectionRange(fbTextarea.value.length, fbTextarea.value.length);
    } else if (action === 'edit') {
      selOriginal.textContent = '“' + currentQuote + '”';
      toolbar.classList.remove('open');
      editPanel.classList.add('open');
      selReplace.focus();
    }
  });

  editPanel.querySelector('.bsfb-x').addEventListener('click', function () { editClose(); hideSel(); });
  editPanel.querySelector('[data-sel-send]').addEventListener('click', function () {
    var replacement = selReplace.value.trim();
    if (!replacement) { selReplace.focus(); return; }
    var quote = currentQuote;
    var live = applyLiveEdit(replacement);
    send({
      page: location.pathname,
      comment: '“' + quote + '” → “' + replacement + '”',
      theme: 'dark', type: 'edit', quote: quote, replacement: replacement
    }, selStatus, this, live ? 'CHANGED HERE — AND LOGGED.' : 'LOGGED. CHEERS.', function () { editClose(); hideSel(); });
  });
})();
