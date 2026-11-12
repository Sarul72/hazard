/* Interface text, Mongolian (default) and English. */
export const T = {
  mn: {
    title: "Монгол орны гамшгийн эрсдэлийн хяналт",
    nav_aimag: "Аймгууд", nav_poly: "Polygon эрсдэл", nav_mine: "Уурхайн тоос",
    subtitle: "Үер · Түймэр · Шороон шуурга",
    hazard_all: "Нэгдсэн",
    hazard_flood: "Үер",
    hazard_fire: "Түймэр",
    hazard_dust: "Шороон шуурга",
    class_very_low: "Маш бага", class_low: "Бага", class_moderate: "Дунд", class_high: "Өндөр", class_very_high: "Маш өндөр",
    no_data: "Өгөгдөлгүй",
    ranking: "Аймгуудын эрэмбэ",
    score: "Оноо",
    updated: "Шинэчлэгдсэн",
    local_time: "УБ цаг",
    stale: "Өгөгдөл хуучирсан",
    loading: "Өгөгдлийг тооцоолж байна…",
    load_failed: "Өгөгдлийг татаж чадсангүй. Зохиомол утга харуулахгүй.",
    live_note: "Энэ нь 72 цагийн загварын прогнозод суурилсан харьцангуй индекс. Баталгаажсан сэрэмжлүүлэг биш.",
    sat_title: "Хиймэл дагуулын ажиглалт",
    sat_date: "Огноо (UTC)",
    sat_today: "Өнөөдөр (хэсэгчилсэн)",
    sat_yesterday: "Өчигдөр",
    sat_base: "Суурь зураг",
    sat_overlay: "Давхарга",
    sat_checking: "шалгаж байна…",
    sat_unavailable: "боломжгүй",
    sat_used_date: "ашигласан огноо",
    sat_note: "Зураг нь ажиглалт; эрсдэлийн оноо нь загварын прогноз. Хоёрыг харьцуулж шалгана уу.",
    layer_fire_viirs: "Идэвхтэй гал, VIIRS 375 м",
    layer_fire_modis: "Идэвхтэй гал, MODIS 1 км",
    layer_aod_modis: "Аэрозоль, MODIS нэгтгэсэн (DT/DB)",
    layer_aod_maiac: "Аэрозоль (тоос), MODIS MAIAC",
    layer_aod_deepblue: "Тоосны аэрозоль, MODIS Deep Blue (хуурай газар)",
    layer_dust_airs: "Тоосны оноо, AIRS",
    layer_flood_viirs: "Үерийн усан бүрхэвч, VIIRS",
    layer_water_dswx: "Гадаргын ус, Landsat+Sentinel-2 (OPERA)",
    layer_precip_imerg: "Хур тунадас, GPM IMERG",
    layer_flood_modis: "Үерийн усан бүрхэвч, MODIS",
    layer_snow_modis: "Цасан бүрхэвч, MODIS",
    layer_hls_s30: "Sentinel-2 (HLS), 30 м",
    layer_hls_l30: "Landsat 8/9 (HLS), 30 м",
    layer_truecolor_terra: "MODIS Terra жинхэнэ өнгө",
    layer_truecolor_aqua: "MODIS Aqua жинхэнэ өнгө",
    layer_truecolor_viirs: "VIIRS жинхэнэ өнгө",
    layer_maiac_brf: "Өнгө тогтвортой гадарга, MODIS MAIAC",
    layer_sr_8day: "8 хоногийн нийлмэл, MODIS",
    fires_detected: "Сүүлийн 3 хоногийн гал илрүүлэлт (NASA FIRMS)",
    why: "Яагаад ийм оноо вэ",
    methods: "Арга зүй, эх сурвалж",
    close: "Хаах",
    lang: "EN",
    d_fwi_today: "Өнөөдрийн FWI", d_fwi_max: "3 хоногийн дээд FWI", d_codes: "Чийгийн кодууд (FFMC / DMC / DC)", d_isi_bui: "ISI / BUI",
    d_wind_max: "72 цагийн дээд салхи", d_cams: "CAMS тоосны дээд концентрац", d_cams_now: "CAMS тоос одоо", d_pm10: "PM10 дээд (CAMS)", d_aod: "AOD дээд (CAMS)", d_potential: "Тоос дэгдэх боломж (салхи)", d_gate: "Цас / нойтон өдрөөр хаагдсан цаг",
    d_r1: "Цагийн дээд бороо", d_r24: "24 цагийн дээд бороо", d_q_now: "Голын урсац одоо", d_q_max: "10 хоногийн дээд урсац", d_q_med: "Өмнөх 30 хоногийн медиан", d_rise: "Өсөлтийн коэффициент", d_method: "Урсацын аргачлал",
    m_return_levels: "GloFAS буцалтын түвшин (Q2/Q5/Q20)", m_rise_factor: "Өсөлтийн коэффициент (дутуу, зөвхөн харьцангуй)",
    d_rain_score: "Борооны оноо", d_q_score: "Урсацын оноо", d_cams_score: "CAMS оноо",
    f_snow_covered: "Цасан бүрхүүлтэй тул гал түймрийн оноо 0.",
    f_short_spinup: "FWI-ийн эхлэлийн хугацаа богино: код бага зэрэг дутуу тооцогдож болно.",
    f_too_little_data: "Хангалттай өгөгдөл алга.",
    f_no_cams: "CAMS тоосны мэдээлэл алга: зөвхөн салхины боломжоор тооцов.",
    f_no_wind: "Салхины мэдээлэл алга.",
    f_no_return_levels: "Буцалтын түвшин тооцоологдоогүй: зөвхөн урсацын өсөлтөөр.",
    f_no_discharge_signal: "Урсацын мэдээлэл ач холбогдолгүй (жижиг горхи эсвэл голгүй).",
    f_rain_on_snow: "Цасан дээр бороо: +15 оноо.",
    f_no_rain: "Борооны прогноз алга.", f_no_discharge: "Голын урсацын мэдээлэл алга.", f_no_data: "Мэдээлэл алга.",
    f_no_outlook_days: "Прогнозын өдрийн өгөгдөл алга.",
    sources: "Эх сурвалж",
    footer: "Өгөгдөл: NASA GIBS/FIRMS · Open-Meteo.com (CC BY 4.0) · Copernicus Atmosphere Monitoring Service (CAMS) ба GloFAS/CEMS-ийн өөрчилсөн мэдээлэл. Орон нутгийн албан ёсны сэрэмжлүүлгийг орлохгүй.",
    methods_html: `
<h2>Арга зүй (товч)</h2>
<p>Оноо бүр <b>0–100 харьцангуй индекс</b>, магадлал биш. Ангилал: 0–20 маш бага, 20–40 бага, 40–60 дунд, 60–80 өндөр, 80–100 маш өндөр. Мэдээлэл дутвал оноо <b>0 биш, «өгөгдөлгүй»</b>.</p>
<h3>Түймэр</h3>
<p>Канадын Fire Weather Index (Van Wagner 1987), үдийн температур, чийг, салхи, 24 цагийн хур тунадасаар 92 хоногийн түүхээс тооцно. EFFIS-ийн ангиллын хил (5.2 / 11.2 / 21.3 / 38 / 50) онооны 0–100 руу шугаман буулгана. Цасны зузаан ≥ 1 см бол 0. FWI нь цаг уурын хуурай байдлыг хэмждэг; шатах материалын хэмжээ, ургамлын төрөл, хүний үйл ажиллагааг тооцдоггүй.</p>
<h3>Шороон шуурга</h3>
<p>Хоёр хэсгийн их нь: (1) CAMS загварын гадаргын тоосны концентрац (WHO 2021 PM10 24 цагийн заавар 45 мкг/м³ = 40 оноо); (2) дэгдэх боломж: 10 м салхи 6 м/с-ээс эхэлж 14 м/с хүртэл, цасгүй, өдрийн хур тунадас < 0.254 мм (US EPA AP-42) үед. Боломж дангаараа «маш өндөр» ангилалд хүрэхгүй (дээд 79).</p>
<h3>Үер</h3>
<p>Хоёр хэсгийн их нь: (1) 72 цагийн борооны прогноз (24 цагийн нийлбэр ба цагийн дээд), (2) GloFAS голын урсац. Буцалтын түвшин (2/5/20 жил) 40/60/80 оноо; түвшин тооцоологдоогүй бол зөвхөн өсөлтийн коэффициентээр, тэмдэглэгээтэй. Цасан дээр бороо +15.</p>
<h3>Хязгаарлалт</h3>
<ul>
<li>Цэг нь аймгийн төв, загварын тор 5–45 км. Орон нутгийн аадар бороо, хөндийн үер, цэгийн шуурга алдагдана.</li>
<li>Босго утгууд туршилтын (heuristic), Монголын ажиглалтаар калибрлаагүй.</li>
<li>Хиймэл дагуулын давхаргууд нь ажиглалт; индексийг тэдгээрээр автоматаар шалгадаггүй. Зураг дээр нүдээр харьцуулна.</li>
<li>Sentinel-1 SAR-аар үерийн усан бүрхэвч гаргах (DeVries ба бусад 2020) аргыг Google Earth Engine шаардлагатай тул энэ хувилбарт ороогүй. Docs/ROADMAP.md-г үзнэ үү.</li>
</ul>
<p>Бүрэн тайлбар: <code>docs/METHODS.md</code>, <code>docs/LIMITATIONS.md</code>.</p>`,
  },
  en: {
    title: "Mongolia hazard watch",
    nav_aimag: "Provinces", nav_poly: "Polygon risk", nav_mine: "Mine dust",
    subtitle: "Flood · Wildfire · Dust storm",
    hazard_all: "Combined", hazard_flood: "Flood", hazard_fire: "Wildfire", hazard_dust: "Dust storm",
    class_very_low: "Very low", class_low: "Low", class_moderate: "Moderate", class_high: "High", class_very_high: "Very high",
    no_data: "No data", ranking: "Aimag ranking", score: "Score", updated: "Updated", local_time: "UB time",
    stale: "Data is stale", loading: "Computing data…", load_failed: "Could not load data. No placeholder values are shown.",
    live_note: "A relative index from a 72-hour model forecast. Not an official warning.",
    sat_title: "Satellite observations", sat_date: "Date (UTC)", sat_today: "Today (partial)", sat_yesterday: "Yesterday",
    sat_base: "Base image", sat_overlay: "Overlay", sat_checking: "checking…", sat_unavailable: "unavailable", sat_used_date: "date used",
    sat_note: "Imagery is observation; risk scores are model forecasts. Compare the two.",
    layer_fire_viirs: "Active fire, VIIRS 375 m", layer_fire_modis: "Active fire, MODIS 1 km",
    layer_aod_modis: "Aerosol, MODIS merged (DT/DB)", layer_aod_maiac: "Aerosol (dust), MODIS MAIAC", layer_aod_deepblue: "Dust aerosol, MODIS Deep Blue (arid land)", layer_dust_airs: "Dust score, AIRS", layer_flood_viirs: "Flood water extent, VIIRS", layer_water_dswx: "Surface water, Landsat+Sentinel-2 (OPERA)",
    layer_precip_imerg: "Precipitation, GPM IMERG", layer_flood_modis: "Flood water extent, MODIS", layer_snow_modis: "Snow cover, MODIS",
    layer_hls_s30: "Sentinel-2 (HLS), 30 m", layer_hls_l30: "Landsat 8/9 (HLS), 30 m",
    layer_truecolor_terra: "MODIS Terra true colour", layer_truecolor_aqua: "MODIS Aqua true colour", layer_truecolor_viirs: "VIIRS true colour", layer_maiac_brf: "Steady-colour surface, MODIS MAIAC", layer_sr_8day: "8-day composite, MODIS",
    fires_detected: "Fire detections, last 3 days (NASA FIRMS)", why: "Why this score", methods: "Methods and sources", close: "Close", lang: "МН",
    d_fwi_today: "FWI today", d_fwi_max: "Max FWI, 3 days", d_codes: "Moisture codes (FFMC / DMC / DC)", d_isi_bui: "ISI / BUI",
    d_wind_max: "Max wind, 72 h", d_cams: "CAMS surface dust, max", d_cams_now: "CAMS dust now", d_pm10: "PM10 max (CAMS)", d_aod: "AOD max (CAMS)", d_potential: "Emission potential (wind)", d_gate: "Hours blocked by snow / wet day",
    d_r1: "Max hourly rain", d_r24: "Max 24-h rain", d_q_now: "River discharge now", d_q_max: "10-day max discharge", d_q_med: "Median of previous 30 days", d_rise: "Rise factor", d_method: "Discharge method",
    m_return_levels: "GloFAS return levels (Q2/Q5/Q20)", m_rise_factor: "Rise factor (fallback, relative only)",
    d_rain_score: "Rain score", d_q_score: "Discharge score", d_cams_score: "CAMS score",
    f_snow_covered: "Snow covered: wildfire score set to 0.",
    f_short_spinup: "Short FWI spin-up: moisture codes may be slightly off.",
    f_too_little_data: "Not enough data.",
    f_no_cams: "No CAMS dust data: wind emission potential only.",
    f_no_wind: "No wind data.",
    f_no_return_levels: "No return levels computed: rise factor only.",
    f_no_discharge_signal: "No meaningful discharge signal (small stream or no river).",
    f_rain_on_snow: "Rain on snow: +15 points.",
    f_no_rain: "No rain forecast.", f_no_discharge: "No river discharge data.", f_no_data: "No data.", f_no_outlook_days: "No outlook-day data.",
    sources: "Sources",
    footer: "Data: NASA GIBS/FIRMS · Open-Meteo.com (CC BY 4.0) · contains modified Copernicus Atmosphere Monitoring Service (CAMS) and GloFAS/CEMS information. Does not replace official local warnings.",
    methods_html: `
<h2>Methods (short)</h2>
<p>Each score is a <b>0–100 relative index</b>, not a probability. Classes: 0–20 very low, 20–40 low, 40–60 moderate, 60–80 high, 80–100 very high. Missing input gives <b>“no data”, never 0</b>.</p>
<h3>Wildfire</h3>
<p>Canadian Fire Weather Index (Van Wagner 1987) from noon temperature, humidity, wind and 24-h precipitation over a 92-day history. EFFIS class limits (5.2 / 11.2 / 21.3 / 38 / 50) are mapped linearly to 0–100. Snow depth ≥ 1 cm gives 0. FWI measures weather-driven dryness only; it ignores fuel amount, vegetation type and human ignition.</p>
<h3>Dust storm</h3>
<p>The larger of: (1) CAMS modelled surface dust (WHO 2021 PM10 24-h guideline 45 µg/m³ = score 40); (2) emission potential: 10 m wind from 6 to 14 m/s, snow-free, daily precipitation < 0.254 mm (US EPA AP-42). Potential alone cannot reach the “very high” class (cap 79).</p>
<h3>Flood</h3>
<p>The larger of: (1) 72-h rain forecast (24-h total and hourly peak), (2) GloFAS river discharge. Return levels (2/5/20 yr) map to 40/60/80; without them only the rise factor is used and flagged. Rain on snow adds 15.</p>
<h3>Limits</h3>
<ul>
<li>Points are aimag centres; model cells are 5–45 km. Local cloudbursts, valley floods and point dust events are missed.</li>
<li>Thresholds are heuristic and not calibrated against Mongolian observations.</li>
<li>Satellite layers are observations; the index is not automatically checked against them. Compare visually.</li>
<li>Sentinel-1 SAR flood mapping (DeVries et al. 2020) needs Google Earth Engine and is not in this version. See docs/ROADMAP.md.</li>
</ul>
<p>Full text: <code>docs/METHODS.md</code>, <code>docs/LIMITATIONS.md</code>.</p>`,
  },
};
