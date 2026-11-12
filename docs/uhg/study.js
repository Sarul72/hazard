/* UTM 48N imagery and overlays share the pixel-to-map transform from layers.json. */
(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const layer = byId('layer'), year = byId('year'), map = byId('raster');
  const caption = byId('caption'), legend = byId('legend'), file = byId('rasterFile');
  const svgNS = 'http://www.w3.org/2000/svg';
  const site = [541769.29658, 4835107.59383];
  const corners = [[543707.784, 4833741.536], [536090.502, 4833696.680],
    [536069.534, 4837583.835], [543682.632, 4837628.695]];
  const windGridBearing = 124.805 - 0.358;
  let metadata, lastAodYear = '2025';

  function node(tag, attrs, parent, content) {
    const el = document.createElementNS(svgNS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
    if (content !== undefined) el.textContent = content;
    parent.append(el);
    return el;
  }

  function note(parent, x, y, message, anchor = 'start') {
    return node('text', { x, y, 'text-anchor': anchor, fill: '#fff', stroke: '#101820',
      'stroke-width': 3, 'stroke-linejoin': 'round', 'paint-order': 'stroke',
      'font-family': 'system-ui,sans-serif', 'font-size': 13, 'font-weight': 650 }, parent, message);
  }

  function layerSpec(kind, selectedYear) {
    if (kind === 'aod') {
      const name = 'aod-' + selectedYear;
      const days = metadata[name].days_range;
      return { grid: name, png: name, tif: name, limits: ['0', '0.35'], title: selectedYear + ' оны зургадугаар сарын AOD',
        text: 'MODIS MAIAC · 550 нм, нэгжгүй · 1 км-ийн экспорт. Пиксел бүрд QA шүүлт давсан ' +
          days[0] + '–' + days[1] + ' өдрийн дундаж. Бүх жилд өнгөний хуваарь ижил.' };
    }
    if (kind === 'event') return { grid: 'aod-2025', png: 'aod-event', tif: 'aod-event', limits: ['0', '0.35'],
      title: '2025 оны 6 сарын 1-ний AOD ба салхины хоёр сектор',
      text: 'MODIS MAIAC · 550 нм, нэгжгүй · 1 км-ийн экспорт. Улбар шар нь салхины доод, цэнхэр нь дээд тал. Секторууд 3–8 км зайд, тус бүр 90° өргөн. Салхи жинхэнэ хойноос цагийн зүүний дагуу 124.8° руу үлээв.' };
    if (kind === 'ecdi') return { grid: 's2-2025', png: 'ecdi', tif: 's2-2025', limits: ['0', '1.5'],
      title: 'Sentinel-2 гадаргын нүүрсэн тоосны индекс',
      text: 'Sentinel-2 · 20 м · 2025 оны зургадугаар сарын ECDI медиан. Өнгө нь гадаргын спектрийн индексийг илэрхийлнэ. Тухайн гадаргын найрлагыг тогтооход дээж хэрэгтэй.' };
    if (kind === 'bci') return { grid: 'landsat-2025', png: 'bci', tif: 'landsat-2025', limits: ['−2', '+2'],
      title: 'Landsat ил нүүрсний индекс',
      text: 'Landsat 8/9 · 30 м · 2025 оны зургадугаар сарын BCI медиан. Ил нүүрсний спектртэй төстэй гадаргыг шалгахад ашиглана.' };
    return { grid: 's2-2025', png: 'rgb', tif: 's2-2025', title: 'Ухаа худаг уурхайн бодит өнгийн зураг',
      text: 'Sentinel-2 · 20 м-ийн экспорт · 2025 оны зургадугаар сар. Үүл ба сүүдрийг шүүж улаан, ногоон, цэнхэр сувгийн медианыг нэгтгэв.' };
  }

  function sector(x, y, pixelsPerMetre, bearing, color, name) {
    const pos = (r, a) => [x + r * pixelsPerMetre * Math.sin(a * Math.PI / 180),
      y - r * pixelsPerMetre * Math.cos(a * Math.PI / 180)];
    const r1 = 3000 * pixelsPerMetre, r2 = 8000 * pixelsPerMetre;
    const left = bearing - 45, right = bearing + 45;
    const edge = 'M' + pos(8000, left) + 'A' + r2 + ',' + r2 + ' 0 0 1 ' + pos(8000, right) +
      'L' + pos(3000, right) + 'A' + r1 + ',' + r1 + ' 0 0 0 ' + pos(3000, left) + 'Z';
    const path = node('path', { d: edge, stroke: color, fill: color, 'fill-opacity': 0.13,
      'stroke-width': 2, 'stroke-dasharray': '6 3' }, map);
    node('title', {}, path, name);
    const [lx, ly] = pos(5400, bearing);
    note(map, lx, ly, name, 'middle');
  }

  function draw() {
    if (!metadata) return;
    const kind = layer.value;
    year.disabled = kind !== 'aod';
    if (kind !== 'aod') year.value = '2025';
    const info = layerSpec(kind, year.value);
    const [west, north, cell, nx, ny] = metadata[info.grid].utm;
    const scale = Math.min(692 / (cell * nx), 392 / (cell * ny));
    const w = nx * cell * scale, h = ny * cell * scale;
    const left = (720 - w) / 2, top = (420 - h) / 2;
    const project = ([e, n]) => [left + (e - west) * scale, top + (north - n) * scale];
    map.replaceChildren();
    map.setAttribute('aria-label', info.title);
    node('title', {}, map, info.title);
    node('rect', { width: 720, height: 420, fill: '#11191e' }, map);
    const image = node('image', { x: left, y: top, width: w, height: h, href: info.png + '.png',
      preserveAspectRatio: 'none' }, map);
    if (kind === 'aod' || kind === 'event') image.style.imageRendering = 'pixelated';
    image.addEventListener('error', () => { if (image.isConnected) caption.textContent = 'Зураг ачаалагдсангүй. GeoTIFF холбоосоор эх өгөгдлийг нээнэ үү.'; });
    const [sx, sy] = project(site);
    if (kind === 'event') {
      sector(sx, sy, scale, windGridBearing, '#ff9a77', 'Доод');
      sector(sx, sy, scale, windGridBearing + 180, '#8ccfff', 'Дээд');
    }
    const polygon = corners.map(project).map((p) => p.join(',')).join(' ');
    node('polygon', { points: polygon, fill: 'none', stroke: '#13212b', 'stroke-width': 3.6 }, map);
    node('polygon', { points: polygon, fill: 'none', stroke: 'white', 'stroke-width': 1.65 }, map);
    node('circle', { cx: sx, cy: sy, r: 4.5, fill: '#ec835a', stroke: 'white', 'stroke-width': 1.7 }, map);
    node('path', { d: 'M26 55V27M21 35l5 -10 5 10', fill: 'none', stroke: 'white', 'stroke-width': 2 }, map);
    note(map, 38, 36, 'Торын хойд');
    const km = kind === 'aod' || kind === 'event' ? 4 : 2;
    const end = 25 + km * 1000 * scale;
    node('path', { d: 'M25 386v6H' + end + 'v-6', fill: 'none', stroke: '#122029', 'stroke-width': 5 }, map);
    node('path', { d: 'M25 386v6H' + end + 'v-6', fill: 'none', stroke: 'white', 'stroke-width': 2 }, map);
    note(map, 25, 379, km + ' км');
    legend.hidden = !info.limits;
    if (info.limits) {
      byId('lo').textContent = info.limits[0]; byId('hi').textContent = info.limits[1];
      const ramp = legend.querySelector('i');
      if (ramp) ramp.style.background = 'linear-gradient(90deg,#183d66,#40a3a0,#f2d48a,#c35933)';
    }
    file.href = info.tif + '.tif';
    caption.textContent = info.text;
  }

  layer.addEventListener('change', () => { if (layer.value === 'aod') year.value = lastAodYear; draw(); });
  year.addEventListener('change', () => { lastAodYear = year.value; draw(); });
  fetch('layers.json').then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }).then((layers) => { metadata = layers; draw(); }).catch(() => {
    caption.textContent = 'Зургийн торын мэдээлэл ачаалагдсангүй. Хуудсыг дахин ачаална уу.';
  });
})();
