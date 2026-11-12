/* "Mine dust and vegetation": the dust footprint of a coal mine in grass cover, read from the vegetation around it
 * (js/minedust_veg.js), inside its own box under the wind and dust model. The summer NDVI comes from Sentinel-2 L2A on
 * the Planetary Computer (js/aoi/stac.js), the wind rose from Open-Meteo's ERA5 archive, the camps from
 * data/camps.bin.gz; all free and without a key, all read in the browser. After a run a small panel lets the user
 * switch four layers: the wind of a chosen day and hour, the camps in the footprint, the satellite aerosol (AOD) of
 * that day, and the vegetation anomaly itself. The wind that counts is not the whole summer's but its emission
 * episodes (dry ground after rain, wind at the onset); each can be picked alone, or all together, and the mark on
 * the vegetation is attributed to the picked episodes' downwind sectors. For a mine with public reports
 * (VEG_REPORTS) the panel sets the result against them. */
import { el } from "./dom.js";
import { API, TZ, VEG_MINES, VEG_REPORTS } from "./config.js";
import { domain } from "./minedaily.js";
import { search, passes, bandOnGrid, rgbOnGrid } from "./aoi/stac.js";
import { CLOUDY_SCL } from "./aoi/raster.js";
import { backdrop } from "./aoi/backdrop.js";
import { EPI, VEG, anomalyGrid, attribute, campsExposed, campsInSector, classify, combineRoses, deficits, emissionWeight, episodes, footprintKm2, geometry, hoursSinceRain, innerRingCells, ndviChange, pairCandidates, reaches, sectorOf, sectorRingStats, spearman, washedBetween } from "./minedust_veg.js";
import { arrowLength, createViewCanvas, drawArrow, paintCamps } from "./mapmarks.js";
import { csv } from "./formats.js";

const TT = {
  mn: {
    veg_title: "Уурхайн тоосжилт ба ургамал",
    veg_help: "Уурхай, жил сонгоод «Тооцоолох». Бороо навчийг угаасны дараах цэвэр Sentinel-2 зураг ба тоос дэгдсэн үеүдийн дараах тоостой зургийг хайж, хоёрын хоорондох ургамлын NDVI-ийн өөрчлөлтийг салхины 16 чигээр, уурхайгаас 3–30 км зайгаар харьцуулна. Ургамлын өсөлт бүх чигт ижил тул хасагдаж, хоорондох ялгаралтын үеүдийн салхи доод чигт үлдсэн бууралт нь уурхайн тоос. Тэр талбай дахь өвөлжөө, хаваржааг тоолно.",
    veg_mine: "Уурхай", veg_year: "Жил (6–8 сар)", veg_run: "Тооцоолох", veg_method: "Арга зүй",
    veg_fetch_sat: "Sentinel-2 зураг хайж байна…", veg_fetch_wind: "Салхины мэдээ (ERA5) татаж байна…", veg_compute: "Тооцоолж байна…", veg_done: "Бэлэн ({s} секунд).",
    veg_no_pass: "Энэ зун энэ газарт цэлмэг Sentinel-2 зураг олдсонгүй.", veg_no_wind: "Тухайн цагийн салхины мэдээ олдсонгүй.", veg_err: "Алдаа: ",
    veg_passes: "Зураг: {n} өнгөрөлт ({d}), үүлгүй {c}%. Ургамалтай нүд: {v}.",
    g_wind: "Салхи", g_camps: "Өвөлжөө, хаваржаа", g_aod: "AOD (хиймэл дагуул)", g_veg: "Тоосонд өртсөн ургамал",
    veg_date: "Огноо", veg_hour: "Цаг (УБ)",
    veg_wind_line: "{t}: салхи {u} м/с, {from}-с ({deg}°). Тоос {to} зүг рүү, тэр чигийн ул мөр {r} км.", veg_wind_none: "Салхи сул: тэр цагт тоос зөөхгүй (< 6 м/с).",
    veg_rose: "Сонгосон ялгаралтын үеүдэд тоос зөөсөн салхины гол чиг: {dirs}.", veg_rose_none: "Ялгаралтын үе сонгоогүй: салхины чиг тооцоонд ороогүй.",
    veg_camps_all: "Ул мөрийн талбайд (бүх тоостой чиг)", veg_camps_hour: "Сонгосон цагийн чигт", veg_parcels: "кадастрын нэгж", veg_herders: "малчны цэг",
    veg_camps_hint: "Байршил ≈1 км-ээр бүдүүлэгжсэн. Хоёр бүртгэл давхцаж болох тул нэмж болохгүй.",
    veg_aod_line: "MODIS MAIAC аэрозол (1 км), сонгосон огноо: агаар дахь бүх тоос, зөвхөн уурхайных биш.",
    veg_reach: "Тоостой чиг: {list}.", veg_area: "Ул мөрийн талбай {a} км² (3 км-ээс цааш).", veg_none: "3 км-ээс цааш салхи доод чигт NDVI-ийн дутагдал илрээгүй.", veg_sparse: "Ургамал хэт сийрэг: дотор цагирагийн 16 секторын {k}-д л хангалттай ургамал байна, тул энэ уурхайд тогтсон тоосыг энэ аргаар хэмжих боломжгүй.", veg_camps_none: "Өвөлжөө, хаваржааны өгөгдөл ачаалагдсангүй.",
    veg_rho: "Шалгалт: салхины давтамж ба дотор цагирагийн NDVI зөрүүний Spearman ρ = {rho}.", veg_rho_ok: "Сөрөг: салхи их чигт ургамал бага, арга энэ уурхайд ажиллаж байна.", veg_rho_weak: "Сул эсвэл сөрөг биш: ул мөрийг салхинаас биш өөр шалтгаанаар тайлбарлаж болно; болгоомжтой уншина уу.",
    veg_limits: "NDVI нь хөрс, бэлчээр, зам зэргээс ч өөрчлөгдөнө. Тор 100 м. Зөрүү харьцангуй, г/м² биш. Тоос их жилд ургамал бага байх ч бусад шалтгаан байж болно.",
    cls_dusty: "тоостой", cls_unclear: "тодорхойгүй", cls_clear: "цэвэр", veg_km: "км",
    px_heavy: "Их тоостой ургамал (NDVI −0.10-аас доош)", px_mid: "Дунд тоостой ургамал (−0.10…−0.05)", px_light: "Бага тоостой ургамал (−0.05…−0.02)", px_clean: "Цэвэр ургамал (−0.02-оос дээш)", px_bare: "Ургамалгүй, ус, үүл", px_none: "Торны гадна", px_other: "Тоостой ч сонгосон үеүдийн салхины чигт биш (өөр шалтгаан)",
    veg_pair: "Цэвэр зураг (бороо навч угаасны дараа, тоос дэгдээгүй): {a}. Тоостой зураг: {b}. Хоорондох ялгаралтын жин {w}.", veg_pair_sel: "Зургийн хос", veg_pair_opt: "{a} → {b} · жин {w}", veg_single: "Энэ зун «бороо угаасны дараах цэвэр зураг → ялгаралтын дараах тоостой зураг» хос олдсонгүй: ганц зургаар (хуучин аргаар) тооцлоо.",
    veg_classes_pair: "Пиксел бүрийн ангилал (100 м): цэвэр ба тоостой зургийн хооронд ургамлын NDVI хэр буурсныг ижил зайн цагирагийн медиантай харьцуулсан.", cmp_rgb: "Өнгөт зураг", cmp_ndvi: "NDVI", cmp_clean: "Цэвэр", cmp_dusty: "Тоостой", ep_help_pair: "Цэвэр ба тоостой зургийн хоорондох ялгаралтын үеүд (бороо зогссоноос ≥24 ц, хөрс хуурай, салхи ≥6 м/с; жин (u−6)·u²). Тэдгээрийн салхи доод чиг уурхайн тоосыг тодорхойлно.",
    ep_title: "Ялгаралтын үе", ep_help: "ERA5-ийн цаг тутмын салхи, хур тунадас, хөрсний чийг (0–7 см): сүүлийн ≥2 мм (24 цагийн нийлбэр) бороо зогссоноос хойш 24 цаг өнгөрсөн, хөрсний чийг зуны медианаас илүүгүй, салхи ≥6 м/с цагууд тоос дэгдээнэ; жин (u−6)·u². Зэргэлдээ цагууд (≤6 цагийн завсартай) нэг үе. Зургийн өдрөөс өмнөх, ≥5 мм борооноор угаагдаагүй үеүд л тооцоонд орно.",
    ep_all: "Бүгдийг нэгтгэж харах", ep_none: "Ялгаралтын үе олдсонгүй: салхи сул эсвэл хөрс чийгтэй байсан.", ep_count: "{n} үе, {h} цаг (≥6 м/с салхитай цагуудын {p} %); тооцоонд {k} үе. Зургийн өдөр {d}.",
    ep_line: "№{k} · {a} – {b} · {h} ц · ≤{u} м/с · {dirs} · хөрс {s} · бороо {r} · ρ {rho}", ep_after: "(зургийн дараа)", ep_washed: "(угаагдсан)", ep_norain: "бүртгэгдээгүй", ep_days: "{d} хоногийн өмнө",
    rp_title: "Тайлантай харьцуулах", rp_wind: "Салхи: ERA5 ялгаралтын үеүдэд тоос {top} зүг рүү.", rp_town: "Хот ({km} км хойд): {dirs} секторын 3–6 км {cls}, NDVI-ийн зөрүү {d}.", rp_dist: "Зай: тоостой чигт 3–6 км-д зөрүү {a}, 10–15 км-д {b}.",
    rp_ok: "Таарч байна.", rp_no: "Зөрж байна.", rp_fade: "Зайнаас хамаарч буурч байна: тогтсон тоос, замын тоосны шинж.", rp_nofade: "Зайнаас хамаарч буурахгүй: тоосноос өөр шалтгаан байж болно.", rp_nodusty: "Тоостой чиг илрээгүй тул зайн шалгалт хийгдэхгүй.", rp_links: "Эх сурвалж:",
    veg_classes: "Пиксел бүрийн ангилал (100 м): ургамлын NDVI-ийн зөрүү ижил зайн цагирагийн медианаас.", veg_class_area: "{n}: {a} км²", veg_window: "Томруулж харах", veg_window_title: "Уурхайн тоосжилт ба ургамал",
    veg_camps_px: "Өвөлжөө, хаваржааг байрлалынх нь 1 км² дэх ургамлын ангиллаар (3–30 км):", veg_camps_on: "{n} дээр", veg_camps_total: "3–30 км-д нийт", veg_camps_dusted: "Уурхайн тоостой ургамал дээр (их, дунд, бага) нийт",
    veg_dl_sectors: "Сектор, цагирагийн хүснэгт", veg_dl_camps: "Өвөлжөө, хаваржаа ангиллаар", veg_dl_wind: "Цаг тутмын салхи, бороо, хөрсний чийг", veg_dl_episodes: "Ялгаралтын үеүд", veg_dl_title: "Уурхайн тоосжилт ба ургамал", veg_dl_period: "Sentinel-2 {d}; салхи {a} – {b}",
    veg_nd_note: "Ангиллын растерт 0 = торны гадна (3 км дотор эсвэл 30 км-ээс цааш, NoData), 1 = ургамалгүй, ус, үүл, 6 = тоостой ч сонгосон ялгаралтын үеүдийн салхины чигт биш.", veg_b_anom: "NDVI-ийн зөрүү = ургамлын пикселийн NDVI − ижил зайн цагирагийн медиан; −9999 = ургамал биш", veg_b_ndvi: "Зуны NDVI (ургамлын пиксел); −9999 = ургамал биш", veg_b_canom: "NDVI-ийн өөрчлөлтийн зөрүү = (тоостой − цэвэр) − ижил зайн цагирагийн медиан; −9999 = ургамал биш", veg_b_change: "NDVI-ийн өөрчлөлт = тоостой − цэвэр зураг", veg_b_clean: "Цэвэр зургийн NDVI ({d})", veg_b_dusty: "Тоостой зургийн NDVI ({d})",
    veg_e_rel: "Зөрүү харьцангуй (NDVI-ийн нэгж), г/м² биш; хөрс, бэлчээр, зам ч NDVI-г өөрчилнө.", veg_e_px: "Пиксел 100 м; өвөлжөөний байршил ≈1 км-ээр бүдүүлэгжсэн тул ангилал нь 1 км² талбайн дундаж.",
    dirs16: ["хойд", "хойд-зүүн хойд", "зүүн хойд", "зүүн-зүүн хойд", "зүүн", "зүүн-зүүн өмнөд", "зүүн өмнөд", "өмнөд-зүүн өмнөд", "өмнөд", "өмнөд-баруун өмнөд", "баруун өмнөд", "баруун-баруун өмнөд", "баруун", "баруун-баруун хойд", "баруун хойд", "хойд-баруун хойд"],
  },
  en: {
    veg_title: "Mine dust and vegetation",
    veg_help: "Pick a mine and a year, then Compute. The box finds a clean Sentinel-2 image taken after rain washed the leaves and a dusty one taken after dust was lifted, and compares the change of the vegetation's NDVI between them across 16 wind sectors and 3 to 30 km from the mine. Growth is alike in every direction and drops out; the fall left downwind of the episodes between the two is the mine's dust. The winter and spring camps in that area are counted.",
    veg_mine: "Mine", veg_year: "Year (June–August)", veg_run: "Compute", veg_method: "Method",
    veg_fetch_sat: "Searching Sentinel-2 passes…", veg_fetch_wind: "Loading the wind (ERA5)…", veg_compute: "Computing…", veg_done: "Ready ({s} s).",
    veg_no_pass: "No clear Sentinel-2 image of this area that summer.", veg_no_wind: "No wind data for that hour.", veg_err: "Error: ",
    veg_passes: "Imagery: {n} passes ({d}), {c}% cloud-free. Vegetation cells: {v}.",
    g_wind: "Wind", g_camps: "Winter and spring camps", g_aod: "AOD (satellite)", g_veg: "Dust-affected vegetation",
    veg_date: "Date", veg_hour: "Hour (UB)",
    veg_wind_line: "{t}: wind {u} m/s from the {from} ({deg}°). Dust goes {to}; the mark in that sector reaches {r} km.", veg_wind_none: "Light wind: no dust carried at that hour (< 6 m/s).",
    veg_rose: "Main dust-carrying wind of the picked emission episodes toward: {dirs}.", veg_rose_none: "No emission episode picked: the wind is out of the account.",
    veg_camps_all: "In the footprint (all dusty sectors)", veg_camps_hour: "In the sector of the chosen hour", veg_parcels: "cadastre parcels", veg_herders: "herder points",
    veg_camps_hint: "Positions are rounded to about 1 km. The two registers may overlap, so do not add them.",
    veg_aod_line: "MODIS MAIAC aerosol (1 km) of the chosen date: all dust in the air, not the mine's alone.",
    veg_reach: "Dusty sectors: {list}.", veg_area: "Footprint {a} km² (beyond 3 km).", veg_none: "No NDVI deficit downwind beyond 3 km.", veg_sparse: "Vegetation too sparse: only {k} of the 16 inner-ring sectors hold enough vegetation, so settled dust cannot be measured this way at this mine.", veg_camps_none: "The camp data did not load.",
    veg_rho: "Check: Spearman ρ between wind share and inner-ring NDVI deficit = {rho}.", veg_rho_ok: "Negative: less vegetation where the wind blows more; the method holds for this mine.", veg_rho_weak: "Weak or not negative: the mark may come from something other than the wind; read with care.",
    veg_limits: "NDVI also changes with soil, grazing and roads. 100 m cells. The contrast is relative, not g/m². Less vegetation in a dusty year can have other causes.",
    cls_dusty: "dusty", cls_unclear: "unclear", cls_clear: "clear", veg_km: "km",
    px_heavy: "Heavily dusted vegetation (NDVI below −0.10)", px_mid: "Moderately dusted vegetation (−0.10 to −0.05)", px_light: "Lightly dusted vegetation (−0.05 to −0.02)", px_clean: "Clean vegetation (above −0.02)", px_bare: "No vegetation, water or cloud", px_none: "Outside the grid", px_other: "Dusted but not downwind of the picked episodes (another cause)",
    ep_title: "Emission episodes", ep_help: "From ERA5 hourly wind, precipitation and soil moisture (0–7 cm): an hour lifts dust when 24 h have passed since the end of the last rain of 2 mm or more (24 h sum), the soil is no wetter than the summer median and the wind is 6 m/s or more; weight (u−6)·u². Neighbouring hours (gaps up to 6 h) form one episode. Only episodes before the image date and not washed off by rain of 5 mm or more are counted.",
    ep_all: "Show all together", ep_none: "No emission episode: the wind was light or the ground wet.", ep_count: "{n} episodes, {h} hours ({p} % of the hours at 6 m/s or more); {k} counted. Image date {d}.",
    ep_line: "No. {k} · {a} – {b} · {h} h · ≤{u} m/s · {dirs} · soil {s} · rain {r} · ρ {rho}", ep_after: "(after the image)", ep_washed: "(washed off)", ep_norain: "none recorded", ep_days: "{d} days before",
    veg_pair: "Clean image (after rain washed the leaves, no dust lifted since): {a}. Dusty image: {b}. Emission weight between: {w}.", veg_pair_sel: "Image pair", veg_pair_opt: "{a} → {b} · weight {w}", veg_single: "No pair of a clean image after washing rain and a dusty one after emission this summer: computed from a single image (the older way).",
    veg_classes_pair: "Class of every 100 m pixel: how much the NDVI of the vegetation fell from the clean to the dusty image, against the median of its ring.", cmp_rgb: "True colour", cmp_ndvi: "NDVI", cmp_clean: "Clean", cmp_dusty: "Dusty", ep_help_pair: "The emission episodes between the clean and the dusty image (24 h after the end of rain, dry soil, wind of 6 m/s or more; weight (u−6)·u²). Their downwind sectors attribute the dust to the mine.",
    rp_title: "Against the mine's reports", rp_wind: "Wind: in the ERA5 emission episodes dust went {top}.", rp_town: "Town ({km} km north): sectors {dirs} at 3–6 km are {cls}, NDVI deficit {d}.", rp_dist: "Distance: in the dusty sectors the deficit is {a} at 3–6 km and {b} at 10–15 km.",
    rp_ok: "Agrees.", rp_no: "Disagrees.", rp_fade: "Fading with distance: the mark of settled dust, of a haul-road source.", rp_nofade: "Not fading with distance: a cause other than dust is possible.", rp_nodusty: "No dusty sector, so no distance check.", rp_links: "Sources:",
    veg_classes: "Class of every 100 m pixel: the NDVI of the vegetation against the median of its ring.", veg_class_area: "{n}: {a} km²", veg_window: "Open in a window", veg_window_title: "Mine dust and vegetation",
    veg_camps_px: "Winter and spring camps by the vegetation class of their 1 km² (3–30 km):", veg_camps_on: "On {n}", veg_camps_total: "All within 3–30 km", veg_camps_dusted: "On mine-dusted vegetation (heavy, moderate, light) in all",
    veg_dl_sectors: "Sector and ring table", veg_dl_camps: "Camps by class", veg_dl_wind: "Hourly wind, rain and soil moisture", veg_dl_episodes: "Emission episodes", veg_dl_title: "Mine dust and vegetation", veg_dl_period: "Sentinel-2 {d}; wind {a} – {b}",
    veg_nd_note: "In the class raster 0 = outside the grid (inside 3 km or beyond 30 km, NoData), 1 = no vegetation, water or cloud, 6 = dusted but not downwind of the picked emission episodes.", veg_b_anom: "NDVI anomaly = NDVI of the vegetation pixel − median of its ring; −9999 = not vegetation", veg_b_ndvi: "Summer NDVI (vegetation pixels); −9999 = not vegetation", veg_b_canom: "NDVI change anomaly = (dusty − clean) − median of its ring; −9999 = not vegetation", veg_b_change: "NDVI change = dusty − clean image", veg_b_clean: "NDVI of the clean image ({d})", veg_b_dusty: "NDVI of the dusty image ({d})",
    veg_e_rel: "The contrast is relative (NDVI units), not g/m²; soil, grazing and roads change NDVI too.", veg_e_px: "Pixels are 100 m; camp positions are rounded to about 1 km, so a camp's class is the mean of its 1 km².",
    dirs16: ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"],
  },
};

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const num = (v) => (typeof v === "number" ? v : NaN);
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
  { code: 6, key: "other", color: [150, 150, 200], on: false, paint: true },
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
    show: { wind: true, camps: true, aod: false, veg: true }, pick: [],
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
  /** One pass on the full grid: the NDVI of every clear pixel that is not water or snow, and the vegetation among
   * them (NDVI of VEG.vegNdvi or more). */
  async function readPass(grid, p, N) {
    const scl = await band(grid, p.items, { assets: "SCL", rescale: "0,255" }, asIs);
    let nd = null; for (const it of p.items) nd = await bandOnGrid(grid, it, ndviQuery(it), fromNdvi, nd);
    const ndvi = new Float32Array(N).fill(NaN), veg = new Uint8Array(N), clear = new Uint8Array(N);
    let seen = 0;
    for (let i = 0; i < N; i++) {
      const c = scl[i];
      if (Number.isNaN(c) || CLOUDY_SCL.has(c)) continue;
      clear[i] = 1; seen++;
      if (c === 6 || c === 11 || !fin(nd[i])) continue;
      ndvi[i] = nd[i];
      if (nd[i] >= VEG.vegNdvi) veg[i] = 1;
    }
    return { ndvi, veg, clear, seen };
  }
  /** The hour of a pass in the hourly series: the satellite passes near 11:00 local; past the end, the series' length. */
  const hourOf = (hours, date) => { const i = hours.time.findIndex((tm) => tm >= `${date}T11:00`); return i < 0 ? hours.time.length : i; };

  async function run() {
    const m = mine();
    st.running = true; st.error = false; st.res = null; st.hourRes = null; st.status = ""; st.prep = null; paint(); render();
    const t0 = performance.now();
    busy(true);
    try {
      const dom = domain(m.lat, m.lon, VEG.radiusKm, VEG.cellM), e = dom.extent;
      const grid = { west: e.w, north: e.n, dx: (e.e - e.w) / dom.w, dy: (e.n - e.s) / dom.h, w: dom.w, h: dom.h };
      // the growing season; the archive lags about five days behind today, so the current year ends where it does
      const from = `${st.year}-05-20`, lastDay = addDays(iso(Date.now()), -6), to = `${st.year}-09-10` < lastDay ? `${st.year}-09-10` : lastDay;
      if (to <= from) throw new Error(t("veg_no_pass"));
      const my = ++st.runToken;
      // the wind, rain and soil first, from the start of May: the clean image needs the rain before it
      st.status = { k: "veg_fetch_wind" }; render();
      const windFrom = `${st.year}-05-01`;
      const q = new URLSearchParams({ latitude: m.lat.toFixed(3), longitude: m.lon.toFixed(3), start_date: windFrom, end_date: to, timezone: TZ, wind_speed_unit: "ms", hourly: "wind_speed_10m,wind_direction_10m,precipitation,soil_moisture_0_to_7cm", models: "era5" });
      const w = await getJson(`${API.archive}?${q}`);
      if (my !== st.runToken) return;
      const hours = { time: w.hourly.time ?? [], speed: Float32Array.from(w.hourly.wind_speed_10m ?? [], num), dir: Float32Array.from(w.hourly.wind_direction_10m ?? [], num), precip: Float32Array.from(w.hourly.precipitation ?? [], num), soil: Float32Array.from(w.hourly.soil_moisture_0_to_7cm ?? [], num), from: windFrom, to };
      hours.sinceRain = hoursSinceRain(hours.precip); hours.weight = emissionWeight(hours);
      st.status = { k: "veg_fetch_sat" }; render();
      const items = await search("sentinel-2-l2a", e, from, to);
      const ps = passes(items);
      if (!ps.length) throw new Error(t("veg_no_pass"));
      // passes ranked by the share of clear ground on a coarse grid, as the dust check does; the scene's own cloud figure
      // speaks of a 100 km tile, not of these 60 km. A few passes at a time, so that the data API is not asked for the
      // whole summer at once; a pass that fails to read ranks as if it were cloudy
      const coarse = { ...grid, dx: grid.dx * 3, dy: grid.dy * 3, w: dom.w / 3, h: dom.h / 3 };
      const shares = new Array(ps.length).fill(0);
      await inBatches(ps, 4, async (p, i) => {
        const scl = await band(coarse, p.items, { assets: "SCL", rescale: "0,255" }, asIs).catch(() => null);
        if (!scl) return;
        let ok = 0; for (const v of scl) if (!Number.isNaN(v) && !CLOUDY_SCL.has(v)) ok++;
        shares[i] = ok / scl.length;
      });
      if (my !== st.runToken) return;
      const list = ps.map((p, i) => ({ p, share: shares[i], date: iso(p.t0), i: hourOf(hours, iso(p.t0)) }));
      if (!list.some((x) => x.share > 0.05)) throw new Error(t("veg_no_pass"));
      // pairs of a clean image (after a washing rain, no emission since) and a dusty one (emission between, no washing
      // rain between), the most emission first
      const cands = pairCandidates(list, hours).slice(0, 8);
      const camps = await campsFor?.(e).catch(() => null) ?? null;
      if (my !== st.runToken) return;
      st.prep = { m, dom, grid, e, hours, list, cands, camps };
      st.pairIdx = 0;
      if (!(await compute(my))) return;
      st.status = { k: "veg_done", v: { s: Math.round((performance.now() - t0) / 1000) } };
      // the whole 30 km domain in view, clear of the side panel on a wide screen
      map.fitBounds([[e.s, e.w], [e.n, e.e]], { paddingTopLeft: [window.innerWidth > 1000 ? 360 : 10, 70], paddingBottomRight: [10, 110] });
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

  /** Another pair of images from the list: read the two passes again and recompute. */
  async function choosePair(idx) {
    if (!st.prep || st.running) return;
    st.pairIdx = idx;
    st.running = true; st.error = false; st.status = { k: "veg_fetch_sat" }; render();
    busy(true);
    const t0 = performance.now(), my = ++st.runToken;
    try {
      if (await compute(my)) { st.status = { k: "veg_done", v: { s: Math.round((performance.now() - t0) / 1000) } }; openView(); }
    } catch (err) {
      console.error(err);
      st.error = true; st.status = { k: "veg_err", v: err.message };
    }
    busy(false);
    st.running = false;
    render();
  }

  /** The result of the prepared run: the NDVI change between the chosen clean and dusty images, or, when the summer
   * holds no such pair, the single clearest image as before. Returns false when a newer run took over. */
  async function compute(my) {
    const P = st.prep, { m, dom, grid, e, hours, list, cands, camps } = P, N = dom.w * dom.h;
    const geo = geometry(m, dom), nr = VEG.rings.length - 1;
    let res;
    if (cands.length) {
      const c = cands[st.pairIdx] ?? cands[0], A = list[c.a], B = list[c.b];
      const [pa, pb] = await Promise.all([readPass(grid, A.p, N), readPass(grid, B.p, N)]);
      if (my !== st.runToken) return false;
      const { delta, mask } = ndviChange(pa.ndvi, pb.ndvi, pa.veg);
      // the episodes between the two images only: they put the dust there
      const wBetween = Float32Array.from(hours.weight, (v, h) => (h > A.i && h <= B.i ? v : 0));
      const eps = episodes(hours, wBetween);
      let both = 0, vegN = 0; for (let i = 0; i < N; i++) { if (pa.clear[i] && pb.clear[i]) both++; if (mask[i]) vegN++; }
      res = { mode: "pair", clean: A.date, dusty: B.date, value: delta, veg: mask, ndvi: pb.ndvi, ndviClean: pa.ndvi, passA: A.p, passB: B.p, eps,
        passes: [A.date, B.date], passDate: B.date, iPass: B.i, pairWeight: c.weight, cloud: Math.round((100 * both) / N), vegN };
    } else {
      // no clean image after rain with a dusty one behind it: the clearest image, its gaps filled from passes within
      // 20 days of it (the grass changes through the summer by more than the deficit looked for)
      const ranked = list.filter((x) => x.share > 0.05).sort((a, b) => b.share - a.share || b.p.t0 - a.p.t0);
      const order = ranked.filter((x) => Math.abs(x.p.t0 - ranked[0].p.t0) <= 20 * 86400000);
      const ndvi = new Float32Array(N).fill(NaN), veg = new Uint8Array(N), seenMask = new Uint8Array(N), used = [];
      let seen = 0, vegN = 0;
      for (const x of order.slice(0, 3)) {
        const r = await readPass(grid, x.p, N);
        if (my !== st.runToken) return false;
        let filled = 0;
        for (let i = 0; i < N; i++) {
          if (seenMask[i] || !r.clear[i]) continue;
          seenMask[i] = 1; seen++; filled++;
          if (r.veg[i]) { veg[i] = 1; ndvi[i] = r.ndvi[i]; vegN++; }
        }
        if (filled) used.push(x);
        if (seen / N >= 0.95) break;
      }
      if (!seen) throw new Error(t("veg_no_pass"));
      const passDate = used[0].date, iPass = used[0].i;
      const eps = episodes(hours, hours.weight).map((ep) => ({ ...ep, after: ep.i0 >= iPass, washed: ep.i0 < iPass && washedBetween(hours.precip, Math.min(ep.i1, iPass), iPass) }));
      res = { mode: "single", value: ndvi, veg, ndvi, eps, passes: used.map((x) => x.date), passDate, iPass, cloud: Math.round((100 * seen) / N), vegN };
    }
    st.status = { k: "veg_compute" }; render();
    await new Promise((ok) => setTimeout(ok, 0));
    const stats = sectorRingStats(res.value, res.veg, geo), def = deficits(stats, nr), reach = reaches(def);
    const inner = Array.from({ length: VEG.sectors }, (_, s) => def.deficit[s * nr]);
    res.eps = res.eps.map((ep, k) => ({ after: false, washed: false, ...ep, k, rho: spearman(Array.from(ep.rose), inner) }));
    let windy = 0; for (const v of hours.speed) if (v >= VEG.onset) windy++;
    Object.assign(res, { mine: m, year: st.year, dom, geo, stats, def, inner, hours, reach, camps, anomaly: anomalyGrid(res.value, res.veg, geo, def.ringMedian),
      windyHours: windy, episodeHours: res.eps.reduce((a, ep) => a + ep.hours, 0), measured: innerRingCells(stats, nr), pairs: cands.length });
    res.base = new Uint8Array(N);
    for (let i = 0; i < N; i++) res.base[i] = pixelClass(res.anomaly[i], geo.ring[i] >= 0, res.veg[i] === 1);
    res.grid = { west: e.w, north: e.n, dx: grid.dx, dy: grid.dy, w: dom.w, h: dom.h, scale: VEG.cellM };
    st.pick = res.eps.map((ep) => !ep.after && !ep.washed);
    st.res = res;
    applyPick(false);
    window.vegResult = res; // the last result, for checks in the browser console
    paint();
    onResult();
    return true;
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

  /** Everything that follows from the picked episodes: their combined rose, the sector classes, the footprint, ρ, the
   * pixel codes (a dusted pixel off the picked wind is another cause), the areas, the camps, the picture. */
  function applyPick(redraw = true) {
    const r = st.res;
    if (!r) return;
    const N = r.base.length;
    r.rose = combineRoses(r.eps, st.pick);
    r.cls = classify(r.reach, r.rose);
    r.rho = spearman(Array.from(r.rose), r.inner);
    r.area = footprintKm2(r.reach, r.cls);
    r.exposed = campsExposed(r.camps ?? [], r.mine, r.reach, r.cls);
    r.codes = attribute(r.base, r.geo.sector, r.rose);
    r.areas = new Float64Array(PX.length); const cellKm2 = (VEG.cellM / 1000) ** 2;
    for (let i = 0; i < N; i++) r.areas[r.codes[i]] += cellKm2;
    r.campsByClass = classifyCamps(r);
    r.picked = st.pick.filter(Boolean).length;
    classCanvas(r); // drawn once per set of switched-on classes and picked episodes
    if (redraw) { paint(); onResult(); render(); }
  }

  /* ---------------------------------------------------------------- map */
  /** Each camp by the vegetation of the 1 km² around its (rounded) position: the mean anomaly of the vegetation
   * pixels there, in the same classes as the pixels; a dusted camp off the picked wind is class 6 like the pixels.
   * Returns counts per class; writes `cls`, `sector` and `km` on the camps. */
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
      if (c.cls >= 2 && c.cls <= 4 && !(r.rose[c.sector] >= 1 / VEG.sectors)) c.cls = 6;
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
    const h = r.hours, epOf = new Int16Array(h.time.length).fill(-1);
    for (const ep of r.eps) for (let i = ep.i0; i <= ep.i1; i++) if (h.weight[i] > 0) epOf[i] = ep.k + 1;
    const v = (x, d) => (fin(x) ? x.toFixed(d) : "");
    const rows = h.time.map((tm, i) => [tm, v(h.speed[i], 1), v(h.dir[i], 0), fin(h.speed[i]) && fin(h.dir[i]) && h.speed[i] >= VEG.onset ? dir16(sectorOf((h.dir[i] + 180) % 360)) : "", v(h.precip[i], 2), v(h.soil[i], 3), Number.isFinite(h.sinceRain[i]) ? h.sinceRain[i] : "", v(h.weight[i], 1), epOf[i] > 0 ? epOf[i] : ""]);
    return csv(["time_local", "wind_speed_m_s", "wind_from_deg", "dust_toward", "precipitation_mm", "soil_moisture_0_7cm", "since_rain_h", "emission_weight", "episode"], rows);
  }
  function episodesCsv(r) {
    const rows = r.eps.map((ep) => {
      const top = Array.from(ep.rose).map((v, s) => [v, s]).sort((a, b) => b[0] - a[0]).slice(0, 3).filter((x) => x[0] > 0);
      return [ep.k + 1, ep.start, ep.end, ep.hours, ep.weight.toFixed(0), ep.umax.toFixed(1), fin(ep.soil) ? ep.soil.toFixed(3) : "", Number.isFinite(ep.sinceRain) ? ep.sinceRain : "", ep.after ? 1 : 0, ep.washed ? 1 : 0, st.pick[ep.k] ? 1 : 0, fin(ep.rho) ? ep.rho.toFixed(3) : "", ...[0, 1, 2].flatMap((j) => (top[j] ? [TT.en.dirs16[top[j][1]], top[j][0].toFixed(3)] : ["", ""]))];
    });
    return csv(["episode", "start_local", "end_local", "hours", "weight", "max_wind_m_s", "soil_moisture_0_7cm", "since_rain_h", "after_image", "washed", "picked", "spearman_rho", "toward_1", "share_1", "toward_2", "share_2", "toward_3", "share_3"], rows);
  }
  /** The result for the GIS downloads (js/aoi/files.js): the class raster, the anomaly and NDVI values, and three CSV
   * tables of its own (sectors, camps, wind). */
  function layer() {
    const r = st.res;
    if (!r) return null;
    const g = r.grid, e = r.dom.extent, en = (k) => TT.en[k] ?? k, year = r.year, stamp = `${r.mine.id}_${year}`;
    const no = (a, mask) => Float32Array.from(a, (v, i) => (mask[i] && fin(v) ? v : -9999));
    const dusted = r.campsByClass.slice(2, 5).reduce((o, c) => ({ parcels: o.parcels + c.parcels, herders: o.herders + c.herders }), { parcels: 0, herders: 0 });
    const lines = [...vegLines(), ...windLines(), ...episodeLines(), `${t("veg_camps_dusted")}: ${dusted.parcels} ${t("veg_parcels")}, ${dusted.herders} ${t("veg_herders")}.`, ...reportLines()];
    return {
      hazard: "minedust", stamp, title: `${t("veg_dl_title")} · ${mineName(r.mine)}`, titleEn: `Mine dust and vegetation, ${r.mine.en}`,
      period: fill(t("veg_dl_period"), { d: r.passes.join(", "), a: r.hours.from, b: r.hours.to }), periodShort: `${year}_summer`, method: [t("veg_help"), t("ep_help")].join(" "),
      grid: g, scale: VEG.cellM, km2: r.areas.slice(1).reduce((a, b) => a + b, 0), box: { s: e.s, n: e.n, w: e.w, e: e.e },
      codes: r.codes, noData: 0, missing: [0, 1], noDataNote: t("veg_nd_note"),
      classes: PX.map((c) => ({ code: c.code, key: c.key, mn: t("px_" + c.key), en: en("px_" + c.key), color: c.color, vector: c.code >= 2, paint: c.paint })),
      bands: r.mode === "pair"
        ? [{ name: "ndvi_change_anomaly", data: no(r.anomaly, r.veg), about: t("veg_b_canom") }, { name: "ndvi_change", data: no(r.value, r.veg), about: t("veg_b_change") },
          { name: "ndvi_clean", data: no(r.ndviClean, r.veg), about: fill(t("veg_b_clean"), { d: r.clean }) }, { name: "ndvi_dusty", data: no(r.ndvi, r.veg), about: fill(t("veg_b_dusty"), { d: r.dusty }) }]
        : [{ name: "ndvi_anomaly", data: no(r.anomaly, r.veg), about: t("veg_b_anom") }, { name: "ndvi", data: no(r.ndvi, r.veg), about: t("veg_b_ndvi") }],
      meta: { mine: r.mine.en, mine_lat: r.mine.lat, mine_lon: r.mine.lon, year, sentinel2_passes: r.passes.join(" "), seen_pct: r.cloud, measured_inner_sectors: r.measured,
        method: r.mode === "pair" ? "clean/dusty image pair" : "single image", clean_image: r.clean ?? null, dusty_image: r.dusty ?? null, emission_episodes: r.eps.length, emission_episodes_picked: r.picked, emission_hours: r.episodeHours, hours_at_or_over_onset: r.windyHours, episodes_picked: r.eps.filter((ep) => st.pick[ep.k]).map((ep) => `${ep.start}/${ep.end}`).join(" ") || "none",
        dusty_sectors: Array.from(r.cls).map((c, s) => (c === 2 ? TT.en.dirs16[s] + " " + r.reach[s] + "km" : null)).filter(Boolean).join(" ") || "none", spearman_rho: fin(r.rho) ? r.rho.toFixed(3) : null,
        camps_on_dusted_vegetation_parcels: dusted.parcels, camps_on_dusted_vegetation_herder_points: dusted.herders, source: "Microsoft Planetary Computer: Sentinel-2 L2A; Open-Meteo ERA5; cadastre and herder points" },
      summaryEn: `Mongolia Hazard Watch: mine dust on vegetation around ${r.mine.en}, summer ${year}. NDVI of each 100 m vegetation pixel against the median of its distance ring, in 16 wind sectors, set against the downwind sectors of ${r.picked} of ${r.eps.length} ERA5 emission episodes (dry ground after rain, wind of 6 m/s or more). Dusty sectors: ${Array.from(r.cls).filter((c) => c === 2).length}. Camps on mine-dusted vegetation: ${dusted.parcels} cadastre parcels, ${dusted.herders} herder points. A relative contrast, not a dust mass. Not an official warning.`,
      summaryHere: lines[0], lines, verdict: null,
      error: [t("veg_e_rel"), t("veg_e_px"), t("veg_camps_hint")], warn: t("veg_limits"), src: "Sentinel-2 L2A (Microsoft Planetary Computer); Open-Meteo ERA5; data/camps.bin.gz",
      creditsEn: "Microsoft Planetary Computer; Copernicus Sentinel-2 (ESA); Open-Meteo (ERA5, ECMWF). Copyright holders of the source data keep their rights.",
      extras: [
        { label: "CSV", title: t("veg_dl_sectors"), name: `mongolia_minedust_${stamp}_sectors.csv`, make: () => sectorsCsv(r) },
        { label: "CSV", title: t("veg_dl_camps"), name: `mongolia_minedust_${stamp}_camps.csv`, make: () => campsCsv(r) },
        { label: "CSV", title: t("veg_dl_wind"), name: `mongolia_minedust_${stamp}_wind.csv`, make: () => windCsv(r) },
        { label: "CSV", title: t("veg_dl_episodes"), name: `mongolia_minedust_${stamp}_episodes.csv`, make: () => episodesCsv(r) },
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
  /** The true colour of one pass on the result's grid. */
  async function rgbCanvas(grid, pass) {
    const rgba = new Uint8ClampedArray(grid.w * grid.h * 4);
    for (const it of pass.items) await rgbOnGrid(grid, it, { assets: "visual" }, rgba);
    const cv = document.createElement("canvas"); cv.width = grid.w; cv.height = grid.h;
    cv.getContext("2d").putImageData(new ImageData(rgba, grid.w, grid.h), 0, 0);
    return cv;
  }
  /** NDVI as a picture, on one scale for both images: bare brown at 0 to deep green at 0.7; no value transparent. */
  function ndviCanvas(grid, ndvi) {
    const cv = document.createElement("canvas"); cv.width = grid.w; cv.height = grid.h;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(grid.w, grid.h), px = img.data;
    const stops = [[0, [150, 110, 70]], [0.2, [205, 185, 120]], [0.4, [140, 190, 90]], [0.7, [30, 110, 45]]];
    for (let i = 0; i < ndvi.length; i++) {
      const v = ndvi[i];
      if (!fin(v)) continue;
      let k = 1; while (k < stops.length - 1 && v > stops[k][0]) k++;
      const [a0, c0] = stops[k - 1], [a1, c1] = stops[k], f = Math.min(1, Math.max(0, (v - a0) / (a1 - a0)));
      for (let j = 0; j < 3; j++) px[i * 4 + j] = c0[j] + (c1[j] - c0[j]) * f;
      px[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  /** The classes in their own window, zoomable to single pixels, with the class of each pixel (js/aoi/viewer.js). */
  function openView() {
    const r = st.res;
    if (!r || !viewer) return;
    viewer.open({
      owner: "veg", title: `${t("veg_window_title")} · ${mineName(r.mine)} · ${r.mode === "pair" ? `${r.clean} → ${r.dusty}` : r.year}`, grid: r.grid, picture: () => st.canvas,
      label: (i) => t("px_" + PX[r.codes[i]].key) + (fin(r.anomaly[i]) ? ` (${r.anomaly[i] >= 0 ? "+" : ""}${r.anomaly[i].toFixed(3)})` : ""),
      empty: () => {
        if (st.drawn) return null;
        const top = PX.filter((c) => c.paint && !st.px[c.key] && r.areas[c.code] > 0).sort((a, b) => r.areas[b.code] - r.areas[a.code])[0];
        return top ? t("px_" + top.key) : null;
      },
      backdrop: () => { const d = [...r.passes].sort(); return backdrop(r.grid, d[0], d[d.length - 1]); },
      // the clean and the dusty image side by side, swiped by a line: true colour and NDVI
      compare: r.mode === "pair" ? { start: true, pairs: [
        { key: "rgb", label: t("cmp_rgb"), left: { label: `${t("cmp_clean")} ${r.clean}`, load: () => rgbCanvas(r.grid, r.passA) }, right: { label: `${t("cmp_dusty")} ${r.dusty}`, load: () => rgbCanvas(r.grid, r.passB) } },
        { key: "ndvi", label: t("cmp_ndvi"), left: { label: `${t("cmp_clean")} ${r.clean}`, load: async () => ndviCanvas(r.grid, r.ndviClean) }, right: { label: `${t("cmp_dusty")} ${r.dusty}`, load: async () => ndviCanvas(r.grid, r.ndvi) } },
      ] } : null,
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
      // the downwind sectors of the picked episodes, dashed, to the mark's reach or to the second ring edge
      for (let s = 0; s < VEG.sectors; s++) if (r.rose[s] >= 1 / VEG.sectors) wedge(r.mine, s, Math.max(r.reach[s], VEG.rings[1]), { color: "#fff", dashArray: "3 5", weight: 1.5, fill: false }).addTo(st.wedges);
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
    const top = topSectors(r.rose);
    out.push(r.picked ? fill(t("veg_rose"), { dirs: top.length ? top.map(([v, s]) => `${dir16(s)} ${Math.round(100 * v)}%`).join(", ") : "—" }) : t("veg_rose_none"));
    return out;
  }
  const topSectors = (rose, k = 3) => Array.from(rose).map((v, s) => [v, s]).sort((a, b) => b[0] - a[0]).filter((x) => x[0] >= 1 / VEG.sectors).slice(0, k);
  const hhmm = (tm) => tm.slice(5).replace("T", " ");
  function episodeLine(ep) {
    const dirs = topSectors(ep.rose).map(([v, s]) => `${dir16(s)} ${Math.round(100 * v)}%`).join(", ") || "—";
    const rain = Number.isFinite(ep.sinceRain) ? fill(t("ep_days"), { d: (ep.sinceRain / 24).toFixed(0) }) : t("ep_norain");
    const line = fill(t("ep_line"), { k: ep.k + 1, a: hhmm(ep.start), b: hhmm(ep.end), h: ep.hours, u: ep.umax.toFixed(1), dirs, s: fin(ep.soil) ? ep.soil.toFixed(2) : "—", r: rain, rho: fin(ep.rho) ? ep.rho.toFixed(2) : "—" });
    return ep.after ? `${line} ${t("ep_after")}` : ep.washed ? `${line} ${t("ep_washed")}` : line;
  }
  function episodeLines() {
    const r = st.res;
    if (!r.eps.length) return [t("ep_none")];
    return [fill(t("ep_count"), { n: r.eps.length, h: r.episodeHours, p: r.windyHours ? Math.round((100 * r.episodeHours) / r.windyHours) : 0, k: r.eps.filter((ep) => !ep.after && !ep.washed).length, d: r.passDate }), ...r.eps.filter((ep) => st.pick[ep.k]).map(episodeLine)];
  }
  /** The result against the mine's own reports (VEG_REPORTS): wind, the town, the fall with distance. */
  function reportLines() {
    const r = st.res, rp = VEG_REPORTS[r.mine.id];
    if (!r || !rp) return [];
    const nr = VEG.rings.length - 1, lang = TT[getLang()] ? getLang() : "mn", txt = rp[lang] ?? rp.mn, out = [];
    const top = topSectors(r.rose);
    const windOk = top.some(([, s]) => rp.downwind.includes(s));
    out.push(`${fill(t("rp_wind"), { top: top.length ? top.map(([v, s]) => `${dir16(s)} ${Math.round(100 * v)}%`).join(", ") : "—" })} ${txt.wind}${r.picked ? " " + t(windOk ? "rp_ok" : "rp_no") : ""}`);
    const townDef = rp.town.sectors.map((s) => r.def.deficit[s * nr]).filter(fin), townCls = rp.town.sectors.map((s) => r.cls[s]);
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    const clsTxt = townCls.includes(2) ? t("cls_dusty") : townCls.includes(1) ? t("cls_unclear") : t("cls_clear");
    out.push(`${fill(t("rp_town"), { km: rp.town.km, dirs: rp.town.sectors.map(dir16).join(", "), cls: clsTxt, d: fin(mean(townDef)) ? mean(townDef).toFixed(3) : "—" })} ${txt.town} ${t(townCls.includes(2) ? "rp_no" : "rp_ok")}`);
    const dusty = []; for (let s = 0; s < VEG.sectors; s++) if (r.cls[s] === 2) dusty.push(s);
    if (dusty.length) {
      const a = mean(dusty.map((s) => r.def.deficit[s * nr]).filter(fin)), b = mean(dusty.map((s) => r.def.deficit[s * nr + 2]).filter(fin));
      out.push(`${fill(t("rp_dist"), { a: fin(a) ? a.toFixed(3) : "—", b: fin(b) ? b.toFixed(3) : "—" })} ${t(fin(a) && fin(b) && a < b ? "rp_fade" : "rp_nofade")}`);
    } else out.push(t("rp_nodusty"));
    out.push(txt.source);
    return out;
  }
  function vegLines() {
    const r = st.res, out = [];
    out.push(r.mode === "pair" ? fill(t("veg_pair"), { a: r.clean, b: r.dusty, w: Math.round(r.pairWeight).toLocaleString() }) : t("veg_single"));
    const dusty = []; for (let s = 0; s < VEG.sectors; s++) if (r.cls[s] === 2) dusty.push(`${dir16(s)} ${r.reach[s].toFixed(0)} ${t("veg_km")}`);
    if (r.measured < VEG.sectors / 2) out.push(fill(t("veg_sparse"), { k: r.measured }));
    else out.push(dusty.length ? fill(t("veg_reach"), { list: dusty.join(", ") }) + " " + fill(t("veg_area"), { a: r.area.toFixed(0) }) : t("veg_none"));
    if (fin(r.rho) && r.measured >= VEG.sectors / 2) out.push(fill(t("veg_rho"), { rho: r.rho.toFixed(2) }) + " " + t(r.rho < -0.2 ? "veg_rho_ok" : "veg_rho_weak"));
    out.push(fill(t("veg_passes"), { n: r.passes.length, d: r.passes.join(", "), c: r.cloud, v: r.vegN.toLocaleString() }));
    return out;
  }
  /** The emission episodes: a master checkbox for all the countable ones, one checkbox each; the picked set drives
   * the result. */
  function episodesBlock(r) {
    const countable = r.eps.filter((ep) => !ep.after && !ep.washed), picked = countable.filter((ep) => st.pick[ep.k]).length;
    const all = el("input", { type: "checkbox", checked: countable.length > 0 && picked === countable.length, disabled: !countable.length, onchange: (e) => { for (const ep of r.eps) st.pick[ep.k] = e.target.checked && !ep.after && !ep.washed; applyPick(); } });
    all.indeterminate = picked > 0 && picked < countable.length;
    return el("div", { class: "veg-group" },
      el("b", { text: t("ep_title") }),
      el("p", { class: "note small", text: t(r.mode === "pair" ? "ep_help_pair" : "ep_help") }),
      el("p", { class: "md-line", text: r.eps.length ? fill(t("ep_count"), { n: r.eps.length, h: r.episodeHours, p: r.windyHours ? Math.round((100 * r.episodeHours) / r.windyHours) : 0, k: countable.length, d: r.passDate }) : t("ep_none") }),
      r.eps.length ? el("label", { class: "check" }, all, el("b", { text: t("ep_all") })) : null,
      el("div", { class: "veg-episodes" }, ...[...r.eps].reverse().map((ep) => el("label", { class: "check" + (ep.after || ep.washed ? " off" : "") },
        el("input", { type: "checkbox", checked: Boolean(st.pick[ep.k]), onchange: (e) => { st.pick[ep.k] = e.target.checked; applyPick(); } }),
        el("span", { text: episodeLine(ep) })))));
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
        r.mode === "pair" && st.prep?.cands.length > 1 && el("label", { class: "md-form veg-pair" }, el("span", { text: t("veg_pair_sel") }),
          el("select", { class: "field", disabled: st.running, onchange: (e) => choosePair(Number(e.target.value)) }, ...st.prep.cands.map((c, i) => el("option", { value: i, selected: i === st.pairIdx,
            text: fill(t("veg_pair_opt"), { a: st.prep.list[c.a].date, b: st.prep.list[c.b].date, w: Math.round(c.weight).toLocaleString() }) })))),
        group("wind", windLines(), hourForm),
        group("camps", r.camps === null ? [t("veg_camps_none")] : [
          t("veg_camps_px"),
          ...[2, 3, 4, 6, 5, 1].map((k) => `${fill(t("veg_camps_on"), { n: t("px_" + PX[k].key) })}: ${r.campsByClass[k].parcels} ${t("veg_parcels")}, ${r.campsByClass[k].herders} ${t("veg_herders")}.`),
          `${t("veg_camps_dusted")}: ${[2, 3, 4].reduce((a, k) => a + r.campsByClass[k].parcels, 0)} ${t("veg_parcels")}, ${[2, 3, 4].reduce((a, k) => a + r.campsByClass[k].herders, 0)} ${t("veg_herders")}.`,
          `${t("veg_camps_total")}: ${[1, 2, 3, 4, 5, 6].reduce((a, k) => a + r.campsByClass[k].parcels, 0)} ${t("veg_parcels")}, ${[1, 2, 3, 4, 5, 6].reduce((a, k) => a + r.campsByClass[k].herders, 0)} ${t("veg_herders")}.`,
          `${t("veg_camps_all")}: ${ex.parcels} ${t("veg_parcels")}, ${ex.herders} ${t("veg_herders")}.`,
          hs ? `${t("veg_camps_hour")} (${dir16(st.hourRes.sector)}): ${hs.parcels} ${t("veg_parcels")}, ${hs.herders} ${t("veg_herders")}.` : null,
          t("veg_camps_hint"),
        ].filter(Boolean)),
        group("aod", [t("veg_aod_line")]),
        group("veg", vegLines(), el("div", {},
          el("p", { class: "veg-key" }, el("i", { style: "background:rgba(150,90,30,.8)" }), t("cls_dusty"), " ", el("i", { style: "background:rgba(230,200,80,.6)" }), t("cls_unclear"), " ", el("i", { style: "background:rgba(60,160,80,.4)" }), t("cls_clear")),
          el("p", { class: "note small", text: t(r.mode === "pair" ? "veg_classes_pair" : "veg_classes") }),
          el("div", { class: "aoi-legend" }, ...PX.filter((c) => c.paint).map((c) => el("label", { class: "check" },
            el("input", { type: "checkbox", checked: st.px[c.key], onchange: (e) => { st.px[c.key] = e.target.checked; classCanvas(r); paint(); } }),
            el("i", { style: `background:rgb(${c.color.join(",")})` }), el("span", { text: fill(t("veg_class_area"), { n: t("px_" + c.key), a: r.areas[c.code].toFixed(0) }) })))),
          el("div", { class: "btnrow" }, el("button", { class: "btn small", type: "button", text: t("veg_window"), onclick: openView })))),
        episodesBlock(r),
        VEG_REPORTS[r.mine.id] && el("div", { class: "veg-group" }, el("b", { text: t("rp_title") }), ...reportLines().map((x) => el("p", { class: "md-line", text: x })),
          el("p", { class: "md-line" }, t("rp_links") + " ", ...VEG_REPORTS[r.mine.id].links.flatMap((l, i) => [i ? "; " : null, el("a", { href: l.u, target: "_blank", rel: "noopener", text: l.t })])))),
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
