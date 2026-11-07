/* Two interactive tools on top of the map:
 *  1. Polygon risk: draw any polygon with the mouse; it is filled with a pixel grid coloured by hazard class.
 *  2. Mine dust plume: pick a mine, a date and a duration; wind arrows and the dust plume animate hour by hour,
 *     and households inside the plume are listed.
 * Everything runs in the browser against free keyless APIs (Open-Meteo, NASA GIBS, prebuilt OpenStreetMap extracts). */
import { MINES, API, TZ, CLASSES } from "./config.js";
import { fetchAll, nowLocalString } from "./openmeteo.js";
import { computePoint, classOf } from "./risk.js";
import { makeGrid, rasterize, summarize, polygonAreaKm2, kmPerDegLon, KM_PER_DEG_LAT } from "./geo.js";
import { buildField, buildMet, shiftField, windAt, simulate, concGrid, referenceMax, exposure, plumeClass, plumeColor, plumeStats, PLUME_CLASSES, peakFromFrames, halfDepositionKm, airborneShare } from "./plume.js";
import { MATERIALS, materialById } from "./materials.js";
import { arrowLength, createViewCanvas, drawArrow, paintCamps } from "./mapmarks.js";

const TT = {
  mn: {
    poly_title: "Polygon зурж эрсдэлийг харах",
    poly_help: "«Зурах» дараад газрын зураг дээр оройнуудыг хулганаар дарна. Давхар товшоод (эсвэл «Дуусгах») бүтээнэ. Дотор нь pixel-ээр эрсдэлээр будагдана.",
    draw: "Зурах", finish: "Дуусгах", clear: "Арилгах", hazard: "Эрсдэл", h_all: "Хамгийн өндөр", h_flood: "Үер", h_fire: "Түймэр", h_dust: "Шороон шуурга",
    poly_fetching: "Өгөгдөл татаж байна…", poly_nodes: "Загварын цэг", poly_area: "Талбай", poly_pixel: "Pixel хэмжээ", poly_mean: "Дундаж оноо", poly_max: "Хамгийн их", poly_share: "Талбайн хуваарилалт",
    poly_note: "Анхаар: оноо нь цаг уурын загварын (≈10–25 км) цэгүүдээс интерполяц хийгдсэн. Pixel жижиг ч бодит нарийвчлал загварынхаар хязгаарлагдана. Нарийн ялгааг дэлхийн хиймэл дагуулын давхаргаас (30 м) харна уу.",
    poly_hover: "Курсорын доорх оноо", poly_few: "Хамгийн багадаа 3 орой хэрэгтэй.", poly_failed: "Өгөгдөл татаж чадсангүй: ",
    mine_title: "Уул уурхайн шороон тоос", mine_help: "Уурхай, огноо, үргэлжлэх хугацаа сонгоод «Тооцоолох». Салхи, тоосны тархалт цагаар хөдөлнө.",
    mine_src: "Уурхай", mine_lat: "Өргөрөг", mine_lon: "Уртраг", mine_pick: "Газраас сонгох", mine_pick_on: "Газрын зураг дээр дарна уу…",
    mine_date: "Эхлэх огноо (УБ цаг)", mine_hour: "Эхлэх цаг", mine_dur: "Үргэлжлэх хугацаа", mine_hours: "цаг", mine_radius: "Харах радиус", mine_spread: "Салхины чиглэлийн тодорхойгүй байдал", mine_km: "км",
    mine_event: "Жишээ: 2025-06-01", mine_run: "Тооцоолох", mine_busy: "Тооцоолж байна…",
    play: "▶ Тоглуулах", pause: "⏸ Зогсоох", speed: "Хурд", t_wind: "Салхи", t_gust: "Давыг", t_dir: "Чиглэл (хаанаас)", t_cams: "CAMS тоос", t_pm10: "CAMS PM10",
    l_plume: "Тоосны тархалт", l_wind: "Салхины сум", l_homes: "Өвөлжөө, хаваржаа", l_water: "Гол, нуур (JRC, Landsat 1984–2021)", l_aod: "MODIS Deep Blue тоосны аэрозол — бодит хиймэл дагуулын хэмжилт", l_hls: "Sentinel-2 / Landsat 30 м (тухайн өдөр)",
    homes_none: "Айл өрхийн өгөгдөл хараахан бэлэн биш (GitHub Actions «Settlements» ажилласны дараа гарна).", homes_title: "Тархацад өртөж буй айл өрх", homes_total: "Радиус доторх нийт", homes_exposed: "Өртөж буй (индекс ≥ 2)",
    homes_note: "Өгөгдөл: OpenStreetMap, уурхайгаас ≈60 км радиус. Алслагдсан говьд бүх гэр бүртгэгдээгүй байж болно, тиймээс энэ нь доод тооцоо.",
    type_ger: "Гэр", type_house: "Байшин", type_hut: "Майхан/хашаа", type_farmyard: "Мал аж ахуйн талбай", type_place: "Суурин", type_winter: "Өвөлжөө", type_spring: "Хаваржаа",
    p_none: "Өртөөгүй", p_low: "Бага", p_moderate: "Дунд", p_high: "Өндөр", p_very_high: "Маш өндөр",
    plume_note: "Тоосны индекс нь харьцангуй (0–100): суулгүй агаарт үлдсэн бол эх үүсвэрээс 3 км-ээс цааш гарах байсан хамгийн хүчтэй цэгтэй харьцуулсан. Иймээс хүнд эрдэс бодитоор бага индекс өгнө. µг/м³ биш: уурхайн бодит ялгарал тодорхойгүй. Салхи: Open-Meteo (ERA5/прогноз, ≈25 км).",
    mine_material: "Тоосны төрөл", mat_title: "Тоосны төрлүүдийг харьцуулах", mat_name: "Төрөл", mat_rho: "Нягт, г/см³", mat_half: "Хагас нь суух зай", mat_left: "50 км-т агаарт", mat_far: "> 500 км", mat_wind: "Дундаж салхи", mat_hint: "Элемент өөрөө тоосыг хөдөлгөдөггүй: нягт, ширхэгийн хэмжээ л тархалтыг өөрчилнө. Бүх төрөлд ижил ширхэгийн хэмжээ авсан.", mine_method: "Арга зүй",
    camps_title: "Тархацад өртсөн өвөлжөө, хаваржаа", camps_parcels: "Кадастрын нэгж (индекс ≥ 2)", camps_herders: "Малчны цэг (индекс ≥ 2)", camps_hint: "Байршил ≈1 км-ээр бүдүүлэгжсэн. Хоёр бүртгэл давхцаж болох тул нэмж болохгүй.",
    s_title: "Тоосны тархалтын дүн", s_reach: "Хамгийн алс хүрсэн зай", s_area: "Тоос хүрсэн талбай", s_dir: "Гол чиглэл", s_peak: "Хамгийн их үе", s_camps: "Тоос хүрсэн өвөлжөө (кадастр)", s_water: "Тоос хүрсэн гол, нуур", s_none: "Индекс ≥ 2 хүрсэн газар алга.", s_range: "Хаалтад: салхины чиглэлийг ±20°, хурдыг ±20% өөрчилсөн үеийн хязгаар. Энэ бол статистик алдаа биш, тооцоо салхинаас хэр хамаарахыг заана.", s_edge: "Тоос харах радиусын хязгаарт хүрсэн: бодит зай үүнээс их байж болно.", t_stab: "Агаарын тогтворшил", t_rain: "Хур тунадас", t_mix: "Холилдох давхарга", met_none: "Цаг агаарын нэмэлт өгөгдөл ирсэнгүй: саармаг агаар, бороогүй гэж тооцов.", key_title: "Тоосны индекс", stab: { A: "A: маш тогтворгүй", B: "B: тогтворгүй", C: "C: бага зэрэг тогтворгүй", D: "D: саармаг", E: "E: тогтвортой", F: "F: маш тогтвортой" }, dirs: ["хойд", "зүүн хойд", "зүүн", "зүүн өмнөд", "өмнөд", "баруун өмнөд", "баруун", "баруун хойд"],
    mine_err: "Алдаа: ", cams_chart: "Эх үүсвэр дэх CAMS тоос (µг/м³) ба салхи (м/с)", frames_ready: "Бэлэн", peak_time: "Оргил цаг", no_homes_exposed: "Өртсөн айл олдсонгүй.", index: "индекс",
    sat_date_note: "Хиймэл дагуулын давхаргууд сонгосон эхлэх огнооны зургийг харуулна.", future_limit: "Огноо өнөөдрөөс 14 хоногоос хэтрэхгүй байх ёстой.",
  },
  en: {
    poly_title: "Draw a polygon and see its risk",
    poly_help: "Press Draw, then click vertices on the map. Double-click (or Finish) to close. The inside is filled pixel by pixel with the risk class.",
    draw: "Draw", finish: "Finish", clear: "Clear", hazard: "Hazard", h_all: "Highest", h_flood: "Flood", h_fire: "Wildfire", h_dust: "Dust storm",
    poly_fetching: "Fetching data…", poly_nodes: "Model nodes", poly_area: "Area", poly_pixel: "Pixel size", poly_mean: "Mean score", poly_max: "Maximum", poly_share: "Area share",
    poly_note: "Note: scores are interpolated between weather-model nodes (≈10–25 km). Pixels can be small, but real resolution is limited by the model. Use the 30 m satellite layers for fine detail.",
    poly_hover: "Score under cursor", poly_few: "At least 3 vertices are needed.", poly_failed: "Could not load data: ",
    mine_title: "Mine dust plume", mine_help: "Pick a mine, a date and a duration, then Compute. Wind and dust spread animate hour by hour.",
    mine_src: "Mine", mine_lat: "Latitude", mine_lon: "Longitude", mine_pick: "Pick on map", mine_pick_on: "Click the map…",
    mine_date: "Start date (Ulaanbaatar time)", mine_hour: "Start hour", mine_dur: "Duration", mine_hours: "h", mine_radius: "View radius", mine_spread: "Wind-direction uncertainty", mine_km: "km",
    mine_event: "Example: 2025-06-01", mine_run: "Compute", mine_busy: "Computing…",
    play: "▶ Play", pause: "⏸ Pause", speed: "Speed", t_wind: "Wind", t_gust: "Gust", t_dir: "Direction (from)", t_cams: "CAMS dust", t_pm10: "CAMS PM10",
    l_plume: "Dust plume", l_wind: "Wind arrows", l_homes: "Winter and spring camps", l_water: "Lakes and rivers (JRC, Landsat 1984-2021)", l_aod: "MODIS Deep Blue dust aerosol — real satellite measurement", l_hls: "Sentinel-2 / Landsat 30 m (that day)",
    homes_none: "Household data not built yet (appears after the GitHub Actions workflow “Settlements” has run).", homes_title: "Households in the plume", homes_total: "Total inside radius", homes_exposed: "Exposed (index ≥ 2)",
    homes_note: "Data: OpenStreetMap, about 60 km around the mine. Remote Gobi may have unmapped gers, so this is a lower bound.",
    type_ger: "Ger", type_house: "House", type_hut: "Hut/tent", type_farmyard: "Livestock yard", type_place: "Settlement", type_winter: "Winter camp", type_spring: "Spring camp",
    p_none: "Not exposed", p_low: "Low", p_moderate: "Moderate", p_high: "High", p_very_high: "Very high",
    plume_note: "The plume index is relative (0–100): compared with the strongest spot beyond 3 km the dust would reach if none of it settled, so a heavy mineral really gives a lower index. It is not ug/m3 because the real emission of the mine is unknown. Wind: Open-Meteo (ERA5/forecast, ≈25 km).",
    mine_material: "Dust type", mat_title: "Dust types compared", mat_name: "Type", mat_rho: "Density, g/cm³", mat_half: "Half settled at", mat_left: "Airborne at 50 km", mat_far: "> 500 km", mat_wind: "Mean wind", mat_hint: "An element does not move dust by itself: density and particle size change the spread. All types use the same particle sizes.", mine_method: "Method",
    camps_title: "Winter and spring camps in the plume", camps_parcels: "Cadastre camps (index ≥ 2)", camps_herders: "Herder points (index ≥ 2)", camps_hint: "Positions are rounded to about 1 km. The two registers may overlap, so do not add them.",
    s_title: "Dust plume result", s_reach: "Farthest reach", s_area: "Area reached", s_dir: "Main direction", s_peak: "Strongest at", s_camps: "Camps reached (cadastre)", s_water: "Lakes and rivers reached", s_none: "The index did not reach 2 anywhere.", s_range: "In brackets: the range when the wind direction moves by ±20° and its speed by ±20%. It is not a statistical error; it shows how much the result leans on the wind.", s_edge: "The dust reached the edge of the view, so the true distance may be larger.", t_stab: "Air stability", t_rain: "Precipitation", t_mix: "Mixed layer", met_none: "Extra weather data did not arrive: neutral air and no rain are assumed.", key_title: "Dust index", stab: { A: "A: very unstable", B: "B: unstable", C: "C: slightly unstable", D: "D: neutral", E: "E: stable", F: "F: very stable" }, dirs: ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"],
    mine_err: "Error: ", cams_chart: "CAMS dust at the source (ug/m3) and wind (m/s)", frames_ready: "Ready", peak_time: "Peak time", no_homes_exposed: "No exposed households found.", index: "index",
    sat_date_note: "Satellite layers show imagery for the chosen start date.", future_limit: "The date must be no more than 14 days from today.",
  },
};

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const fmt = (v, d = 1) => (fin(v) ? v.toFixed(d) : "—");
const $q = (root, sel) => root.querySelector(sel);

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function fetchJson(url, { timeoutMs = 30000, retries = 1 } = {}) {
  let last;
  for (let a = 0; a <= retries; a++) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (res.ok) return await res.json();
      const body = await res.json().catch(() => ({}));
      last = new Error(`HTTP ${res.status}${body.reason ? ": " + body.reason : ""}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) { last = e; } finally { clearTimeout(timer); }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw last;
}

const isoDate = (d) => d.toISOString().slice(0, 10);
const addDaysIso = (iso, n) => isoDate(new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000));

export function initTools({ map, getLang, requestSat, containers, campsFor, onMethods, onWater, busy = () => {} }) {
  const L = window.L;
  const t = (k) => (TT[getLang()] && TT[getLang()][k]) ?? TT.mn[k] ?? k;
  const T = { poly: initPoly(), mine: initMine() };
  let view = "aimag";

  /* =========================================================== polygon tool */
  function initPoly() {
    const st = { drawing: false, pts: [], hazard: "all", raster: null, grid: null, scores: null, layer: L.layerGroup(), overlay: null, shape: null, busy: false, summary: null, error: null, area: 0 };
    const root = containers.poly;
    const ui = {};

    const onClick = (e) => {
      if (!st.drawing) return;
      const last = st.pts[st.pts.length - 1];
      if (last && map.latLngToLayerPoint(L.latLng(last)).distanceTo(e.layerPoint) < 4) return; // second click of a double-click
      if (st.pts.length >= 3 && map.latLngToLayerPoint(L.latLng(st.pts[0])).distanceTo(e.layerPoint) < 10) { finish(); return; }
      st.pts.push([e.latlng.lat, e.latlng.lng]);
      drawPreview();
    };
    const onDbl = () => { if (st.drawing) finish(); };
    const onMove = (e) => {
      if (!st.raster || view !== "poly") return;
      const { bbox, w, h, cells, pixelKm } = st.raster;
      const c = Math.floor(((e.latlng.lng - bbox.w) / (bbox.e - bbox.w)) * w), r = Math.floor(((bbox.n - e.latlng.lat) / (bbox.n - bbox.s)) * h);
      let txt = "";
      if (c >= 0 && c < w && r >= 0 && r < h) {
        const v = cells[r * w + c];
        if (fin(v)) { const k = classOf(v); txt = `${t("poly_hover")}: ${Math.round(v)} · ${k ? label(k.key) : "—"} (${pixelKm[0].toFixed(1)} × ${pixelKm[1].toFixed(1)} ${t("mine_km")})`; }
      }
      ui.hover.textContent = txt;
    };
    const CLS = { mn: { very_low: "Маш бага", low: "Бага", moderate: "Дунд", high: "Өндөр", very_high: "Маш өндөр" }, en: { very_low: "Very low", low: "Low", moderate: "Moderate", high: "High", very_high: "Very high" } };
    const label = (key) => (CLS[getLang()] || CLS.mn)[key];

    function drawPreview() {
      st.layer.clearLayers(); if (st.overlay) st.overlay = null;
      if (!st.pts.length) return;
      L.polyline(st.pts, { color: "#fff", weight: 2, dashArray: "5 4" }).addTo(st.layer);
      st.pts.forEach((p, i) => L.circleMarker(p, { radius: i === 0 ? 6 : 4, color: "#fff", weight: 2, fillColor: "#4aa3df", fillOpacity: 1 }).addTo(st.layer));
    }
    function startDraw() {
      clear(); st.drawing = true; map.doubleClickZoom.disable(); map.getContainer().style.cursor = "crosshair";
      ui.draw.disabled = true; ui.finish.disabled = false; ui.status.textContent = t("poly_help");
    }
    function stopDraw() { st.drawing = false; map.doubleClickZoom.enable(); map.getContainer().style.cursor = ""; ui.draw.disabled = false; ui.finish.disabled = true; }
    function clear() {
      stopDraw(); st.pts = []; st.raster = null; st.grid = null; st.scores = null; st.summary = null; st.error = null; st.layer.clearLayers(); st.overlay = null;
      ui.out.replaceChildren(); ui.hover.textContent = ""; ui.status.textContent = "";
    }
    async function finish() {
      if (st.pts.length < 3) { ui.status.textContent = t("poly_few"); return; }
      stopDraw();
      const poly = st.pts.slice();
      st.layer.clearLayers();
      L.polygon(poly, { color: "#fff", weight: 2, fill: false }).addTo(st.layer);
      map.fitBounds(L.latLngBounds(poly), { padding: [30, 30], maxZoom: 11 });
      st.area = polygonAreaKm2(poly);
      st.grid = makeGrid(poly, { minStepDeg: 0.1, maxPerSide: 7 });
      st.poly = poly; st.busy = true; st.error = null;
      ui.status.textContent = `${t("poly_fetching")} (${st.grid.nodes.length})`;
      try {
        const { raw, errors } = await fetchAll(st.grid.nodes);
        const now = nowLocalString();
        const per = raw.map((r) => computePoint({ ...r, thresholds: null }, now));
        st.scores = {
          all: per.map((p) => p.overall?.score ?? null), flood: per.map((p) => p.flood?.score ?? null),
          fire: per.map((p) => p.fire?.score ?? null), dust: per.map((p) => p.dust?.score ?? null),
        };
        if (!st.scores.all.some(fin)) throw new Error(JSON.stringify(errors));
      } catch (e) { st.error = String(e.message || e); st.busy = false; ui.status.textContent = t("poly_failed") + st.error; return; }
      st.busy = false; ui.status.textContent = "";
      render();
    }
    function render() {
      if (!st.scores || !st.poly) return;
      const values = st.scores[st.hazard];
      const r = rasterize(st.poly, st.grid, values, 180);
      st.raster = r;
      const cv = document.createElement("canvas"); cv.width = r.w; cv.height = r.h;
      const ctx = cv.getContext("2d"), img = ctx.createImageData(r.w, r.h);
      for (let i = 0; i < r.cells.length; i++) {
        const v = r.cells[i]; if (!fin(v)) continue;
        const [R, G, B] = hexRgb(classOf(v).color);
        img.data.set([R, G, B, 190], i * 4);
      }
      ctx.putImageData(img, 0, 0);
      if (st.overlay) st.layer.removeLayer(st.overlay);
      const b = r.bbox;
      st.overlay = L.imageOverlay(cv.toDataURL(), [[b.s, b.w], [b.n, b.e]], { interactive: false, className: "pixel-overlay", zIndex: 6 });
      st.overlay.addTo(st.layer);
      const sum = summarize(r.cells, (v) => classOf(v).key);
      st.summary = sum;
      ui.out.replaceChildren(
        el("table", { class: "kv" },
          row(t("poly_area"), `${fmt(st.area, 0)} km²`), row(t("poly_nodes"), String(st.grid.nodes.length)),
          row(t("poly_pixel"), `${r.pixelKm[0].toFixed(1)} × ${r.pixelKm[1].toFixed(1)} km`), row(t("poly_mean"), fmt(sum.mean, 0)), row(t("poly_max"), fmt(sum.max, 0))),
        el("h4", { text: t("poly_share") }),
        ...CLASSES.map((c) => el("div", { class: "share" }, el("i", { style: `background:${c.color}` }), el("span", { text: label(c.key) }), el("b", { style: `width:${Math.round((sum.share[c.key] || 0) * 100)}%;background:${c.color}` }), el("em", { text: `${Math.round((sum.share[c.key] || 0) * 100)}%` }))),
        el("p", { class: "note", text: t("poly_note") }));
    }

    function build() {
      ui.draw = el("button", { class: "btn", onclick: startDraw });
      ui.finish = el("button", { class: "btn", disabled: true, onclick: finish });
      ui.clear = el("button", { class: "btn", onclick: clear });
      ui.haz = el("select", { onchange: (e) => { st.hazard = e.target.value; render(); } });
      ui.status = el("p", { class: "note", role: "status" });
      ui.hover = el("p", { class: "hover" });
      ui.out = el("div");
      ui.title = el("h3"); ui.help = el("p", { class: "note" }); ui.hazl = el("label", { class: "inline" });
      ui.hazl.append(ui.hazSpan = el("span"), ui.haz);
      root.replaceChildren(ui.title, ui.help, el("div", { class: "btnrow" }, ui.draw, ui.finish, ui.clear), ui.hazl, ui.status, ui.hover, ui.out);
      relabel();
    }
    function relabel() {
      ui.title.textContent = t("poly_title"); ui.help.textContent = t("poly_help");
      ui.draw.textContent = t("draw"); ui.finish.textContent = t("finish"); ui.clear.textContent = t("clear"); ui.hazSpan.textContent = t("hazard") + ": ";
      const cur = st.hazard;
      ui.haz.replaceChildren(...["all", "flood", "fire", "dust"].map((h) => el("option", { value: h, selected: h === cur, text: t("h_" + h) })));
      if (st.scores) render();
    }
    map.on("click", onClick); map.on("dblclick", onDbl); map.on("mousemove", onMove);
    build();
    return { st, relabel, setHazard(h) { st.hazard = h; ui.haz.value = h; if (st.scores) render(); }, show(on) { if (on) st.layer.addTo(map); else { stopDraw(); st.layer.remove(); } } };
  }
  function row(a, b) { return el("tr", {}, el("td", { text: a }), el("td", { text: b })); }

  /* =============================================================== mine tool */
  function initMine() {
    const today = isoDate(new Date());
    const st = {
      mineId: MINES[0].id, lat: MINES[0].lat, lon: MINES[0].lon, date: addDaysIso(today, -1), hour: 0, dur: 48, radius: 100, spread: 10, materialId: MINES[0].material,
      sim: null, frames: null, ref: 0, extent: null, W: 150, H: 150, h: 0, playing: false, timer: null, speed: 500,
      cams: null, homes: null, exposure: null, homesAll: undefined, busy: false, picking: false,
      layers: { plume: L.layerGroup(), homes: L.layerGroup(), src: L.layerGroup() },
      show: { plume: true, wind: true, homes: true, water: false, hls: false, aod: false },
      overlay: null, water: undefined, error: null, active: false, met: null, stats: null, range: null, waterHit: null,
    };
    const root = containers.mine;
    const ui = {};
    const hits = () => (st.camps ?? []).filter((c) => c.index >= 2);
    const campMarks = createViewCanvas(map, "plumeCamps", 445, (ctx, v) => paintCamps(ctx, v, hits(), (p) => plumeClass(p.index).color));
    const windMarks = createViewCanvas(map, "plumeWind", 455, (ctx, v) => { for (const a of windArrows(v)) drawArrow(ctx, a.x, a.y, a.angle, arrowLength(a.speed)); });

    /** The wind of the hour on an even lattice of the screen, read from the field, so that arrows stay at every zoom. */
    function windArrows(v) {
      const f = st.sim?.field, out = [];
      if (!f) return out;
      const padY = (f.lats[1] - f.lats[0]) / 2, padX = (f.lons[1] - f.lons[0]) / 2;
      for (const p of v.lattice(120)) {
        if (p.lat < f.lats[0] - padY || p.lat > f.lats[f.ny - 1] + padY || p.lon < f.lons[0] - padX || p.lon > f.lons[f.nx - 1] + padX) continue;
        const w = windAt(f, st.h, p.lat, p.lon);
        if (w) out.push({ ...p, speed: Math.hypot(w[0], w[1]), angle: (Math.atan2(w[0], w[1]) * 180) / Math.PI });
      }
      return out;
    }

    function setMaterial(id) { st.materialId = id; if (ui.material) ui.material.value = id; }
    function setSource(lat, lon, id) { st.lat = lat; st.lon = lon; if (id) st.mineId = id; ui.lat.value = lat.toFixed(4); ui.lon.value = lon.toFixed(4); drawSource(); }
    function drawSource() {
      st.layers.src.clearLayers();
      L.circleMarker([st.lat, st.lon], { radius: 8, color: "#fff", weight: 2, fillColor: "#111", fillOpacity: 1 }).bindTooltip(mineName()).addTo(st.layers.src);
      const R = st.radius, dLat = R / KM_PER_DEG_LAT, dLon = R / kmPerDegLon(st.lat);
      L.rectangle([[st.lat - dLat, st.lon - dLon], [st.lat + dLat, st.lon + dLon]], { color: "#fff", weight: 1, dashArray: "4 4", fill: false, interactive: false }).addTo(st.layers.src);
    }
    function mineName() { const m = MINES.find((x) => x.id === st.mineId); return m ? (getLang() === "mn" ? m.mn : m.en) : `${st.lat.toFixed(3)}, ${st.lon.toFixed(3)}`; }

    /* ---------- data ---------- */
    function windGrid() {
      const lats = Array.from({ length: 7 }, (_, i) => st.lat + (i - 3) * 0.6), lons = Array.from({ length: 7 }, (_, i) => st.lon + (i - 3) * 0.8);
      const nodes = []; for (const la of lats) for (const lo of lons) nodes.push([la, lo]);
      return { lats, lons, ny: 7, nx: 7, nodes };
    }
    const weatherApi = (startDate) => ((Date.now() - Date.parse(startDate + "T00:00:00Z")) / 86400000 > 85 ? API.archive : API.forecast);
    function metUrl(startDate, endDate) {
      const q = new URLSearchParams({ latitude: st.lat.toFixed(3), longitude: st.lon.toFixed(3), hourly: "precipitation,cloud_cover,shortwave_radiation,boundary_layer_height,temperature_2m", start_date: startDate, end_date: endDate, timezone: TZ });
      return `${weatherApi(startDate)}?${q}`;
    }
    function windUrl(g, startDate, endDate) {
      const base = weatherApi(startDate);
      const q = new URLSearchParams({
        latitude: g.nodes.map((n) => n[0].toFixed(3)).join(","), longitude: g.nodes.map((n) => n[1].toFixed(3)).join(","),
        hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m", wind_speed_unit: "ms", start_date: startDate, end_date: endDate, timezone: TZ,
      });
      return `${base}?${q}`;
    }
    function airUrl(startDate, endDate) {
      const q = new URLSearchParams({ latitude: st.lat.toFixed(3), longitude: st.lon.toFixed(3), hourly: "dust,pm10", start_date: startDate, end_date: endDate, timezone: TZ });
      return `${API.air}?${q}`;
    }
    async function loadHomes() {
      if (st.homesAll !== undefined) return st.homesAll;
      try { st.homesAll = (await fetchJson("data/settlements.json", { retries: 0, timeoutMs: 15000 })); } catch { st.homesAll = null; }
      return st.homesAll;
    }
    async function loadWater() {
      if (st.water !== undefined) return st.water;
      try { st.water = await fetchJson("data/water.geojson", { retries: 0, timeoutMs: 20000 }); } catch { st.water = null; }
      return st.water;
    }

    /** Lakes and rivers the dust reached: the strongest index along the shore of each one inside the view. */
    async function waterReached() {
      const w = await loadWater(), e = st.extent;
      if (!w) return null;
      const inside = (p) => p[1] >= e.s && p[1] <= e.n && p[0] >= e.w && p[0] <= e.e, shapes = [], pts = [];
      for (const f of w.features) {
        const ring = f.geometry.coordinates[0].filter(inside);
        if (!ring.length) continue;
        const step = Math.ceil(ring.length / 60), first = pts.length;
        for (let i = 0; i < ring.length; i += step) pts.push({ lon: ring[i][0], lat: ring[i][1] });
        shapes.push({ first, last: pts.length, km2: f.properties.km2 });
      }
      const peak = peakFromFrames(st.frames, e, st.W, st.H, pts, st.ref);
      const hit = shapes.filter((s) => peak.slice(s.first, s.last).some((v) => v >= 2));
      return { n: hit.length, km2: hit.reduce((a, s) => a + s.km2, 0) };
    }

    /** The run again with the wind turned and scaled: how much the answer leans on the wind, which is the weakest input. */
    function windRange(field, rho, pts) {
      const out = { reach: [st.stats.reach], area: [st.stats.area], parcels: pts ? [st.camps.filter((c) => c.index >= 2).reduce((a, c) => a + c.parcels, 0)] : null };
      for (const [deg, k] of [[-20, 0.8], [20, 1.2]]) {
        const sim = simulate({ source: { lat: st.lat, lon: st.lon }, field: shiftField(field, deg, k), spreadDeg: st.spread, rho, met: st.met, dtMin: 6 });
        const frames = sim.snaps.filter((_, i) => i % 2 === 0).map((s) => concGrid(s, st.extent, st.W, st.H));
        const s = plumeStats(frames, st.extent, st.W, st.H, { lat: st.lat, lon: st.lon }, st.ref);
        out.reach.push(s.reach); out.area.push(s.area);
        if (pts) { const peak = peakFromFrames(frames, st.extent, st.W, st.H, pts, st.ref); out.parcels.push(pts.reduce((a, p, i) => a + (peak[i] >= 2 ? p.parcels : 0), 0)); }
      }
      return out;
    }

    async function run() {
      if (st.busy) return;
      stopPlay(); st.error = null;
      const maxDate = addDaysIso(today, 14);
      if (st.date > maxDate) { setStatus(t("future_limit")); return; }
      st.busy = true; ui.run.disabled = true; setStatus(t("mine_busy"));
      busy(true);
      try {
        const days = Math.ceil((st.hour + st.dur) / 24);
        const endDate = addDaysIso(st.date, days - 1);
        const g = windGrid();
        const [wind, air, weather] = await Promise.all([fetchJson(windUrl(g, st.date, endDate)), fetchJson(airUrl(st.date, endDate)).catch(() => null), fetchJson(metUrl(st.date, endDate)).catch(() => null)]);
        const arr = Array.isArray(wind) ? wind : [wind];
        if (arr.length !== g.nodes.length) throw new Error(`wind nodes: expected ${g.nodes.length}, got ${arr.length}`);
        const sl = (a) => (a || []).slice(st.hour, st.hour + st.dur);
        const results = arr.map((r) => ({ time: sl(r.hourly.time), wind_speed_10m: sl(r.hourly.wind_speed_10m), wind_direction_10m: sl(r.hourly.wind_direction_10m), wind_gusts_10m: sl(r.hourly.wind_gusts_10m) }));
        if (results[0].time.length < 2) throw new Error("no hourly data for that date");
        const valid = results.filter((r) => r.wind_speed_10m.some(fin)).length;
        if (!valid) throw new Error("wind data are empty for that date");
        const field = buildField(g, results), rho = materialById(st.materialId).rho;
        st.srcSeries = sourceSeries(field);
        st.met = weather?.hourly ? buildMet(Object.fromEntries(Object.entries(weather.hourly).map(([k, v]) => [k, sl(v)])), st.srcSeries.spd) : null;
        await new Promise((ok) => setTimeout(ok, 60)); // let the computing screen appear before the page is busy
        st.sim = simulate({ source: { lat: st.lat, lon: st.lon }, field, spreadDeg: st.spread, rho, met: st.met });
        const R = st.radius, dLat = R / KM_PER_DEG_LAT, dLon = R / kmPerDegLon(st.lat);
        st.extent = { s: st.lat - dLat, n: st.lat + dLat, w: st.lon - dLon, e: st.lon + dLon };
        st.frames = st.sim.snaps.map((s) => concGrid(s, st.extent, st.W, st.H));
        // One scale for every material: what the air would hold if nothing settled.
        const emitted = st.sim.snaps.filter((_, i) => i % 2 === 0).map((s) => concGrid(s, st.extent, st.W, st.H, true));
        st.ref = referenceMax(emitted, st.extent, st.W, st.H, { lat: st.lat, lon: st.lon });
        st.cams = air && air.hourly ? { time: sl(air.hourly.time), dust: sl(air.hourly.dust), pm10: sl(air.hourly.pm10) } : null;
        st.stats = plumeStats(st.frames, st.extent, st.W, st.H, { lat: st.lat, lon: st.lon }, st.ref);
        const homes = await loadHomes();
        st.homes = null; st.exposure = null;
        if (homes && Array.isArray(homes.items)) {
          const inBox = homes.items.filter((h) => h.lat >= st.extent.s && h.lat <= st.extent.n && h.lon >= st.extent.w && h.lon <= st.extent.e);
          st.homes = inBox; st.exposure = exposure(st.sim.snaps, inBox, st.ref);
        }
        st.camps = null;
        const pts = campsFor ? await campsFor(st.extent) : null;
        if (pts?.length) {
          const peak = peakFromFrames(st.frames, st.extent, st.W, st.H, pts, st.ref);
          st.camps = pts.map((p, i) => ({ ...p, index: peak[i] }));
        }
        st.range = windRange(field, rho, pts?.length ? pts : null);
        st.waterHit = await waterReached();
        st.h = Math.min(st.h, field.hours - 1);
        const evt = st.cams && st.cams.dust.some(fin) ? st.cams.dust.indexOf(Math.max(...st.cams.dust.filter(fin))) : 0;
        st.h = evt >= 0 ? evt : 0;
        // The run starts with empty air: when CAMS shows nothing to point at, open on the hour with the most dust.
        const load = st.frames.map((f) => f.reduce((a, b) => a + b, 0));
        if (load[st.h] < 0.05 * Math.max(...load)) st.h = load.indexOf(Math.max(...load));
        ui.slider.max = String(field.hours - 1); ui.slider.value = String(st.h);
        buildStaticLayers(); setFrame(st.h); renderResults();
        map.fitBounds([[st.extent.s, st.extent.w], [st.extent.n, st.extent.e]], st.fit ?? { padding: [10, 10] });
        applySatToggles();
        setStatus(`${t("frames_ready")}: ${field.hours} ${t("mine_hours")}. ${t("sat_date_note")}`);
      } catch (e) { st.error = String(e.message || e); setStatus(t("mine_err") + st.error); }
      st.busy = false; ui.run.disabled = false;
      busy(false);
    }

    function sourceSeries(field) {
      // wind at the node nearest the source (centre of the grid)
      const k = 3 * 7 + 3, n = field.hours, spd = [], dir = [];
      for (let h = 0; h < n; h++) {
        const u = field.u[h * 49 + k], v = field.v[h * 49 + k];
        spd.push(fin(u) && fin(v) ? Math.hypot(u, v) : null);
        dir.push(fin(u) && fin(v) ? (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360 : null);
      }
      return { time: field.time, spd, dir };
    }

    /* ---------- map layers ---------- */
    function buildStaticLayers() {
      st.layers.homes.clearLayers();
      if (st.homes) {
        st.homes.forEach((h, i) => {
          const ex = st.exposure[i], c = plumeClass(ex.index);
          const mk = L.circleMarker([h.lat, h.lon], { radius: c.color ? 6 : 3, color: "#101820", weight: 1, fillColor: c.color || "#9db0c1", fillOpacity: c.color ? 0.95 : 0.6 });
          mk.bindTooltip(`${t("type_" + h.type)}${h.name ? " · " + h.name : ""} · ${t("index")} ${Math.round(ex.index)} · ${ex.hour >= 0 && ex.index >= 2 ? st.sim.field.time[ex.hour].replace("T", " ") : "—"}`);
          mk.addTo(st.layers.homes);
        });
      }
      syncLayerVisibility();
    }

    function syncLayerVisibility() {
      const on = st.active;
      st.layers.src.addTo(map);
      windMarks.show(on && st.show.wind && Boolean(st.sim));
      campMarks.show(on && st.show.homes && Boolean(st.sim));
      if (!on) { for (const g of Object.values(st.layers)) g.remove(); return; }
      for (const [k, g] of Object.entries(st.layers)) {
        if (k === "src") continue;
        if (st.show[k] && st.sim) g.addTo(map); else g.remove();
      }
    }

    function setFrame(h) {
      if (!st.sim) return;
      st.h = h; ui.slider.value = String(h);
      // plume raster
      const f = st.frames[h], W = st.W, H = st.H;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H);
      for (let i = 0; i < f.length; i++) {
        const c = plumeColor(st.ref > 0 ? Math.min(100, (100 * f[i]) / st.ref) : 0);
        if (c) img.data.set(c, i * 4);
      }
      ctx.putImageData(img, 0, 0);
      const e = st.extent;
      if (st.overlay) st.layers.plume.removeLayer(st.overlay);
      st.overlay = L.imageOverlay(cv.toDataURL(), [[e.s, e.w], [e.n, e.e]], { interactive: false, zIndex: 7, opacity: 1 });
      st.overlay.addTo(st.layers.plume);
      windMarks.redraw();
      renderReadout();
    }

    function renderReadout() {
      const h = st.h, s = st.srcSeries, rows = [];
      const when = s.time[h].replace("T", " ");
      rows.push(row(t("mine_date"), `${when}`));
      rows.push(row(t("t_wind"), `${fmt(s.spd[h])} m/s`));
      rows.push(row(t("t_dir"), fin(s.dir[h]) ? `${Math.round(s.dir[h])}° (${compass(s.dir[h])})` : "—"));
      if (st.met) {
        rows.push(row(t("t_stab"), t("stab")[st.met.cls[h]]));
        rows.push(row(t("t_rain"), `${fmt(st.met.rain[h])} mm`));
        rows.push(row(t("t_mix"), `${Math.round(st.met.zi[h])} m`));
      }
      if (st.cams) { rows.push(row(t("t_cams"), `${fmt(st.cams.dust[h], 0)} µg/m³`)); rows.push(row(t("t_pm10"), `${fmt(st.cams.pm10[h], 0)} µg/m³`)); }
      const key = el("div", { class: "plume-key" }, el("b", { text: t("key_title") }), el("i"), el("div", {}, ...PLUME_CLASSES.slice(1).map((c) => el("span", { text: t(c.key) }))));
      ui.readout.replaceChildren(...[key, el("table", { class: "kv" }, ...rows), st.met ? null : el("p", { class: "note", text: t("met_none") }), chart()].filter(Boolean));
    }
    const compass = (d) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(d / 22.5) % 16];

    function chart() {
      const s = st.srcSeries, n = s.spd.length, W = 340, Hh = 90, pad = 4;
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", `0 0 ${W} ${Hh}`); svg.setAttribute("class", "chart");
      const x = (i) => pad + (i / Math.max(1, n - 1)) * (W - 2 * pad);
      const line = (arr, max, color) => {
        const pts = arr.map((v, i) => (fin(v) ? `${x(i).toFixed(1)},${(Hh - pad - (Math.min(v, max) / max) * (Hh - 2 * pad)).toFixed(1)}` : null)).filter(Boolean).join(" ");
        const p = document.createElementNS(NS, "polyline"); p.setAttribute("points", pts); p.setAttribute("fill", "none"); p.setAttribute("stroke", color); p.setAttribute("stroke-width", "1.6"); svg.append(p);
      };
      const maxD = st.cams ? Math.max(50, ...st.cams.dust.filter(fin)) : 50;
      if (st.cams) line(st.cams.dust, maxD, "#f2c230");
      line(s.spd, Math.max(10, ...s.spd.filter(fin)), "#4aa3df");
      const cur = document.createElementNS(NS, "line"); cur.setAttribute("x1", x(st.h)); cur.setAttribute("x2", x(st.h)); cur.setAttribute("y1", 0); cur.setAttribute("y2", Hh); cur.setAttribute("stroke", "#fff"); cur.setAttribute("stroke-width", "1"); svg.append(cur);
      return el("div", {}, svg, el("p", { class: "note", text: t("cams_chart") }));
    }

    function materialTable() {
      const wind = st.srcSeries.spd.filter(fin), u = Math.max(wind.reduce((a, b) => a + b, 0) / Math.max(wind.length, 1), 1);
      const rows = MATERIALS.map((m) => {
        const half = halfDepositionKm(m.rho, u);
        return el("tr", { class: m.id === st.materialId ? "on" : "" }, el("td", { text: getLang() === "mn" ? m.mn : m.en }), el("td", { text: m.rho.toFixed(2) }),
          el("td", { text: half === null ? t("mat_far") : `${half < 10 ? half.toFixed(1) : Math.round(half)} ${t("mine_km")}` }), el("td", { text: `${Math.round(airborneShare(m.rho, 50000, u) * 100)}%` }));
      });
      const note = materialById(st.materialId).note[getLang()];
      return [el("h4", { text: t("mat_title") }),
        el("table", { class: "kv small mat" }, el("tr", {}, ...["mat_name", "mat_rho", "mat_half", "mat_left"].map((k) => el("th", { text: t(k) }))), ...rows),
        el("p", { class: "note", text: `${t("mat_wind")} ${fmt(u)} m/s. ${t("mat_hint")}` }), note ? el("p", { class: "note", text: note }) : null];
    }

    function summary() {
      const s = st.stats, r = st.range;
      if (!s) return [];
      if (!s.area) return [el("h4", { text: t("s_title") }), el("p", { class: "note", text: t("s_none") })];
      const n = (v) => Math.round(v).toLocaleString("en-US"), span = (a) => `(${n(Math.min(...a))}–${n(Math.max(...a))})`;
      const hit = st.camps?.filter((c) => c.index >= 2).reduce((a, c) => a + c.parcels, 0);
      const dir = t("dirs")[Math.round(s.bearing / 45) % 8];
      return [el("h4", { text: t("s_title") }), el("table", { class: "kv" },
        row(t("s_reach"), `${s.edge ? "≥ " : ""}${n(s.reach)} ${t("mine_km")} ${span(r.reach)}`), row(t("s_area"), `${n(s.area)} км² ${span(r.area)}`), row(t("s_dir"), dir),
        row(t("s_peak"), st.sim.field.time[s.peakHour].replace("T", " ")), st.camps ? row(t("s_camps"), `${n(hit)} ${span(r.parcels)}`) : null,
        st.waterHit ? row(t("s_water"), `${st.waterHit.n} · ${n(st.waterHit.km2)} км²`) : null),
      s.edge ? el("p", { class: "note", text: t("s_edge") }) : null, el("p", { class: "note", text: t("s_range") })];
    }

    function renderResults() {
      if (!st.sim) { ui.results.replaceChildren(); return; }
      const kids = [...summary(), ...materialTable()];
      if (st.camps) {
        const hit = st.camps.filter((c) => c.index >= 2), sum = (k) => hit.reduce((a, c) => a + c[k], 0);
        kids.push(el("h4", { text: t("camps_title") }), el("table", { class: "kv" }, row(t("camps_parcels"), String(sum("parcels"))), row(t("camps_herders"), String(sum("herders")))),
          el("p", { class: "note", text: t("camps_hint") }));
      }
      if (st.homes) {
        const byClass = {}; const byType = {};
        st.exposure.forEach((e, i) => { const c = plumeClass(e.index); byClass[c.key] = (byClass[c.key] || 0) + 1; if (e.index >= 2) { const ty = st.homes[i].type; byType[ty] = (byType[ty] || 0) + 1; } });
        const exposed = st.exposure.filter((e) => e.index >= 2).length;
        kids.push(el("h4", { text: t("homes_title") }),
          el("table", { class: "kv" }, row(t("homes_total"), String(st.homes.length)), row(t("homes_exposed"), String(exposed)),
            ...Object.entries(byType).map(([k, v]) => row("  " + t("type_" + k), String(v))),
            ...PLUME_CLASSES.slice(1).map((c) => row("  " + t(c.key), String(byClass[c.key] || 0)))));
        const top = st.exposure.map((e, i) => ({ e, h: st.homes[i] })).filter((x) => x.e.index >= 2).sort((a, b) => b.e.index - a.e.index).slice(0, 12);
        if (top.length) kids.push(el("table", { class: "kv small" }, ...top.map(({ e, h }) => el("tr", { class: "clk", onclick: () => map.setView([h.lat, h.lon], 12) }, el("td", { text: `${t("type_" + h.type)}${h.name ? " · " + h.name : ""}` }), el("td", { text: `${Math.round(e.index)} · ${st.sim.field.time[e.hour].slice(5, 16).replace("T", " ")}` })))));
        else kids.push(el("p", { class: "note", text: t("no_homes_exposed") }));
        kids.push(el("p", { class: "note", text: t("homes_note") }));
      }
      kids.push(el("p", { class: "note", text: t("plume_note") }));
      ui.results.replaceChildren(...kids.filter(Boolean));
    }

    /* ---------- playback ---------- */
    function play() { if (!st.sim) return; st.playing = true; ui.play.textContent = t("pause"); st.timer = setInterval(() => { const n = st.sim.field.hours; setFrame((st.h + 1) % n); }, st.speed); }
    function stopPlay() { st.playing = false; clearInterval(st.timer); st.timer = null; if (ui.play) ui.play.textContent = t("play"); }
    const setStatus = (s) => { ui.status.textContent = s; };

    function applySatToggles() {
      const d = st.date;
      requestSat({ date: d });
      onWater?.(st.show.water);
      requestSat({ key: "hls_s30", on: st.show.hls });
      requestSat({ key: "aod_deepblue", on: st.show.aod });
    }

    /* ---------- UI ---------- */
    function build() {
      ui.title = el("h3"); ui.help = el("p", { class: "note" });
      ui.mine = el("select", { onchange: (e) => { const m = MINES.find((x) => x.id === e.target.value); if (m) { setMaterial(m.material); setSource(m.lat, m.lon, m.id); map.setView([m.lat, m.lon], 9); } } });
      ui.material = el("select", { onchange: (e) => { st.materialId = e.target.value; if (st.sim) run(); } });
      ui.lat = el("input", { type: "number", step: "0.0001", onchange: (e) => { st.lat = Number(e.target.value); st.mineId = null; drawSource(); } });
      ui.lon = el("input", { type: "number", step: "0.0001", onchange: (e) => { st.lon = Number(e.target.value); st.mineId = null; drawSource(); } });
      ui.pick = el("button", { class: "btn small", onclick: () => { st.picking = !st.picking; ui.pick.textContent = st.picking ? t("mine_pick_on") : t("mine_pick"); map.getContainer().style.cursor = st.picking ? "crosshair" : ""; } });
      ui.date = el("input", { type: "date", value: st.date, max: addDaysIso(today, 14), onchange: (e) => { st.date = e.target.value; } });
      ui.hour = el("select", { onchange: (e) => { st.hour = Number(e.target.value); } }, ...Array.from({ length: 24 }, (_, h) => el("option", { value: h, text: String(h).padStart(2, "0") + ":00" })));
      ui.dur = el("select", { onchange: (e) => { st.dur = Number(e.target.value); } }, ...[24, 48, 72].map((v) => el("option", { value: v, text: `${v}`, selected: v === st.dur })));
      ui.rad = el("select", { onchange: (e) => { st.radius = Number(e.target.value); drawSource(); } }, ...[50, 100, 200].map((v) => el("option", { value: v, text: `${v}`, selected: v === st.radius })));
      ui.spread = el("select", { onchange: (e) => { st.spread = Number(e.target.value); } }, ...[0, 10, 20].map((v) => el("option", { value: v, text: `${v}°`, selected: v === st.spread })));
      ui.event = el("button", { class: "btn small", onclick: () => { st.date = "2025-06-01"; st.hour = 0; st.dur = 48; ui.date.value = st.date; ui.hour.value = "0"; ui.dur.value = "48"; setSource(MINES[0].lat, MINES[0].lon, MINES[0].id); ui.mine.value = MINES[0].id; run(); } });
      ui.run = el("button", { class: "btn primary", onclick: run });
      ui.method = el("button", { class: "btn small", onclick: () => onMethods?.("plume") });
      ui.status = el("p", { class: "note", role: "status" });
      ui.play = el("button", { class: "btn small", onclick: () => (st.playing ? stopPlay() : play()) });
      ui.slider = el("input", { type: "range", min: "0", max: "0", value: "0", class: "slider", oninput: (e) => { stopPlay(); setFrame(Number(e.target.value)); } });
      ui.speed = el("select", { onchange: (e) => { st.speed = Number(e.target.value); if (st.playing) { stopPlay(); play(); } } }, ...[[1000, "0.5×"], [500, "1×"], [250, "2×"], [120, "4×"]].map(([v, l]) => el("option", { value: v, text: l, selected: v === 500 })));
      ui.readout = el("div"); ui.results = el("div");
      ui.toggles = el("div", { class: "toggles" });
      ui.labels = {};
      const mkToggle = (key, onchange) => { const input = el("input", { type: "checkbox", checked: !!st.show[key], onchange: (e) => { st.show[key] = e.target.checked; onchange(); } }); const span = el("span"); ui.labels[key] = span; return el("label", { class: "check" }, input, span); };
      ui.toggles.append(mkToggle("plume", syncLayerVisibility), mkToggle("wind", syncLayerVisibility), mkToggle("homes", syncLayerVisibility), mkToggle("water", () => { syncLayerVisibility(); applySatToggles(); }), mkToggle("aod", applySatToggles), mkToggle("hls", applySatToggles));
      ui.fields = el("div", { class: "fields" });
      const field = (labelKey, ...ctrl) => { const lab = el("span"); lab.dataset.k = labelKey; return el("label", { class: "inline" }, lab, ...ctrl); };
      ui.fields.append(field("mine_src", ui.mine), field("mine_material", ui.material), field("mine_lat", ui.lat), field("mine_lon", ui.lon, ui.pick), field("mine_date", ui.date), field("mine_hour", ui.hour), field("mine_dur", ui.dur), field("mine_radius", ui.rad), field("mine_spread", ui.spread));
      ui.transport = el("div", { class: "transport" }, ui.play, ui.slider, ui.speed);
      root.replaceChildren(ui.title, ui.help, ui.fields, el("div", { class: "btnrow" }, ui.run, ui.event, ui.method), ui.status, ui.transport, ui.readout, ui.toggles, ui.results);
      map.on("click", (e) => { if (st.picking && st.active) { st.picking = false; map.getContainer().style.cursor = ""; ui.pick.textContent = t("mine_pick"); ui.mine.value = ""; setSource(e.latlng.lat, e.latlng.lng, null); } });
      ui.hour.value = String(st.hour); ui.lat.value = st.lat.toFixed(4); ui.lon.value = st.lon.toFixed(4);
      relabel(); drawSource();
    }
    function relabel() {
      ui.title.textContent = t("mine_title"); ui.help.textContent = t("mine_help"); ui.method.textContent = t("mine_method");
      ui.material.replaceChildren(...MATERIALS.map((m) => el("option", { value: m.id, text: `${getLang() === "mn" ? m.mn : m.en} · ${m.elements}`, selected: m.id === st.materialId })));
      ui.mine.replaceChildren(...MINES.map((m) => el("option", { value: m.id, text: getLang() === "mn" ? m.mn : m.en, selected: m.id === st.mineId })), el("option", { value: "", text: "—", selected: !st.mineId }));
      for (const s of ui.fields.querySelectorAll("span[data-k]")) s.textContent = t(s.dataset.k) + (s.dataset.k === "mine_dur" ? ` (${t("mine_hours")})` : s.dataset.k === "mine_radius" ? ` (${t("mine_km")})` : "") + ": ";
      ui.pick.textContent = st.picking ? t("mine_pick_on") : t("mine_pick");
      ui.run.textContent = t("mine_run"); ui.event.textContent = t("mine_event"); ui.play.textContent = st.playing ? t("pause") : t("play");
      ui.labels.plume.textContent = t("l_plume"); ui.labels.wind.textContent = t("l_wind"); ui.labels.homes.textContent = t("l_homes"); ui.labels.water.textContent = t("l_water");
      ui.labels.aod.textContent = t("l_aod"); ui.labels.hls.textContent = t("l_hls");
      if (st.sim) { renderReadout(); renderResults(); }
    }
    build();
    /** Same simulation with the source at any point, for the area selected on the map. */
    async function runAt({ lat, lon, date, radius, fit, material }) {
      if (material) setMaterial(material);
      st.date = date; ui.date.value = date;
      st.hour = 0; ui.hour.value = "0";
      st.radius = radius; ui.rad.value = String(radius);
      st.fit = fit;
      ui.mine.value = "";
      setSource(lat, lon, null);
      await run();
      st.fit = null;
    }
    /** What the image and the report need from the current plume, or null. */
    function snapshotForExport() {
      if (!st.active || !st.sim || !st.overlay) return null;
      const f = st.sim.field, h = st.h, e = st.extent, arrows = st.show.wind ? windArrows(windMarks.view()) : [];
      const m = materialById(st.materialId), hit = hits();
      const wind = [];
      f.lats.forEach((lat, r) => f.lons.forEach((lon, c) => {
        const k = r * f.nx + c, u = f.u[h * 49 + k], v = f.v[h * 49 + k];
        if (fin(u) && fin(v)) wind.push({ lat, lon, u, v, speed: Math.hypot(u, v), from: ((Math.atan2(u, v) * 180) / Math.PI + 540) % 360 });
      }));
      const index = Float32Array.from(st.frames[h], (x) => (st.ref > 0 ? Math.min(100, (100 * x) / st.ref) : 0));
      return { image: st.show.plume ? st.overlay.getElement() : null, homes: st.show.homes && hit.length ? { canvas: campMarks.canvas, box: campMarks.box } : null, stats: st.stats, range: st.range, direction: st.stats?.area ? t("dirs")[Math.round(st.stats.bearing / 45) % 8] : null, water: st.waterHit, box: { n: e.n, s: e.s, w: e.w, e: e.e }, arrows, wind, index, w: st.W, h: st.H, material: m.id, materialName: getLang() === "mn" ? m.mn : m.en, density: m.rho, time: f.time[h], lat: st.lat, lon: st.lon, spread: st.spread,
        camps: st.camps ? { parcels: hit.reduce((a, c) => a + c.parcels, 0), herders: hit.reduce((a, c) => a + c.herders, 0) } : null };
    }
    return { st, relabel, runAt, snapshotForExport, show(on, keepView) { st.active = on; if (!on) stopPlay(); syncLayerVisibility(); if (on && !st.sim && !keepView) { map.setView([st.lat, st.lon], 8); } } };
  }

  /* ============================================================ public API */
  return {
    setView(v) { view = v; T.poly.show(v === "poly"); T.mine.show(v === "mine"); },
    relabel() { T.poly.relabel(); T.mine.relabel(); },
    setHazard(h) { T.poly.setHazard(h); },
    plumeSnapshot: () => T.mine.snapshotForExport(),
    plumeAt(opts) { view = "mine"; T.poly.show(false); T.mine.show(true, true); return T.mine.runAt(opts); },
  };
}
