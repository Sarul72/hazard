/* "Mine dust and vegetation": the dust footprint of a coal mine in grass cover, read from the vegetation around it
 * (js/minedust_veg.js), inside its own box under the wind and dust model. The summer NDVI comes from Sentinel-2 L2A on
 * the Planetary Computer (js/aoi/stac.js), the wind rose from Open-Meteo's ERA5 archive, the camps from
 * data/camps.bin.gz; all free and without a key, all read in the browser. After a run a small panel lets the user
 * switch four layers: the wind of a chosen day and hour, the camps in the footprint, the satellite aerosol (AOD) of
 * that day, and the vegetation anomaly itself. */
import { el } from "./dom.js";
import { API, TZ, VEG_MINES } from "./config.js";
import { domain } from "./minedaily.js";
import { search, passes, bandOnGrid } from "./aoi/stac.js";
import { CLOUDY_SCL } from "./aoi/raster.js";
import { VEG, anomalyGrid, campsExposed, campsInSector, classify, deficits, footprintKm2, geometry, innerRingCells, reaches, sectorOf, sectorRingStats, spearman, windRose } from "./minedust_veg.js";
import { arrowLength, createViewCanvas, drawArrow, paintCamps } from "./mapmarks.js";

const TT = {
  mn: {
    veg_title: "Уурхайн тоосжилт ба ургамал",
    veg_help: "Уурхай, жил сонгоод «Тооцоолох». Зуны (6–8 сар) Sentinel-2 зургаас ургамлын NDVI-г салхины 16 чигээр, уурхайгаас 3–30 км зайгаар харьцуулж, салхи доод чигт ургамал дээр тогтсон тоосны ул мөр хэр хол үргэлжилж буйг тооцно. Тэр талбай дахь өвөлжөө, хаваржааг тоолно.",
    veg_mine: "Уурхай", veg_year: "Жил (6–8 сар)", veg_run: "Тооцоолох", veg_method: "Арга зүй",
    veg_fetch_sat: "Sentinel-2 зураг хайж байна…", veg_fetch_wind: "Салхины мэдээ (ERA5) татаж байна…", veg_compute: "Тооцоолж байна…", veg_done: "Бэлэн ({s} секунд).",
    veg_no_pass: "Энэ зун энэ газарт цэлмэг Sentinel-2 зураг олдсонгүй.", veg_no_wind: "Тухайн цагийн салхины мэдээ олдсонгүй.", veg_err: "Алдаа: ",
    veg_passes: "Зураг: {n} өнгөрөлт ({d}), үүлгүй {c}%. Ургамалтай нүд: {v}.",
    g_wind: "Салхи", g_camps: "Өвөлжөө, хаваржаа", g_aod: "AOD (хиймэл дагуул)", g_veg: "Тоосонд өртсөн ургамал",
    veg_date: "Огноо", veg_hour: "Цаг (УБ)",
    veg_wind_line: "{t}: салхи {u} м/с, {from}-с ({deg}°). Тоос {to} зүг рүү, тэр чигийн ул мөр {r} км.", veg_wind_none: "Салхи сул: тэр цагт тоос зөөхгүй (< 6 м/с).",
    veg_rose: "Зуны тоос зөөх салхины гол чиг: {dirs}.",
    veg_camps_all: "Ул мөрийн талбайд (бүх тоостой чиг)", veg_camps_hour: "Сонгосон цагийн чигт", veg_parcels: "кадастрын нэгж", veg_herders: "малчны цэг",
    veg_camps_hint: "Байршил ≈1 км-ээр бүдүүлэгжсэн. Хоёр бүртгэл давхцаж болох тул нэмж болохгүй.",
    veg_aod_line: "MODIS MAIAC аэрозол (1 км), сонгосон огноо: агаар дахь бүх тоос, зөвхөн уурхайных биш.",
    veg_reach: "Тоостой чиг: {list}.", veg_area: "Ул мөрийн талбай {a} км² (3 км-ээс цааш).", veg_none: "3 км-ээс цааш салхи доод чигт NDVI-ийн дутагдал илрээгүй.", veg_sparse: "Ургамал хэт сийрэг: дотор цагирагийн 16 секторын {k}-д л хангалттай ургамал байна, тул энэ уурхайд тогтсон тоосыг энэ аргаар хэмжих боломжгүй.", veg_camps_none: "Өвөлжөө, хаваржааны өгөгдөл ачаалагдсангүй.",
    veg_rho: "Шалгалт: салхины давтамж ба дотор цагирагийн NDVI зөрүүний Spearman ρ = {rho}.", veg_rho_ok: "Сөрөг: салхи их чигт ургамал бага, арга энэ уурхайд ажиллаж байна.", veg_rho_weak: "Сул эсвэл сөрөг биш: ул мөрийг салхинаас биш өөр шалтгаанаар тайлбарлаж болно; болгоомжтой уншина уу.",
    veg_limits: "NDVI нь хөрс, бэлчээр, зам зэргээс ч өөрчлөгдөнө. Тор 100 м. Зөрүү харьцангуй, г/м² биш. Тоос их жилд ургамал бага байх ч бусад шалтгаан байж болно.",
    cls_dusty: "тоостой", cls_unclear: "тодорхойгүй", cls_clear: "цэвэр", veg_km: "км",
    dirs16: ["хойд", "хойд-зүүн хойд", "зүүн хойд", "зүүн-зүүн хойд", "зүүн", "зүүн-зүүн өмнөд", "зүүн өмнөд", "өмнөд-зүүн өмнөд", "өмнөд", "өмнөд-баруун өмнөд", "баруун өмнөд", "баруун-баруун өмнөд", "баруун", "баруун-баруун хойд", "баруун хойд", "хойд-баруун хойд"],
  },
  en: {
    veg_title: "Mine dust and vegetation",
    veg_help: "Pick a mine and a year, then Compute. From the summer (June to August) Sentinel-2 images the NDVI of the vegetation is compared across 16 wind sectors and 3 to 30 km from the mine, to see how far the mark of dust settled on the plants runs downwind. The winter and spring camps in that area are counted.",
    veg_mine: "Mine", veg_year: "Year (June–August)", veg_run: "Compute", veg_method: "Method",
    veg_fetch_sat: "Searching Sentinel-2 passes…", veg_fetch_wind: "Loading the wind (ERA5)…", veg_compute: "Computing…", veg_done: "Ready ({s} s).",
    veg_no_pass: "No clear Sentinel-2 image of this area that summer.", veg_no_wind: "No wind data for that hour.", veg_err: "Error: ",
    veg_passes: "Imagery: {n} passes ({d}), {c}% cloud-free. Vegetation cells: {v}.",
    g_wind: "Wind", g_camps: "Winter and spring camps", g_aod: "AOD (satellite)", g_veg: "Dust-affected vegetation",
    veg_date: "Date", veg_hour: "Hour (UB)",
    veg_wind_line: "{t}: wind {u} m/s from the {from} ({deg}°). Dust goes {to}; the mark in that sector reaches {r} km.", veg_wind_none: "Light wind: no dust carried at that hour (< 6 m/s).",
    veg_rose: "Main dust-carrying wind of the summer toward: {dirs}.",
    veg_camps_all: "In the footprint (all dusty sectors)", veg_camps_hour: "In the sector of the chosen hour", veg_parcels: "cadastre parcels", veg_herders: "herder points",
    veg_camps_hint: "Positions are rounded to about 1 km. The two registers may overlap, so do not add them.",
    veg_aod_line: "MODIS MAIAC aerosol (1 km) of the chosen date: all dust in the air, not the mine's alone.",
    veg_reach: "Dusty sectors: {list}.", veg_area: "Footprint {a} km² (beyond 3 km).", veg_none: "No NDVI deficit downwind beyond 3 km.", veg_sparse: "Vegetation too sparse: only {k} of the 16 inner-ring sectors hold enough vegetation, so settled dust cannot be measured this way at this mine.", veg_camps_none: "The camp data did not load.",
    veg_rho: "Check: Spearman ρ between wind share and inner-ring NDVI deficit = {rho}.", veg_rho_ok: "Negative: less vegetation where the wind blows more; the method holds for this mine.", veg_rho_weak: "Weak or not negative: the mark may come from something other than the wind; read with care.",
    veg_limits: "NDVI also changes with soil, grazing and roads. 100 m cells. The contrast is relative, not g/m². Less vegetation in a dusty year can have other causes.",
    cls_dusty: "dusty", cls_unclear: "unclear", cls_clear: "clear", veg_km: "km",
    dirs16: ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"],
  },
};

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + "T00:00:00Z") + n * 86400000);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const cloudOf = (it) => it.properties["eo:cloud_cover"] ?? 100;
const asIs = (v) => v;
const ndviQuery = (item) => ({
  expression: Number(item.properties["s2:processing_baseline"]) >= 4 ? "(B08*1.0-B04)/(B08*1.0+B04-2000)" : "(B08*1.0-B04)/(B08*1.0+B04)",
  asset_as_band: "True", rescale: "-1,1",
});
const fromNdvi = (v) => -1 + (v * 2) / 255;
const CLS_COLOR = ["rgba(120,200,120,.35)", "rgba(230,200,80,.45)", "rgba(190,90,30,.55)"];

/** One band of every frame of a pass on the grid: later frames fill what earlier ones did not cover. */
async function band(g, items, query, decode) {
  let out = null;
  for (const it of items) out = await bandOnGrid(g, it, query, decode, out);
  return out ?? new Float32Array(g.w * g.h).fill(NaN);
}

/** `fn(item, index)` over the items, at most `n` at a time. */
async function inBatches(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } }));
}

async function getJson(url, tries = 3) {
  for (let k = 0; ; k++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (k + 1 >= tries || (r.status !== 429 && r.status < 500)) throw new Error(`${r.status} ${(await r.json().catch(() => ({}))).reason ?? url.split("?")[0]}`);
    await new Promise((ok) => setTimeout(ok, 4000 * (k + 1)));
  }
}

export function createVegBox({ map, getLang, campsFor, requestSat, onMethods, onResult = () => {}, busy = () => {} }) {
  const L = window.L;
  const t = (k) => (TT[getLang()] && TT[getLang()][k]) ?? TT.mn[k] ?? k;
  const pane = map.getPane("mineVeg") ?? map.createPane("mineVeg");
  pane.style.zIndex = 418;
  pane.style.pointerEvents = "none";
  const thisYear = new Date().getUTCFullYear();
  const st = {
    mineId: VEG_MINES[0].id, year: thisYear - 1, running: false, status: "", error: false, res: null, active: false,
    date: addDays(iso(Date.now()), -1), hour: 12, hourRes: null, hourBusy: false, hourToken: 0, runToken: 0,
    show: { wind: true, camps: true, aod: false, veg: true },
    overlay: null, wedges: L.layerGroup(), hourWedge: L.layerGroup(),
  };
  const mine = () => VEG_MINES.find((m) => m.id === st.mineId) ?? VEG_MINES[0];
  const mineName = (m) => (getLang() === "mn" ? m.mn : m.en);
  const campsShown = () => {
    const r = st.res; if (!r) return [];
    const hour = st.hourRes?.sector;
    return fin(hour) ? campsInSector(r.camps, r.mine, hour, r.reach[hour]).points : r.exposed.points;
  };
  const campMarks = createViewCanvas(map, "vegCamps", 446, (ctx, v) => paintCamps(ctx, v, campsShown(), () => "rgba(255,210,120,.95)"));
  const windMarks = createViewCanvas(map, "vegWind", 456, (ctx, v) => {
    const h = st.hourRes, r = st.res;
    if (!r || !h || !fin(h.speed)) return;
    const [x, y] = v.project(r.mine.lat, r.mine.lon);
    drawArrow(ctx, x, y - 26, (h.from + 180) % 360, arrowLength(h.speed) * 1.6, 1.4);
  });
  const box = el("section", { class: "md-box veg-box" });

  /* ---------------------------------------------------------------- run */
  async function run() {
    const m = mine();
    st.running = true; st.error = false; st.res = null; st.hourRes = null; st.status = ""; paint(); render();
    const t0 = performance.now();
    busy(true);
    try {
      const dom = domain(m.lat, m.lon, VEG.radiusKm, VEG.cellM), e = dom.extent;
      const grid = { west: e.w, north: e.n, dx: (e.e - e.w) / dom.w, dy: (e.n - e.s) / dom.h, w: dom.w, h: dom.h };
      // the archive lags about five days behind today, so the window of the current year ends where the archive does
      const from = `${st.year}-06-15`, lastDay = addDays(iso(Date.now()), -6), to = `${st.year}-08-31` < lastDay ? `${st.year}-08-31` : lastDay;
      if (to <= from) throw new Error(t("veg_no_pass"));
      const my = ++st.runToken;
      st.status = { k: "veg_fetch_sat" }; render();
      const items = await search("sentinel-2-l2a", e, from, to);
      const ps = passes(items);
      if (!ps.length) throw new Error(t("veg_no_pass"));
      // passes ranked by the share of clear ground on a coarse grid, as the dust check does; the scene's own cloud figure
      // speaks of a 100 km tile, not of these 60 km
      const coarse = { ...grid, dx: grid.dx * 3, dy: grid.dy * 3, w: dom.w / 3, h: dom.h / 3 };
      // a few passes at a time, so that the data API is not asked for the whole summer at once; a pass that fails to read
      // ranks as if it were cloudy
      const shares = new Array(ps.length).fill(0);
      await inBatches(ps, 4, async (p, i) => {
        const scl = await band(coarse, p.items, { assets: "SCL", rescale: "0,255" }, asIs).catch(() => null);
        if (!scl) return;
        let ok = 0; for (const v of scl) if (!Number.isNaN(v) && !CLOUDY_SCL.has(v)) ok++;
        shares[i] = ok / scl.length;
      });
      if (my !== st.runToken) return;
      const ranked = ps.map((p, i) => ({ p, s: shares[i] })).filter((x) => x.s > 0.05).sort((a, b) => b.s - a.s || b.p.t0 - a.p.t0);
      if (!ranked.length) throw new Error(t("veg_no_pass"));
      // the gaps of the clearest pass are filled only from passes within 20 days of it: the grass changes through the
      // summer by more than the deficit the method looks for
      const order = ranked.filter((x) => Math.abs(x.p.t0 - ranked[0].p.t0) <= 20 * 86400000);
      const N = dom.w * dom.h, ndvi = new Float32Array(N).fill(NaN), veg = new Uint8Array(N), seenMask = new Uint8Array(N), used = [];
      let seen = 0, vegN = 0;
      for (const { p } of order.slice(0, 3)) {
        const scl = await band(grid, p.items, { assets: "SCL", rescale: "0,255" }, asIs);
        let nd = null; for (const it of p.items) nd = await bandOnGrid(grid, it, ndviQuery(it), fromNdvi, nd);
        let filled = 0;
        for (let i = 0; i < N; i++) {
          if (seenMask[i]) continue;
          const c = scl[i];
          if (Number.isNaN(c) || CLOUDY_SCL.has(c)) continue;
          seenMask[i] = 1; seen++; filled++;
          if (c !== 6 && c !== 11 && fin(nd[i]) && nd[i] >= VEG.vegNdvi) { veg[i] = 1; ndvi[i] = nd[i]; vegN++; }
        }
        if (filled) used.push(p);
        if (seen / N >= 0.95) break;
      }
      if (!seen) throw new Error(t("veg_no_pass"));
      st.status = { k: "veg_fetch_wind" }; render();
      const q = new URLSearchParams({ latitude: m.lat.toFixed(3), longitude: m.lon.toFixed(3), start_date: from, end_date: to, timezone: TZ, wind_speed_unit: "ms", hourly: "wind_speed_10m,wind_direction_10m", models: "era5" });
      const w = await getJson(`${API.archive}?${q}`);
      if (my !== st.runToken) return;
      const rose = windRose(w.hourly.wind_speed_10m ?? [], w.hourly.wind_direction_10m ?? []);
      st.status = { k: "veg_compute" }; render();
      await new Promise((ok) => setTimeout(ok, 0));
      const geo = geometry(m, dom), nr = VEG.rings.length - 1;
      const stats = sectorRingStats(ndvi, veg, geo), def = deficits(stats, nr), reach = reaches(def), cls = classify(reach, rose);
      const inner = Array.from({ length: VEG.sectors }, (_, s) => def.deficit[s * nr]);
      const rho = spearman(Array.from(rose), inner);
      const camps = await campsFor?.(e).catch(() => null) ?? null;
      if (my !== st.runToken) return;
      const exposed = campsExposed(camps ?? [], m, reach, cls);
      const res = { mine: m, year: st.year, dom, geo, ndvi, veg, stats, def, rose, reach, cls, rho, camps, exposed, area: footprintKm2(reach, cls), anomaly: anomalyGrid(ndvi, veg, geo, def.ringMedian),
        measured: innerRingCells(stats, nr), passes: used.map((p) => iso(p.t0)), cloud: Math.round(100 * seen / N), vegN };
      res.image = anomalyCanvas(res).toDataURL(); // drawn once, not on every paint
      st.res = res;
      window.vegResult = res; // the last result, for checks in the browser console
      st.status = { k: "veg_done", v: { s: Math.round((performance.now() - t0) / 1000) } };
      paint();
      // the whole 30 km domain in view, clear of the side panel on a wide screen
      map.fitBounds([[e.s, e.w], [e.n, e.e]], { paddingTopLeft: [window.innerWidth > 1000 ? 360 : 10, 70], paddingBottomRight: [10, 110] });
      onResult();
      loadHour();
    } catch (err) {
      console.error(err);
      st.error = true;
      st.status = err.message === t("veg_no_pass") ? { k: "veg_no_pass" } : { k: "veg_err", v: err.message };
    }
    busy(false);
    st.running = false;
    render();
  }

  /** The wind at the mine for the chosen day and hour: the forecast service within 85 days, the archive before. */
  async function loadHour() {
    const r = st.res;
    if (!r) return;
    const my = ++st.hourToken;
    st.hourBusy = true; st.hourRes = null; render();
    try {
      const age = (Date.now() - Date.parse(st.date + "T00:00:00Z")) / 86400000;
      const api = age > 85 ? API.archive : API.forecast;
      const q = new URLSearchParams({ latitude: r.mine.lat.toFixed(3), longitude: r.mine.lon.toFixed(3), start_date: st.date, end_date: st.date, timezone: TZ, wind_speed_unit: "ms", hourly: "wind_speed_10m,wind_direction_10m" });
      const j = await getJson(`${api}?${q}`);
      if (my !== st.hourToken) return;
      const u = j.hourly?.wind_speed_10m?.[st.hour], d = j.hourly?.wind_direction_10m?.[st.hour];
      if (!fin(u) || !fin(d)) throw new Error(t("veg_no_wind"));
      st.hourRes = { speed: u, from: d, sector: u >= VEG.onset ? sectorOf((d + 180) % 360) : null, time: j.hourly.time[st.hour] };
    } catch (err) {
      if (my !== st.hourToken) return;
      console.error(err);
      st.hourRes = { error: "veg_no_wind" }; // whatever the service said, the user needs to know only that the hour has no wind
    }
    st.hourBusy = false;
    if (st.show.aod) requestSat?.({ key: "aod_maiac", on: true, date: st.date });
    paint(); render();
  }

  /* ---------------------------------------------------------------- map */
  function anomalyCanvas(r) {
    const { w, h } = r.dom, cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data;
    for (let k = 0; k < r.anomaly.length; k++) {
      const a = r.anomaly[k];
      if (!fin(a)) continue;
      if (a <= -0.02) { const al = Math.min(1, (-a - 0.02) / 0.13) * 0.8; px[k * 4] = 150; px[k * 4 + 1] = 90; px[k * 4 + 2] = 30; px[k * 4 + 3] = Math.round(255 * Math.max(0.2, al)); }
      else if (a > 0.02) { px[k * 4] = 60; px[k * 4 + 1] = 160; px[k * 4 + 2] = 80; px[k * 4 + 3] = 64; }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  /** A ring sector as a polygon from the inner edge to `outKm`. */
  function wedge(m, s, outKm, style) {
    const w = 360 / VEG.sectors, a0 = s * w - w / 2, a1 = s * w + w / 2, pts = [];
    const at = (deg, km) => [m.lat + (km * Math.cos((deg * Math.PI) / 180)) / 110.574, m.lon + (km * Math.sin((deg * Math.PI) / 180)) / (111.32 * Math.cos((m.lat * Math.PI) / 180))];
    for (let a = a0; a <= a1 + 1e-9; a += w / 6) pts.push(at(a, outKm));
    for (let a = a1; a >= a0 - 1e-9; a -= w / 6) pts.push(at(a, VEG.rings[0]));
    return L.polygon(pts, { pane: "mineVeg", interactive: false, weight: 1, ...style });
  }
  function paint() {
    st.overlay?.remove(); st.overlay = null;
    st.wedges.clearLayers(); st.wedges.remove();
    st.hourWedge.clearLayers(); st.hourWedge.remove();
    const r = st.res;
    campMarks.show(Boolean(r) && st.active && st.show.camps);
    windMarks.show(Boolean(r) && st.active && st.show.wind && Boolean(st.hourRes) && fin(st.hourRes.speed));
    if (!r || !st.active) return;
    const e = r.dom.extent, bounds = [[e.s, e.w], [e.n, e.e]];
    if (st.show.veg) {
      st.overlay = L.imageOverlay(r.image, bounds, { pane: "mineVeg", interactive: false }).addTo(map);
      for (let s = 0; s < VEG.sectors; s++) if (r.reach[s] > 0) wedge(r.mine, s, r.reach[s], { color: CLS_COLOR[r.cls[s]], weight: 2, fillColor: CLS_COLOR[r.cls[s]], fillOpacity: 0.12 }).addTo(st.wedges);
      st.wedges.addTo(map);
    }
    const h = st.hourRes;
    if (st.show.wind && fin(h?.sector)) {
      wedge(r.mine, h.sector, Math.max(r.reach[h.sector], VEG.rings[0] + 1), { color: "#fff", dashArray: "4 4", fillColor: "#fff", fillOpacity: 0.12 }).addTo(st.hourWedge);
      st.hourWedge.addTo(map);
    }
  }

  /* -------------------------------------------------------------- panel */
  const dir16 = (s) => t("dirs16")[s];
  function windLines() {
    const h = st.hourRes, r = st.res, out = [];
    if (st.hourBusy) out.push(t("veg_fetch_wind"));
    else if (h?.error) out.push(t(h.error));
    else if (h && !fin(h.sector)) out.push(fill(t("veg_wind_line"), { t: h.time.replace("T", " "), u: h.speed.toFixed(1), from: dir16(sectorOf(h.from)), deg: Math.round(h.from), to: dir16(sectorOf((h.from + 180) % 360)), r: r.reach[sectorOf((h.from + 180) % 360)].toFixed(0) }) + " " + t("veg_wind_none"));
    else if (h) out.push(fill(t("veg_wind_line"), { t: h.time.replace("T", " "), u: h.speed.toFixed(1), from: dir16(sectorOf(h.from)), deg: Math.round(h.from), to: dir16(h.sector), r: r.reach[h.sector].toFixed(0) }));
    const top = Array.from(r.rose).map((v, s) => [v, s]).sort((a, b) => b[0] - a[0]).filter((x) => x[0] >= 1 / VEG.sectors).slice(0, 3);
    out.push(fill(t("veg_rose"), { dirs: top.length ? top.map(([v, s]) => `${dir16(s)} ${Math.round(100 * v)}%`).join(", ") : "—" }));
    return out;
  }
  function vegLines() {
    const r = st.res, out = [];
    const dusty = []; for (let s = 0; s < VEG.sectors; s++) if (r.cls[s] === 2) dusty.push(`${dir16(s)} ${r.reach[s].toFixed(0)} ${t("veg_km")}`);
    if (r.measured < VEG.sectors / 2) out.push(fill(t("veg_sparse"), { k: r.measured }));
    else out.push(dusty.length ? fill(t("veg_reach"), { list: dusty.join(", ") }) + " " + fill(t("veg_area"), { a: r.area.toFixed(0) }) : t("veg_none"));
    if (fin(r.rho) && r.measured >= VEG.sectors / 2) out.push(fill(t("veg_rho"), { rho: r.rho.toFixed(2) }) + " " + t(r.rho < -0.2 ? "veg_rho_ok" : "veg_rho_weak"));
    out.push(fill(t("veg_passes"), { n: r.passes.length, d: r.passes.join(", "), c: r.cloud, v: r.vegN.toLocaleString() }));
    return out;
  }
  function group(key, lines, extra = null) {
    const input = el("input", { type: "checkbox", checked: st.show[key], onchange: (e) => { st.show[key] = e.target.checked; if (key === "aod") requestSat?.({ key: "aod_maiac", on: st.show.aod, date: st.date }); paint(); } });
    return el("div", { class: "veg-group" }, el("label", { class: "check" }, input, el("b", { text: t("g_" + key) })), extra, ...lines.map((x) => el("p", { class: "md-line", text: x })));
  }
  function render() {
    const r = st.res, years = []; for (let y = 2017; y <= thisYear; y++) years.push(y);
    const hourForm = r && el("div", { class: "md-form" },
      el("label", {}, el("span", { text: t("veg_date") }), el("input", { class: "field", type: "date", value: st.date, min: "1940-01-01", max: addDays(iso(Date.now()), 14), onchange: (e) => { if (e.target.value) { st.date = e.target.value; loadHour(); } } })),
      el("label", {}, el("span", { text: t("veg_hour") }), el("select", { class: "field", onchange: (e) => { st.hour = Number(e.target.value); loadHour(); } }, ...Array.from({ length: 24 }, (_, h) => el("option", { value: h, text: String(h).padStart(2, "0") + ":00", selected: h === st.hour })))));
    const ex = r?.exposed, hs = r && fin(st.hourRes?.sector) ? campsInSector(r.camps, r.mine, st.hourRes.sector, r.reach[st.hourRes.sector]) : null;
    box.replaceChildren(...[
      el("h4", { class: "md-title", text: t("veg_title") }),
      el("p", { class: "note", text: t("veg_help") }),
      el("div", { class: "md-form" },
        el("label", {}, el("span", { text: t("veg_mine") }), el("select", { class: "field", onchange: (e) => { st.mineId = e.target.value; const m = mine(); map.setView([m.lat, m.lon], 9); } }, ...VEG_MINES.map((m) => el("option", { value: m.id, text: mineName(m), selected: m.id === st.mineId })))),
        el("label", {}, el("span", { text: t("veg_year") }), el("select", { class: "field", onchange: (e) => { st.year = Number(e.target.value); } }, ...years.map((y) => el("option", { value: y, text: y, selected: y === st.year }))))),
      el("div", { class: "btnrow" }, el("button", { class: "btn aoi-run", type: "button", text: t("veg_run"), disabled: st.running, onclick: run }), el("button", { class: "btn small", type: "button", text: t("veg_method"), onclick: () => onMethods?.("veg") })),
      st.status && el("p", { class: "aoi-status" + (st.error ? " err" : ""), role: "status", text: st.status.v && typeof st.status.v === "object" ? fill(t(st.status.k), st.status.v) : t(st.status.k) + (typeof st.status.v === "string" ? st.status.v : "") }),
      r && el("section", { class: "veg-panel" },
        el("p", { class: "md-line" }, el("b", { text: `${mineName(r.mine)} · ${r.year}` })),
        group("wind", windLines(), hourForm),
        group("camps", r.camps === null ? [t("veg_camps_none")] : [
          `${t("veg_camps_all")}: ${ex.parcels} ${t("veg_parcels")}, ${ex.herders} ${t("veg_herders")}.`,
          hs ? `${t("veg_camps_hour")} (${dir16(st.hourRes.sector)}): ${hs.parcels} ${t("veg_parcels")}, ${hs.herders} ${t("veg_herders")}.` : null,
          t("veg_camps_hint"),
        ].filter(Boolean)),
        group("aod", [t("veg_aod_line")]),
        group("veg", vegLines(), el("p", { class: "veg-key" }, el("i", { style: "background:rgba(150,90,30,.8)" }), t("cls_dusty"), " ", el("i", { style: "background:rgba(230,200,80,.6)" }), t("cls_unclear"), " ", el("i", { style: "background:rgba(60,160,80,.4)" }), t("cls_clear")))),
      el("p", { class: "note small", text: t("veg_limits") }),
    ].filter(Boolean));
  }
  render();

  return {
    el: box,
    render,
    show(on) {
      st.active = on;
      paint();
      if (on && !st.res) { const m = mine(); map.setView([m.lat, m.lon], 9); }
      if (st.show.aod && st.res) requestSat?.(on ? { key: "aod_maiac", on: true, date: st.date } : { key: "aod_maiac", on: false }); // the overlay comes and goes with the box
    },
  };
}
