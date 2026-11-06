/* The day picker in the middle of the screen: day, month and year each step with their own arrows, the date itself
 * opens a calendar, and play walks forward one day at a time. Left and right arrow keys also step a day. */

const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(s + "T00:00:00Z");
export const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * 86400000));

export function addMonths(s, n) {
  const d = parse(s), day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return iso(t);
}

const CHEV = (up) => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 ${up ? 10.5 : 5.5} 8 ${up ? 5.5 : 10.5} 13 ${up ? 10.5 : 5.5}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z" fill="currentColor"/></svg>';
const LAST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14l10-7zM16 5h3v14h-3z" fill="currentColor"/></svg>';

export function initDateBar(root, { onChange, text, monthName }) {
  const st = { min: "2000-02-24", max: iso(new Date()), value: iso(new Date()), playing: false, timer: null };
  const btn = (cls, html, on, label) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = cls; b.innerHTML = html; b.addEventListener("click", on);
    if (label) b.dataset.label = label;
    return b;
  };
  const clamp = (s) => (s < st.min ? st.min : s > st.max ? st.max : s);
  const go = async (s) => {
    const next = clamp(s);
    if (next === st.value) return;
    st.value = next; paint();
    await onChange(next);
  };

  const spin = (key, step) => {
    const w = document.createElement("div");
    w.className = "spin spin-" + key;
    const val = document.createElement("button");
    val.type = "button"; val.className = "spin-val";
    val.addEventListener("click", openCalendar);
    w.append(btn("chev", CHEV(true), () => go(step(st.value, 1)), key + "_up"), val, btn("chev", CHEV(false), () => go(step(st.value, -1)), key + "_down"));
    return { w, val };
  };
  const day = spin("day", addDays), month = spin("month", addMonths), year = spin("year", (s, n) => addMonths(s, 12 * n));

  const cal = document.createElement("input");
  cal.type = "date"; cal.className = "cal"; cal.tabIndex = -1;
  cal.addEventListener("change", () => { if (cal.value) go(cal.value); });
  function openCalendar() { try { cal.showPicker(); } catch { cal.focus(); cal.click(); } }

  const play = btn("round play", PLAY, () => (st.playing ? stop() : start()), "play");
  const last = btn("round last", LAST, () => go(st.max), "latest");
  root.replaceChildren(play, day.w, month.w, year.w, last, cal);

  function paint() {
    const [y, m, d] = st.value.split("-");
    day.val.textContent = d; month.val.textContent = monthName(Number(m)); year.val.textContent = y;
    cal.min = st.min; cal.max = st.max; cal.value = st.value;
    last.disabled = st.value >= st.max;
    play.innerHTML = st.playing ? PAUSE : PLAY;
    relabel();
  }
  function relabel() {
    for (const b of root.querySelectorAll("[data-label]")) { const s = text(b.dataset.label); b.title = s; b.setAttribute("aria-label", s); }
    for (const v of [day, month, year]) { v.val.title = text("calendar"); v.val.setAttribute("aria-label", `${text("calendar")}: ${st.value}`); }
  }
  async function tick() {
    if (!st.playing) return;
    if (st.value >= st.max) { stop(); return; }
    const t0 = performance.now();
    await go(addDays(st.value, 1));
    if (st.playing) st.timer = setTimeout(tick, Math.max(0, 800 - (performance.now() - t0)));
  }
  function start() { if (st.value >= st.max) return; st.playing = true; paint(); tick(); }
  function stop() { st.playing = false; clearTimeout(st.timer); paint(); }

  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, select, textarea, dialog, .chart")) return;
    if (e.key === "ArrowLeft") go(addDays(st.value, -1));
    else if (e.key === "ArrowRight") go(addDays(st.value, 1));
  });

  paint();
  return {
    setRange(min, max) { st.min = min; st.max = max; st.value = clamp(st.value); paint(); },
    setValue(s) { st.value = clamp(s); paint(); },
    get value() { return st.value; },
    relabel: paint,
  };
}
