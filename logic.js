(function (root) {
  function toDateKey(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function keyToLocalDate(key, time) {
    const [y, m, d] = key.split('-').map(Number);
    const [hh, mm] = (time || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }

  function dayStatus(plan, now) {
    const k = toDateKey(now);
    if (k < plan.startDate) return 'before';
    if (k > plan.auditionDate) return 'after';
    return 'during';
  }

  function daysUntil(targetKey, now) {
    const today = keyToLocalDate(toDateKey(now));
    return Math.round((keyToLocalDate(targetKey) - today) / 86400000);
  }

  // Live countdown parts to the audition start time; all zero once it has passed.
  function countdown(plan, now) {
    const ms = Math.max(0, keyToLocalDate(plan.auditionDate, plan.auditionTime) - now);
    const s = Math.floor(ms / 1000);
    return { done: ms === 0, days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, minutes: Math.floor(s / 60) % 60, seconds: s % 60 };
  }

  function focusDate(plan, now) {
    const k = toDateKey(now);
    if (k < plan.startDate) return plan.startDate;
    if (k > plan.auditionDate) return plan.auditionDate;
    return k;
  }

  function itemsForDay(plan, day) {
    return day.blocks.map((b, i) => ({ id: `${day.date}:${i}`, t: b.t, text: b.text, tag: b.tag || null }));
  }

  function checklistIds(plan) {
    return plan.checklist.map((_, i) => `chk:${i}`);
  }

  function allItemIds(plan) {
    const ids = [];
    plan.days.forEach(day => itemsForDay(plan, day).forEach(it => ids.push(it.id)));
    return ids.concat(checklistIds(plan));
  }

  function progress(ids, checks) {
    const done = ids.filter(id => checks[id] === true).length;
    const total = ids.length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function dayComplete(plan, day, checks) {
    const p = progress(itemsForDay(plan, day).map(i => i.id), checks);
    return p.total > 0 && p.done === p.total;
  }

  function taggedIds(plan, tag) {
    const ids = [];
    plan.days.forEach(day => itemsForDay(plan, day).forEach(it => { if (it.tag === tag) ids.push(it.id); }));
    return ids;
  }

  // Returns the set of unlocked achievement ids for the given state.
  function achievements(plan, state) {
    const checks = state.checks;
    const allDone = ids => ids.length > 0 && ids.every(id => checks[id] === true);
    const complete = plan.days.map(d => dayComplete(plan, d, checks));
    let run = 0, best = 0;
    complete.forEach(c => { run = c ? run + 1 : 0; best = Math.max(best, run); });
    const notes = Object.values(state.journal).filter(e => e && typeof e.note === 'string' && e.note.trim()).length;

    const got = new Set();
    if (Object.values(checks).some(v => v === true)) got.add('first');
    if (best >= 1) got.add('fullDay');
    if (best >= 3) got.add('streak3');
    if (allDone(taggedIds(plan, 'rehearsal'))) got.add('rehearsal');
    if (allDone(taggedIds(plan, 'exercise'))) got.add('body');
    if (allDone(taggedIds(plan, 'mock'))) got.add('mock');
    if (notes >= 3) got.add('journal');
    if (allDone(checklistIds(plan))) got.add('packed');
    if (allDone(allItemIds(plan))) got.add('comet');
    return got;
  }

  function emptyState() {
    return { v: 1, checks: {}, journal: {}, mock: { sincere: '', overcontrolled: '', change: '' }, letter: null };
  }

  const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

  function parseState(raw) {
    if (raw === null || raw === undefined || raw === '') return { state: emptyState(), corrupt: false };
    try {
      const data = JSON.parse(raw);
      if (!isObj(data) || data.v !== 1) return { state: emptyState(), corrupt: true };
      const s = emptyState();
      if (isObj(data.checks)) s.checks = data.checks;
      if (isObj(data.journal)) s.journal = data.journal;
      if (isObj(data.mock)) Object.assign(s.mock, data.mock);
      const lt = data.letter;
      if (isObj(lt) && typeof lt.text === 'string' && lt.text.trim()) s.letter = { text: lt.text, at: String(lt.at || '') };
      if (typeof data.at === 'string') s.at = data.at;
      return { state: s, corrupt: false };
    } catch (e) {
      return { state: emptyState(), corrupt: true };
    }
  }

  function serializeState(state) {
    return JSON.stringify(state);
  }

  function sheetPayload(plan, state) {
    const blank = v => (v === null || v === undefined ? '' : v);
    const days = plan.days.map(d => {
      const p = progress(itemsForDay(plan, d).map(i => i.id), state.checks);
      const j = state.journal[d.date] || {};
      return [d.date, d.title, p.done, p.total, p.pct, blank(j.note), blank(j.voice), blank(j.energy)];
    });
    const m = state.mock;
    const letter = state.letter ? [state.letter.text, state.letter.at] : ['', ''];
    return { days, mock: [m.sincere, m.overcontrolled, m.change], letter, state: serializeState(state) };
  }

  // Last edit wins across devices: 'remote' to adopt the sheet copy, 'local' to push ours, 'same' otherwise.
  function newerState(local, remote) {
    const a = local.at || '', b = (remote && remote.at) || '';
    return b > a ? 'remote' : a > b ? 'local' : 'same';
  }

  const api = { toDateKey, dayStatus, daysUntil, countdown, focusDate, itemsForDay, allItemIds, progress, dayComplete, achievements, emptyState, parseState, serializeState, sheetPayload, newerState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
