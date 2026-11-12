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
import { backdrop } from "./aoi/backdrop.js";
import { VEG, anomalyGrid, campsExposed, campsInSector, classify, deficits, footprintKm2, geometry, innerRingCells, reaches, sectorOf, sectorRingStats, spearman, windRose } from "./minedust_veg.js";
import { arrowLength, createViewCanvas, drawArrow, paintCamps } from "./mapmarks.js";
import { csv } from "./formats.js";

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
    px_heavy: "Их тоостой ургамал (NDVI −0.10-аас доош)", px_mid: "Дунд тоостой ургамал (−0.10…−0.05)", px_light: "Бага тоостой ургамал (−0.05…−0.02)", px_clean: "Цэвэр ургамал (−0.02-оос дээш)", px_bare: "Ургамалгүй, ус, үүл", px_none: "Торны гадна",
    veg_classes: "Пиксел бүрийн ангилал (100 м): ургамлын NDVI-ийн зөрүү ижил зайн цагирагийн медианаас.", veg_class_area: "{n}: {a} км²", veg_window: "Томруулж харах", veg_window_title: "Уурхайн тоосжилт ба ургамал",
    veg_camps_px: "Өвөлжөө, хаваржааг байрлалынх нь 1 км² дэх ургамлын ангиллаар (3–30 км):", veg_camps_on: "{n} дээр", veg_camps_total: "3–30 км-д нийт", veg_camps_dusted: "Тоостой ургамал дээр (их, дунд, бага) нийт",
    veg_dl_sectors: "Сектор, цагирагийн хүснэгт", veg_dl_camps: "Өвөлжөө, хаваржаа ангиллаар", veg_dl_wind: "Зуны цаг тутмын салхи", veg_dl_title: "Уурхайн тоосжилт ба ургамал", veg_dl_period: "Sentinel-2 {d}; салхи {a} – {b}",
    veg_nd_note: "Ангиллын растерт 0 = торны гадна (3 км дотор эсвэл 30 км-ээс цааш, NoData), 1 = ургамалгүй, ус, үүл.", veg_b_anom: "NDVI-ийн зөрүү = ургамлын пикселийн NDVI − ижил зайн цагирагийн медиан; −9999 = ургамал биш", veg_b_ndvi: "Зуны NDVI (ургамлын пиксел); −9999 = ургамал биш",
    veg_e_rel: "Зөрүү харьцангуй (NDVI-ийн нэгж), г/м² биш; хөрс, бэлчээр, зам ч NDVI-г өөрчилнө.", veg_e_px: "Пиксел 100 м; өвөлжөөний байршил ≈1 км-ээр бүдүүлэгжсэн тул ангилал нь 1 км² талбайн дундаж.",
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
    px_heavy: "Heavily dusted vegetation (NDVI below −0.10)", px_mid: "Moderately dusted vegetation (−0.10 to −0.05)", px_light: "Lightly dusted vegetation (−0.05 to −0.02)", px_clean: "Clean vegetation (above −0.02)", px_bare: "No vegetation, water or cloud", px_none: "Outside the grid",
    veg_classes: "Class of every 100 m pixel: the NDVI of the vegetation against the median of its ring.", veg_class_area: "{n}: {a} km²", veg_window: "Open in a window", veg_window_title: "Mine dust and vegetation",
    veg_camps_px: "Winter and spring camps by the vegetation class of their 1 km² (3–30 km):", veg_camps_on: "On {n}", veg_camps_total: "All within 3–30 km", veg_camps_dusted: "On dusted vegetation (heavy, moderate, light) in all",
    veg_dl_sectors: "Sector and ring table", veg_dl_camps: "Camps by class", veg_dl_wind: "Hourly summer wind", veg_dl_title: "Mine dust and vegetation", veg_dl_period: "Sentinel-2 {d}; wind {a} – {b}",
    veg_nd_note: "In the class raster 0 = outside the grid (inside 3 km or beyond 30 km, NoData), 1 = no vegetation, water or cloud.", veg_b_anom: "NDVI anomaly = NDVI of the vegetation pixel − median of its ring; −9999 = not vegetation", veg_b_ndvi: "Summer NDVI (vegetation pixels); −9999 = not vegetation",
    veg_e_rel: "The contrast is relative (NDVI units), not g/m²; soil, grazing and roads change NDVI too.", veg_e_px: "Pixels are 100 m; camp positions are rounded to about 1 km, so a camp's class is the mean of its 1 km².",
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
/** The class of every pixel of the result, from the NDVI anomaly of a vegetation pixel against the median of its ring. */
export const PX = [
  { code: 0, key: "none", color: [0, 0, 0], on: false, paint: false },
  { code: 1, key: "bare", color: [120, 120, 120], on: false, paint: true },
  { code: 2, key: "heavy", color: [110, 50, 15], on: true, paint: true },
  { code: 3, key: "mid", color: [170, 100, 40], on: true, paint: true },
  { code: 4, key: "light", color: [215, 165, 95], on: true, paint: true },
  { code: 5, key: "clean", color: [70, 150, 80], on: true, paint: true },
];
export function pixelClass(anomaly, inRing, isVeg) {
  if (!inRing) return 0;
  if (!isVeg || !Number.isFinite(anomaly)) return 1;
  return anomaly <= -0.10 ? 2 : anomaly <= -0.05 ? 3 : anomaly <= -0.02 ? 4 : 5;
}

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

export function createVegBox({ map, getLang, campsFor, requestSat, onMethods, viewer = null, onResult = () => {}, busy = () => {} }) {
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
    px: Object.fromEntries(PX.map((c) => [c.key, c.on])), canvas: null, drawn: 0,
    overlay: null, wedges: L.layerGroup(), hourWedge: L.layerGroup(),
  };
  const mine = () => VEG_MINES.find((m) => m.id === st.mineId) ?? VEG_MINES[0];
  const mineName = (m) => (getLang() === "mn" ? m.mn : m.en);
  const campsShown = () => {
    const r = st.res; if (!r) return [];
    const hour = st.hourRes?.sector;
    return (r.camps ?? []).filter((c) => c.cls > 0 && (!fin(hour) || c.sector === hour));
  };
  const campTint = (c) => { const k = PX[c.cls]?.color ?? [255, 210, 120]; return `rgba(${k[0]},${k[1]},${k[2]},.95)`; };
  const campMarks = createViewCanvas(map, "vegCamps", 446, (ctx, v) => paintCamps(ctx, v, campsShown(), campTint));
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
      const hours = { time: w.hourly.time ?? [], speed: w.hourly.wind_speed_10m ?? [], dir: w.hourly.wind_direction_10m ?? [], from, to };
      st.status = { k: "veg_compute" }; render();
      await new Promise((ok) => setTimeout(ok, 0));
      const geo = geometry(m, dom), nr = VEG.rings.length - 1;
      const stats = sectorRingStats(ndvi, veg, geo), def = deficits(stats, nr), reach = reaches(def), cls = classify(reach, rose);
      const inner = Array.from({ length: VEG.sectors }, (_, s) => def.deficit[s * nr]);
      const rho = spearman(Array.from(rose), inner);
      const camps = await campsFor?.(e).catch(() => null) ?? null;
      if (my !== st.runToken) return;
      const exposed = campsExposed(camps ?? [], m, reach, cls);
      const res = { mine: m, year: st.year, dom, geo, ndvi, veg, stats, def, rose, hours, reach, cls, rho, camps, exposed, area: footprintKm2(reach, cls), anomaly: anomalyGrid(ndvi, veg, geo, def.ringMedian),
        measured: innerRingCells(stats, nr), passes: used.map((p) => iso(p.t0)), cloud: Math.round(100 * seen / N), vegN };
      res.codes = new Uint8Array(N);
      for (let i = 0; i < N; i++) res.codes[i] = pixelClass(res.anomaly[i], geo.ring[i] >= 0, veg[i] === 1);
      res.areas = new Float64Array(PX.length); const cellKm2 = (VEG.cellM / 1000) ** 2;
      for (let i = 0; i < N; i++) res.areas[res.codes[i]] += cellKm2;
      res.grid = { west: e.w, north: e.n, dx: grid.dx, dy: grid.dy, w: dom.w, h: dom.h, scale: VEG.cellM };
      res.campsByClass = classifyCamps(res);
      classCanvas(res); // drawn once per set of switched-on classes
      st.res = res;
      window.vegResult = res; // the last result, for checks in the browser console
      st.status = { k: "veg_done", v: { s: Math.round((performance.now() - t0) / 1000) } };
      paint();
      // the whole 30 km domain in view, clear of the side panel on a wide screen
      map.fitBounds([[e.s, e.w], [e.n, e.e]], { paddingTopLeft: [window.innerWidth > 1000 ? 360 : 10, 70], paddingBottomRight: [10, 110] });
      onResult();
      openView();
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
  /** Each camp by the vegetation of the 1 km² around its (rounded) position: the mean anomaly of the vegetation
   * pixels there, in the same classes as the pixels. Returns counts per class; writes `cls`, `sector` and `km` on the camps. */
  function classifyCamps(r) {
    const g = r.grid, half = 5, counts = PX.map(() => ({ parcels: 0, herders: 0, n: 0 }));
    for (const c of r.camps ?? []) {
      const col = Math.floor((c.lon - g.west) / g.dx), row = Math.floor((g.north - c.lat) / g.dy);
      let sum = 0, nVeg = 0, inRing = false;
      for (let y = row - half; y <= row + half; y++) for (let x = col - half; x <= col + half; x++) {
        if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
        const i = y * g.w + x;
        if (r.geo.ring[i] >= 0) inRing = true;
        if (r.veg[i] && fin(r.anomaly[i])) { sum += r.anomaly[i]; nVeg++; }
      }
      const b = bearingKmOf(r.mine, c);
      c.sector = b.sector; c.km = b.km;
      c.cls = pixelClass(nVeg >= 10 ? sum / nVeg : NaN, inRing, nVeg >= 10);
      counts[c.cls].parcels += c.parcels ?? 0; counts[c.cls].herders += c.herders ?? 0; counts[c.cls].n++;
    }
    return counts;
  }
  function bearingKmOf(m, c) {
    const dy = (c.lat - m.lat) * 110.574, dx = (c.lon - m.lon) * 111.32 * Math.cos((m.lat * Math.PI) / 180);
    const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    return { sector: sectorOf(bearing), km: Math.hypot(dx, dy), bearing };
  }

  /* ---------------------------------------------------------- downloads */
  const CLS_KEY = ["clear", "unclear", "dusty"];
  function sectorsCsv(r) {
    const nr = VEG.rings.length - 1, rows = [];
    for (let s = 0; s < VEG.sectors; s++) for (let k = 0; k < nr; k++) rows.push([s, dir16(s), (s * 22.5).toFixed(1), VEG.rings[k], VEG.rings[k + 1], r.stats.count[s * nr + k],
      fin(r.stats.mean[s * nr + k]) ? r.stats.mean[s * nr + k].toFixed(4) : "", fin(r.def.ringMedian[k]) ? r.def.ringMedian[k].toFixed(4) : "", fin(r.def.deficit[s * nr + k]) ? r.def.deficit[s * nr + k].toFixed(4) : "", r.def.thr[k].toFixed(4),
      r.rose[s].toFixed(4), r.reach[s], CLS_KEY[r.cls[s]]]);
    return csv(["sector", "direction", "centre_deg", "ring_from_km", "ring_to_km", "veg_pixels", "mean_ndvi", "ring_median_ndvi", "deficit", "threshold", "wind_share", "reach_km", "sector_class"], rows);
  }
  function campsCsv(r) {
    const rows = (r.camps ?? []).map((c) => [c.lat.toFixed(2), c.lon.toFixed(2), c.parcels, c.herders, c.km.toFixed(1), c.sector, dir16(c.sector), c.cls, PX[c.cls].key, CLS_KEY[r.cls[c.sector]]]);
    return csv(["lat", "lon", "cadastre_parcels", "herder_points", "km_from_mine", "sector", "direction", "class_code", "class", "sector_class"], rows);
  }
  function windCsv(r) {
    const h = r.hours, rows = h.time.map((tm, i) => [tm, h.speed[i] ?? "", h.dir[i] ?? "", fin(h.speed[i]) && fin(h.dir[i]) && h.speed[i] >= VEG.onset ? dir16(sectorOf((h.dir[i] + 180) % 360)) : ""]);
    return csv(["time_local", "wind_speed_m_s", "wind_from_deg", "dust_toward"], rows);
  }
  /** The result for the GIS downloads (js/aoi/files.js): the class raster, the anomaly and NDVI values, and three CSV
   * tables of its own (sectors, camps, wind). */
  function layer() {
    const r = st.res;
    if (!r) return null;
    const g = r.grid, e = r.dom.extent, en = (k) => TT.en[k] ?? k, year = r.year, stamp = `${r.mine.id}_${year}`;
    const no = (a, mask) => Float32Array.from(a, (v, i) => (mask[i] && fin(v) ? v : -9999));
    const dusted = r.campsByClass.slice(2, 5).reduce((o, c) => ({ parcels: o.parcels + c.parcels, herders: o.herders + c.herders }), { parcels: 0, herders: 0 });
    const lines = [...vegLines(), ...windLines(), `${t("veg_camps_dusted")}: ${dusted.parcels} ${t("veg_parcels")}, ${dusted.herders} ${t("veg_herders")}.`];
    return {
      hazard: "minedust", stamp, title: `${t("veg_dl_title")} · ${mineName(r.mine)}`, titleEn: `Mine dust and vegetation, ${r.mine.en}`,
      period: fill(t("veg_dl_period"), { d: r.passes.join(", "), a: r.hours.from, b: r.hours.to }), periodShort: `${year}_summer`,
      grid: g, scale: VEG.cellM, km2: r.areas.slice(1).reduce((a, b) => a + b, 0), box: { s: e.s, n: e.n, w: e.w, e: e.e },
      codes: r.codes, noData: 0, missing: [0, 1], noDataNote: t("veg_nd_note"),
      classes: PX.map((c) => ({ code: c.code, key: c.key, mn: t("px_" + c.key), en: en("px_" + c.key), color: c.color, vector: c.code >= 2, paint: c.paint })),
      bands: [{ name: "ndvi_anomaly", data: no(r.anomaly, r.veg), about: t("veg_b_anom") }, { name: "ndvi", data: no(r.ndvi, r.veg), about: t("veg_b_ndvi") }],
      meta: { mine: r.mine.en, mine_lat: r.mine.lat, mine_lon: r.mine.lon, year, sentinel2_passes: r.passes.join(" "), seen_pct: r.cloud, measured_inner_sectors: r.measured,
        dusty_sectors: Array.from(r.cls).map((c, s) => (c === 2 ? TT.en.dirs16[s] + " " + r.reach[s] + "km" : null)).filter(Boolean).join(" ") || "none", spearman_rho: fin(r.rho) ? r.rho.toFixed(3) : null,
        camps_on_dusted_vegetation_parcels: dusted.parcels, camps_on_dusted_vegetation_herder_points: dusted.herders, source: "Microsoft Planetary Computer: Sentinel-2 L2A; Open-Meteo ERA5; cadastre and herder points" },
      summaryEn: `Mongolia Hazard Watch: mine dust on vegetation around ${r.mine.en}, summer ${year}. NDVI of each 100 m vegetation pixel against the median of its distance ring, in 16 wind sectors. Dusty sectors: ${Array.from(r.cls).filter((c) => c === 2).length}. Camps on dusted vegetation: ${dusted.parcels} cadastre parcels, ${dusted.herders} herder points. A relative contrast, not a dust mass. Not an official warning.`,
      summaryHere: lines[0], lines, verdict: null,
      error: [t("veg_e_rel"), t("veg_e_px"), t("veg_camps_hint")], warn: t("veg_limits"), method: t("veg_help"), src: "Sentinel-2 L2A (Microsoft Planetary Computer); Open-Meteo ERA5; data/camps.bin.gz",
      creditsEn: "Microsoft Planetary Computer; Copernicus Sentinel-2 (ESA); Open-Meteo (ERA5, ECMWF). Copyright holders of the source data keep their rights.",
      extras: [
        { label: "CSV", title: t("veg_dl_sectors"), name: `mongolia_minedust_${stamp}_sectors.csv`, make: () => sectorsCsv(r) },
        { label: "CSV", title: t("veg_dl_camps"), name: `mongolia_minedust_${stamp}_camps.csv`, make: () => campsCsv(r) },
        { label: "CSV", title: t("veg_dl_wind"), name: `mongolia_minedust_${stamp}_wind.csv`, make: () => windCsv(r) },
      ],
    };
  }

  /** The picture of the classes that are switched on, for the map and the window; drawn again when a class is toggled. */
  function classCanvas(r) {
    const { w, h } = r.dom, cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data;
    let drawn = 0;
    for (let k = 0; k < r.codes.length; k++) {
      const c = PX[r.codes[k]];
      if (!c.paint || !st.px[c.key]) continue;
      px[k * 4] = c.color[0]; px[k * 4 + 1] = c.color[1]; px[k * 4 + 2] = c.color[2]; px[k * 4 + 3] = c.key === "bare" ? 110 : c.key === "clean" ? 150 : 225;
      drawn++;
    }
    ctx.putImageData(img, 0, 0);
    st.canvas = cv; st.drawn = drawn;
    r.image = cv.toDataURL();
    viewer?.refresh("veg");
    return cv;
  }
  /** The classes in their own window, zoomable to single pixels, with the class of each pixel (js/aoi/viewer.js). */
  function openView() {
    const r = st.res;
    if (!r || !viewer) return;
    viewer.open({
      owner: "veg", title: `${t("veg_window_title")} · ${mineName(r.mine)} · ${r.year}`, grid: r.grid, picture: () => st.canvas,
      label: (i) => t("px_" + PX[r.codes[i]].key) + (fin(r.anomaly[i]) ? ` (${r.anomaly[i] >= 0 ? "+" : ""}${r.anomaly[i].toFixed(3)})` : ""),
      empty: () => {
        if (st.drawn) return null;
        const top = PX.filter((c) => c.paint && !st.px[c.key] && r.areas[c.code] > 0).sort((a, b) => r.areas[b.code] - r.areas[a.code])[0];
        return top ? t("px_" + top.key) : null;
      },
      backdrop: () => { const d = [...r.passes].sort(); return backdrop(r.grid, d[0], d[d.length - 1]); },
    });
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
          t("veg_camps_px"),
          ...[2, 3, 4, 5, 1].map((k) => `${fill(t("veg_camps_on"), { n: t("px_" + PX[k].key) })}: ${r.campsByClass[k].parcels} ${t("veg_parcels")}, ${r.campsByClass[k].herders} ${t("veg_herders")}.`),
          `${t("veg_camps_dusted")}: ${[2, 3, 4].reduce((a, k) => a + r.campsByClass[k].parcels, 0)} ${t("veg_parcels")}, ${[2, 3, 4].reduce((a, k) => a + r.campsByClass[k].herders, 0)} ${t("veg_herders")}.`,
          `${t("veg_camps_total")}: ${[1, 2, 3, 4, 5].reduce((a, k) => a + r.campsByClass[k].parcels, 0)} ${t("veg_parcels")}, ${[1, 2, 3, 4, 5].reduce((a, k) => a + r.campsByClass[k].herders, 0)} ${t("veg_herders")}.`,
          `${t("veg_camps_all")}: ${ex.parcels} ${t("veg_parcels")}, ${ex.herders} ${t("veg_herders")}.`,
          hs ? `${t("veg_camps_hour")} (${dir16(st.hourRes.sector)}): ${hs.parcels} ${t("veg_parcels")}, ${hs.herders} ${t("veg_herders")}.` : null,
          t("veg_camps_hint"),
        ].filter(Boolean)),
        group("aod", [t("veg_aod_line")]),
        group("veg", vegLines(), el("div", {},
          el("p", { class: "veg-key" }, el("i", { style: "background:rgba(150,90,30,.8)" }), t("cls_dusty"), " ", el("i", { style: "background:rgba(230,200,80,.6)" }), t("cls_unclear"), " ", el("i", { style: "background:rgba(60,160,80,.4)" }), t("cls_clear")),
          el("p", { class: "note small", text: t("veg_classes") }),
          el("div", { class: "aoi-legend" }, ...PX.filter((c) => c.paint).map((c) => el("label", { class: "check" },
            el("input", { type: "checkbox", checked: st.px[c.key], onchange: (e) => { st.px[c.key] = e.target.checked; classCanvas(r); paint(); } }),
            el("i", { style: `background:rgb(${c.color.join(",")})` }), el("span", { text: fill(t("veg_class_area"), { n: t("px_" + c.key), a: r.areas[c.code].toFixed(0) }) })))),
          el("div", { class: "btnrow" }, el("button", { class: "btn small", type: "button", text: t("veg_window"), onclick: openView }))))),
      el("p", { class: "note small", text: t("veg_limits") }),
    ].filter(Boolean));
  }
  render();

  return {
    el: box,
    render,
    layer,
    hasResult: () => Boolean(st.res),
    show(on) {
      st.active = on;
      paint();
      if (!on) viewer?.closeIf("veg");
      if (on && !st.res) { const m = mine(); map.setView([m.lat, m.lon], 9); }
      if (st.show.aod && st.res) requestSat?.(on ? { key: "aod_maiac", on: true, date: st.date } : { key: "aod_maiac", on: false }); // the overlay comes and goes with the box
    },
  };
}
