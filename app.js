(function () {
  const PLAN = window.PLAN;
  const L = window.Logic;
  const STORE_KEY = 'natasha-board-v1';
  const SHEET_KEY = 'natasha-sheet-url';
  const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwTf4lOiYcD5uiUBTKBlQgRdGdjsAyN-eTULSceFR7-A_jPU3vIqK0c2w9hDI0VqoJX/exec';
  const SHEET_LINK_KEY = 'natasha-sheet-link';
  const SHEET_TIME_KEY = 'natasha-sheet-pushed';
  const now = new Date();
  const today = L.focusDate(PLAN, now);
  const status = L.dayStatus(PLAN, now);
  const dayByDate = Object.fromEntries(PLAN.days.map(d => [d.date, d]));
  let state;
  let canSave = true;
  let unlocked;

  // ---------- helpers ----------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach(c => node.append(c));
    return node;
  }

  function banner(msg) {
    const b = document.getElementById('banner');
    b.textContent = msg;
    b.classList.add('show');
  }

  const thaiDate = key => `${Number(key.slice(8, 10))} ต.ค.`;
  const pad = n => String(n).padStart(2, '0');
  const dayIds = day => L.itemsForDay(PLAN, day).map(i => i.id);

  // ---------- storage ----------
  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch (e) {
      canSave = false;
      banner('เบราว์เซอร์นี้บันทึกข้อมูลไม่ได้ (เช่น โหมดส่วนตัว) — สิ่งที่ติ๊กจะหายเมื่อปิดหน้า');
    }
    const r = L.parseState(raw);
    state = r.state;
    if (r.corrupt) banner('ข้อมูลเดิมอ่านไม่ได้ จึงเริ่มใหม่ — ข้อมูลเดิมจะไม่ถูกเขียนทับจนกว่าคุณจะติ๊กหรือพิมพ์อะไรใหม่');
  }

  function save() {
    if (!canSave) return;
    try {
      localStorage.setItem(STORE_KEY, L.serializeState(state));
    } catch (e) {
      canSave = false;
      banner('บันทึกข้อมูลไม่สำเร็จ — ลองกดส่งออกไฟล์สำรองไว้ก่อน');
    }
    queueSheetPush();
  }

  // ---------- google sheet (one-way backup) ----------
  let sheetTimer;
  function getPref(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function setPref(key, v) {
    try { v ? localStorage.setItem(key, v) : localStorage.removeItem(key); return true; } catch (e) { return false; }
  }
  const sheetUrl = () => getPref(SHEET_KEY) || DEFAULT_SHEET_URL;

  function lastPushText() {
    const t = getPref(SHEET_TIME_KEY);
    if (!t) return sheetUrl() ? 'เชื่อมต่อแล้ว · ยังไม่เคยส่ง' : 'ยังไม่ได้เชื่อมต่อ';
    const d = new Date(t);
    return `อัปเดตล่าสุด ${thaiDate(L.toDateKey(d))} ${pad(d.getHours())}:${pad(d.getMinutes())} น.`;
  }

  function updateSheetLink() {
    const a = document.getElementById('sheet-open');
    if (!a) return;
    const link = getPref(SHEET_LINK_KEY);
    a.hidden = !link;
    if (link) a.href = link;
  }

  function sheetStatus(msg) {
    const s = document.getElementById('sheet-status');
    if (s) s.textContent = msg;
  }

  function queueSheetPush() {
    if (!sheetUrl()) return;
    clearTimeout(sheetTimer);
    sheetTimer = setTimeout(pushToSheet, 2000);
  }

  function pushToSheet() {
    const url = sheetUrl();
    if (!url) return;
    sheetStatus('กำลังส่งไป Google Sheet…');
    // Apps Script web apps don't send CORS headers, so the response is opaque.
    fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(L.sheetPayload(PLAN, state)) })
      .then(() => { setPref(SHEET_TIME_KEY, new Date().toISOString()); sheetStatus(lastPushText()); })
      .catch(() => sheetStatus('ส่งไป Google Sheet ไม่สำเร็จ — ตรวจอินเทอร์เน็ตหรือลิงก์'));
  }

  // ---------- achievements ----------
  let toastTimer;
  function toast(a) {
    const t = document.getElementById('toast');
    t.replaceChildren(el('span', { class: 'ic', text: a.icon }), el('small', { text: 'ปลดล็อกความสำเร็จ' }),
      el('div', {}, [el('b', { text: a.name })]), el('div', { class: 'muted', text: a.desc }));
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function checkAchievements() {
    const next = L.achievements(PLAN, state);
    const fresh = PLAN.achievements.filter(a => next.has(a.id) && !unlocked.has(a.id));
    unlocked = next;
    if (fresh.length) toast(fresh[fresh.length - 1]);
    renderBadges();
    updateProgress();
  }

  // ---------- shared check item ----------
  function checkItem(id, text, time) {
    const input = el('input', { type: 'checkbox', 'data-id': id });
    input.checked = state.checks[id] === true;
    input.addEventListener('change', () => {
      if (input.checked) state.checks[id] = true;
      else delete state.checks[id];
      save();
      document.querySelectorAll(`input[data-id="${id}"]`).forEach(i => { i.checked = input.checked; });
      checkAchievements();
    });
    const kids = time ? [el('time', { text: time }), input, el('span', { text })] : [input, el('span', { text })];
    return el('label', { class: time ? 'check' : 'check plain' }, kids);
  }

  function timeline(day) {
    const box = el('div');
    L.itemsForDay(PLAN, day).forEach(it => box.append(checkItem(it.id, it.text, it.t)));
    return box;
  }

  // ---------- countdown ----------
  function renderCountdown() {
    const c = L.countdown(PLAN, new Date());
    document.getElementById('cd-d').textContent = c.days;
    document.getElementById('cd-h').textContent = pad(c.hours);
    document.getElementById('cd-m').textContent = pad(c.minutes);
    document.getElementById('cd-s').textContent = pad(c.seconds);
    let msg;
    if (status === 'after') msg = 'ม่านปิดแล้ว — ภูมิใจกับทุกวันที่ฝึกมา ✨';
    else if (c.done) msg = 'ถึงเวลาขึ้นเวทีแล้ว — break a leg! 🎭';
    else if (status === 'before') msg = 'แผนเริ่ม 20 ต.ค. · ออดิชั่นศุกร์ 30 ต.ค. 2026';
    else msg = `ถึงศุกร์ 30 ต.ค. ${PLAN.auditionTime} น. · วันนี้ ${thaiDate(today)}`;
    document.getElementById('status').textContent = msg;
  }

  // ---------- panels ----------
  function renderToday() {
    const day = dayByDate[today];
    const n = PLAN.days.indexOf(day) + 1;
    const sec = document.getElementById('p-today');
    sec.append(
      el('div', { class: 'act', text: `ฉากที่ ${n} จาก ${PLAN.days.length} · ${day.dow} ${thaiDate(day.date)}` }),
      el('h2', { text: day.title }),
      el('div', { class: 'muted', text: '🎯 ' + day.focus }),
      el('div', { class: 'bar' }, [el('i', { id: 'today-bar', style: 'width:0%' })]),
      el('div', { class: 'muted', id: 'today-count' })
    );
    const card = el('div', { class: 'card' }, [timeline(day), el('div', { class: 'rest muted', text: '🌙 หลักการพัก: ' + day.rest })]);
    sec.append(card);
    sec.append(journalCard(day.date));
    sec.append(letterCard());
    sec.append(el('p', { class: 'motto', text: '“' + PLAN.motto + '”' }));
  }

  function renderSchedule() {
    const sec = document.getElementById('p-schedule');
    sec.append(el('div', { class: 'act', text: '20 – 30 October' }), el('h2', { text: 'ตาราง 11 ฉาก' }));
    PLAN.days.forEach(day => {
      const cls = ['day'];
      if (day.date === today) cls.push('today');
      if (day.type === 'audition') cls.push('audition');
      if (day.date < today) cls.push('past');
      const tags = { rehearsal: '🎭 ซ้อมละคร', mock: '🎬 Mock', audition: '☄️ Audition', recovery: '🌿 พัก', train: '🎼 ฝึก' };
      const det = el('details', { class: cls.join(' ') }, [
        el('summary', {}, [
          el('div', { class: 'date-chip' }, [el('b', { text: String(Number(day.date.slice(8))) }), el('small', { text: day.dow })]),
          el('div', {}, [el('div', { class: 'day-title', text: day.title }), el('div', { class: 'day-meta', text: tags[day.type] + (day.date === today ? ' · วันนี้' : '') })]),
          el('span', { class: 'day-count', 'data-day-count': day.date })
        ]),
        el('div', { class: 'body' }, [
          el('div', { class: 'muted', text: '🎯 ' + day.focus }),
          timeline(day),
          el('div', { class: 'rest muted', text: '🌙 ' + day.rest })
        ])
      ]);
      sec.append(det);
    });
    sec.append(el('p', { class: 'muted', text: 'วันซ้อมละครถือเป็นงานหลักของวัน ไม่ต้องชดเชยด้วยการฝึกหนักเพิ่ม' }));
  }

  function fold(title, children, open) {
    const d = el('details', { class: 'fold' }, [el('summary', { text: title }), el('div', { class: 'body' }, children)]);
    if (open) d.open = true;
    return d;
  }

  function renderGuide() {
    const sec = document.getElementById('p-guide');
    sec.append(el('div', { class: 'act', text: 'Rehearsal notes' }), el('h2', { text: 'คู่มือ' }));
    sec.append(fold('🩰 ท่าออกกำลังกาย 5 ท่า', [
      el('p', { class: 'muted', text: PLAN.exerciseNote }),
      ...PLAN.exercises.map((ex, i) => el('div', { class: 'ex' }, [
        el('b', { text: `${i + 1}. ${ex.name}` }), ' ', el('span', { class: 'amount', text: ex.amount }), el('div', { text: ex.how })]))
    ]));
    const ul = el('ul');
    PLAN.voicePlan.forEach(v => ul.append(el('li', {}, [el('b', { text: v.when + ': ' }), v.what])));
    sec.append(fold('🎶 ดูแลเสียง · ' + PLAN.song, [ul]));
    sec.append(fold('🎭 แบบฝึกการแสดง A–D', PLAN.drills.map(d => {
      const box = el('div', { class: 'drill' }, [el('b', { text: `${d.key}. ${d.name}` })]);
      if (d.text) box.append(el('div', { text: d.text }));
      if (d.steps) { const ol = el('ol'); d.steps.forEach(s => ol.append(el('li', { text: s }))); box.append(ol); }
      return box;
    })));
    sec.append(fold('🚦 สัญญาณหยุด', [el('div', { text: PLAN.stopSignals })]));
  }

  function renderAwards() {
    const sec = document.getElementById('p-awards');
    sec.append(el('div', { class: 'act', text: 'Curtain call' }), el('h2', { text: 'รางวัลและความพร้อม' }));
    sec.append(el('div', { class: 'card overall', id: 'overall' }));
    sec.append(el('div', { class: 'card' }, [el('div', { class: 'badges', id: 'badges' })]));

    const chk = el('div', { class: 'card' }, [el('h3', { text: '🎀 เช็กลิสต์ 29–30 ต.ค.' })]);
    PLAN.checklist.forEach((text, i) => chk.append(checkItem(`chk:${i}`, text)));
    sec.append(chk);

    sec.append(el('div', { class: 'card' }, [
      el('h3', { text: '🎬 Mock audition · 3 เรื่องที่จด' }),
      ...textField('จุดที่จริงใจที่สุด', state.mock.sincere, v => { state.mock.sincere = v; }),
      ...textField('จุดที่ควบคุมมากเกินไป', state.mock.overcontrolled, v => { state.mock.overcontrolled = v; }),
      ...textField('สิ่งที่อยากเปลี่ยน', state.mock.change, v => { state.mock.change = v; })
    ]));

    const fileInput = el('input', { type: 'file', accept: 'application/json', hidden: '' });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (!f) return;
      f.text().then(txt => {
        const r = L.parseState(txt);
        if (r.corrupt) { banner('ไฟล์สำรองนี้อ่านไม่ได้'); return; }
        if (!canSave) { banner('เบราว์เซอร์นี้บันทึกข้อมูลไม่ได้ จึงนำเข้าไม่ได้'); return; }
        state = r.state;
        save();
        location.reload();
      });
    });
    sec.append(fold('💾 สำรองข้อมูล', [
      el('p', { class: 'muted', text: 'ข้อมูลอยู่ในเบราว์เซอร์เครื่องนี้ ส่งออกไว้ก่อนเปลี่ยนเครื่อง' }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn solid', type: 'button', text: 'ส่งออกไฟล์สำรอง', onclick: exportState }),
        el('button', { class: 'btn', type: 'button', text: 'นำเข้าไฟล์สำรอง', onclick: () => fileInput.click() }),
        fileInput
      ])
    ]));

    const urlInput = el('input', { type: 'url', class: 'sheet-url', placeholder: 'ลิงก์ Web App: https://script.google.com/macros/s/…/exec' });
    urlInput.value = sheetUrl();
    const linkInput = el('input', { type: 'url', class: 'sheet-url', placeholder: 'ลิงก์ชีต: https://docs.google.com/spreadsheets/d/…' });
    linkInput.value = getPref(SHEET_LINK_KEY);
    sec.append(el('div', { class: 'card' }, [
      el('h3', { text: '📊 Google Sheet' }),
      el('p', { class: 'muted', id: 'sheet-status', text: lastPushText() }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn solid', type: 'button', text: '🔄 อัปเดตตอนนี้', onclick: () => {
          if (!sheetUrl()) { sheetStatus('ยังไม่ได้ใส่ลิงก์ Web App — ตั้งค่าด้านล่างก่อน'); return; }
          clearTimeout(sheetTimer);
          pushToSheet();
        } }),
        el('a', { class: 'btn', id: 'sheet-open', target: '_blank', rel: 'noopener', text: '📄 เปิด Google Sheet' })
      ]),
      fold('⚙️ ตั้งค่าการเชื่อมต่อ', [
        el('p', { class: 'muted', text: 'วางลิงก์ Web App จาก Apps Script (ดูวิธีใน docs/google-sheet-setup.md) และลิงก์ของชีตเพื่อให้ปุ่มเปิดชีตใช้ได้' }),
        urlInput,
        linkInput,
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn solid', type: 'button', text: 'บันทึกลิงก์และส่งเลย', onclick: () => {
            const v = urlInput.value.trim();
            const link = linkInput.value.trim();
            if (v && !/^https:\/\/script\.google\.com\//.test(v)) { sheetStatus('ลิงก์ Web App ต้องขึ้นต้นด้วย https://script.google.com/'); return; }
            if (link && !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(link)) { sheetStatus('ลิงก์ชีตต้องขึ้นต้นด้วย https://docs.google.com/spreadsheets/'); return; }
            if (!setPref(SHEET_KEY, v) || !setPref(SHEET_LINK_KEY, link)) { sheetStatus('เบราว์เซอร์นี้บันทึกลิงก์ไม่ได้'); return; }
            updateSheetLink();
            pushToSheet();
          } })
        ])
      ])
    ]));
    updateSheetLink();
  }

  function renderBadges() {
    const box = document.getElementById('badges');
    box.replaceChildren(...PLAN.achievements.map(a => el('div', { class: 'badge' + (unlocked.has(a.id) ? ' on' : '') }, [
      el('span', { class: 'ic', text: a.icon }), el('span', { class: 'nm', text: a.name }), el('span', { class: 'ds', text: a.desc })])));
  }

  function textField(labelText, value, onInput) {
    const ta = el('textarea');
    ta.value = value || '';
    ta.addEventListener('input', () => { onInput(ta.value); save(); checkAchievements(); });
    return [el('label', { class: 'field', text: labelText }), ta];
  }

  function scoreField(labelText, value, onChange) {
    const sel = el('select');
    sel.append(el('option', { value: '', text: '—' }));
    [1, 2, 3, 4, 5].forEach(n => sel.append(el('option', { value: String(n), text: '★'.repeat(n) })));
    sel.value = value ? String(value) : '';
    sel.addEventListener('change', () => { onChange(sel.value ? Number(sel.value) : null); save(); });
    return el('div', {}, [el('label', { class: 'field', text: labelText }), sel]);
  }

  function journalCard(key) {
    const entry = state.journal[key] || { note: '', voice: null, energy: null };
    const commit = () => { state.journal[key] = entry; };
    return fold('📖 บันทึกของวันนี้', [
      ...textField('วันนี้ Natasha ได้เรียนรู้อะไร', entry.note, v => { entry.note = v; commit(); }),
      el('div', { class: 'row' }, [
        scoreField('เสียงพร้อมแค่ไหน', entry.voice, v => { entry.voice = v; commit(); }),
        scoreField('พลังงานวันนี้', entry.energy, v => { entry.energy = v; commit(); })
      ])
    ]);
  }

  // Sealed once: after saving, the letter is shown read-only and never editable again.
  function letterCard() {
    const card = el('div', { class: 'card letter' });
    const sealed = () => {
      const d = new Date(state.letter.at);
      const when = isNaN(d) ? '' : `ผนึกไว้เมื่อ ${thaiDate(L.toDateKey(d))} ${pad(d.getHours())}:${pad(d.getMinutes())} น.`;
      card.replaceChildren(
        el('h3', { text: '💌 ถึงตัวฉันในวันออดิชั่น' }),
        el('p', { class: 'letter-text', text: state.letter.text }),
        el('div', { class: 'muted', text: '🔒 ' + when })
      );
    };
    if (state.letter) { sealed(); return card; }

    const ta = el('textarea', { placeholder: 'เขียนถึงตัวเองในวันศุกร์ 30 ต.ค.…' });
    const btn = el('button', { class: 'btn solid', type: 'button', text: 'บันทึกข้อความ' });
    const hint = el('div', { class: 'muted', text: 'ตอบได้ครั้งเดียว — บันทึกแล้วจะกลับมาแก้ไม่ได้' });
    let armed = false;
    ta.addEventListener('input', () => { armed = false; btn.textContent = 'บันทึกข้อความ'; });
    btn.addEventListener('click', () => {
      const text = ta.value.trim();
      if (!text) { hint.textContent = 'ยังไม่ได้เขียนอะไรเลย'; return; }
      if (!canSave) { hint.textContent = 'เบราว์เซอร์นี้บันทึกข้อมูลไม่ได้ ข้อความจะหายเมื่อปิดหน้า'; return; }
      if (!armed) { armed = true; btn.textContent = 'ยืนยัน บันทึกถาวร 🔒'; hint.textContent = 'กดอีกครั้งเพื่อยืนยัน หลังจากนี้แก้ไม่ได้แล้ว'; return; }
      state.letter = { text, at: new Date().toISOString() };
      save();
      sealed();
    });
    card.append(el('h3', { text: '💌 มีอะไรจะบอกตัวคุณในวันออดิชั่นไหม?' }), ta, el('div', { class: 'actions' }, [btn]), hint);
    return card;
  }

  function exportState() {
    const blob = new Blob([L.serializeState(state)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `natasha-board-${L.toDateKey(new Date())}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- progress ----------
  function ring(pct) {
    const r = 38, c = 2 * Math.PI * r;
    const wrap = el('div');
    wrap.innerHTML = `<svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="ความคืบหน้า ${pct}%">
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="8"/>
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="#e8c26a" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 48 48)"/>
      <text x="48" y="55" text-anchor="middle" fill="#f6e3a8" font-family="Playfair Display, serif" font-size="20" font-weight="800">${pct}%</text>
    </svg>`;
    return wrap.firstElementChild;
  }

  function updateProgress() {
    const tp = L.progress(dayIds(dayByDate[today]), state.checks);
    document.getElementById('today-bar').style.width = tp.pct + '%';
    document.getElementById('today-count').textContent = tp.done === tp.total
      ? `ครบทุกฉากของวันนี้แล้ว ${tp.done}/${tp.total} 🌙`
      : `ทำแล้ว ${tp.done} จาก ${tp.total}`;

    PLAN.days.forEach(d => {
      const p = L.progress(dayIds(d), state.checks);
      const node = document.querySelector(`[data-day-count="${d.date}"]`);
      node.textContent = `${p.done}/${p.total}`;
      node.classList.toggle('full', p.done === p.total);
    });

    const all = L.progress(L.allItemIds(PLAN), state.checks);
    const full = PLAN.days.filter(d => L.dayComplete(PLAN, d, state.checks)).length;
    document.getElementById('overall').replaceChildren(ring(all.pct), el('div', {}, [
      el('b', { text: `${unlocked.size}/${PLAN.achievements.length} รางวัล` }),
      el('div', { class: 'muted', text: `ทำครบ ${full}/${PLAN.days.length} วัน · ${all.done}/${all.total} รายการ` })
    ]));
  }

  // ---------- tabs ----------
  function setupTabs() {
    const buttons = document.querySelectorAll('nav.tabs button');
    buttons.forEach(btn => btn.addEventListener('click', () => {
      buttons.forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === btn.dataset.tab));
      document.querySelector('main').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  // ---------- boot ----------
  load();
  queueSheetPush();
  unlocked = L.achievements(PLAN, state);
  renderToday();
  renderSchedule();
  renderGuide();
  renderAwards();
  renderBadges();
  updateProgress();
  setupTabs();
  renderCountdown();
  setInterval(renderCountdown, 1000);
  const todayCard = document.querySelector('details.day.today');
  if (todayCard) todayCard.open = true;
  requestAnimationFrame(() => setTimeout(() => document.body.classList.add('curtain-open'), 250));
})();
