/*
 * Монгол орны гамшгийн эрсдэлийн хяналт: шатсан талбай, гэмтлийн зэрэг (Google Earth Engine App)
 * Mongolia Hazard Watch: burned area and burn severity inside a drawn area
 *
 * Copyright (C) 2026 Sigma0sanaa
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public
 * License version 2 as published by the Free Software Foundation. It is distributed WITHOUT ANY WARRANTY; see the
 * file LICENSE in this folder. Only the folder gee_app is under this licence.
 *
 * Burn severity: Sentinel-2 dNBR (pre-fire NBR minus post-fire NBR) in the classes of Key, C.H. and Benson, N.C. (2006),
 * Landscape Assessment, FIREMON, USDA Forest Service RMRS-GTR-164-CD. Compared with MODIS MCD64A1 burned area
 * (Giglio et al. 2018) and FIRMS active fire. For spring fires the pre-fire image comes from the previous autumn: tests
 * in Mongolia showed that March images with snow and melt water mark large unburned areas as burned (docs/METHODS.md).
 *
 * The code is written in ES5 for the Code Editor.
 */

// ------------------------------------------------------------------------------------------------ settings
var APP = {
  maxKm2: 500,       // up to this area the result is computed at 20 m (the resolution of band B12)
  hardKm2: 5000,     // above this the app refuses: the free quota of the project is shared by everyone
  burned: 0.10,      // dNBR from which land counts as burned (Key and Benson 2006, low severity)
  maxCloud: 70       // scenes above this cloud share are left out before masking
};

// Key and Benson (2006), dNBR as a ratio (their table uses dNBR x 1000)
var CLASSES = [
  { from: -2, to: -0.25, name: 'Ургамал их сэргэсэн', color: '1a9850' },
  { from: -0.25, to: -0.10, name: 'Ургамал бага сэргэсэн', color: '91cf60' },
  { from: -0.10, to: 0.10, name: 'Шатаагүй', color: 'd9d9d9' },
  { from: 0.10, to: 0.27, name: 'Бага зэрэг шатсан', color: 'fee08b' },
  { from: 0.27, to: 0.44, name: 'Дунджаас бага', color: 'fdae61' },
  { from: 0.44, to: 0.66, name: 'Дунджаас их', color: 'f46d43' },
  { from: 0.66, to: 3, name: 'Их шатсан', color: 'a50026' }
];

// The test fire: Dornod, MODIS burn dates 2019-04-29 and 30.
var EXAMPLE = {
  box: [115.60, 48.95, 115.90, 49.10],
  before: ['2019-04-01', '2019-04-27'],
  after: ['2019-05-02', '2019-05-30']
};

// ------------------------------------------------------------------------------------------------ data
function clearMask(img) {
  var scl = img.select('SCL');
  return scl.neq(0).and(scl.neq(3)).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
}

/** Median NBR of the cloud-free pixels of a period. */
function nbr(region, start, end) {
  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(region).filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', APP.maxCloud));
  var img = col.map(function (i) {
    return i.updateMask(clearMask(i)).normalizedDifference(['B8', 'B12']).rename('nbr');
  }).median().clip(region);
  return { image: img, count: col.size() };
}

function classify(dnbr) {
  var out = ee.Image(0);
  for (var k = 0; k < CLASSES.length; k++) {
    out = out.where(dnbr.gte(CLASSES[k].from).and(dnbr.lt(CLASSES[k].to)), k);
  }
  return out.rename('severity').updateMask(dnbr.mask()).toByte();
}

/** MODIS MCD64A1: land with a burn date in any month from start to end. */
function modisBurned(region, start, end) {
  var first = ee.Date.fromYMD(ee.Date(start).get('year'), ee.Date(start).get('month'), 1);
  var none = ee.ImageCollection([ee.Image.constant(0).rename('BurnDate').toInt16().updateMask(0)]);  // months not out yet
  return ee.ImageCollection('MODIS/061/MCD64A1').filterDate(first, end).select('BurnDate').merge(none)
    .max().gt(0).unmask(0).clip(region).rename('modis');
}

function firms(region, start, end) {
  var none = ee.ImageCollection([ee.Image.constant(0).rename('T21').toFloat().updateMask(0)]);
  return ee.ImageCollection('FIRMS').filterDate(start, end).filterBounds(region).select('T21').merge(none).max().clip(region);
}

// ------------------------------------------------------------------------------------------------ words
function plainError(err) {
  var s = String(err);
  if (/timed out|timeout|deadline/i.test(s)) return 'Тооцоо хэт удаан үргэлжилсэн. Талбайг жижигрүүлэх эсвэл хугацааг богиносгоод дахин оролдоно уу.';
  if (/memory/i.test(s)) return 'Тооцоонд санах ой хүрэлцсэнгүй. Талбайг жижигрүүлнэ үү.';
  if (/quota|too many|rate limit|concurrent/i.test(s)) return 'Google Earth Engine-ийн үнэгүй хязгаарт хүрсэн. Хэдэн минутын дараа дахин оролдоно уу.';
  return 'Тооцоолж чадсангүй. Техникийн тайлбар: ' + s;
}

var DATE_RE = /^\s*(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\s*$/;

/** '2021-8-5' or '2021.08.05' becomes '2021-08-05'; anything else gives null. */
function normalDate(text) {
  var m = DATE_RE.exec(text || '');
  if (!m) return null;
  var mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  var dt = new Date(Date.UTC(+m[1], mo - 1, d));  // 2021-02-31 is not a day: Date moves it to March
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return m[1] + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
}
function fmt(x, d) { return x === null || x === undefined ? '—' : Number(x).toFixed(d); }
function pct(a, b) { return b > 0 ? Math.round(100 * a / b) + '%' : '—'; }

/** Next day as text, so that an end date counts. */
function dayAfter(text) { return ee.Date(text).advance(1, 'day'); }

// ------------------------------------------------------------------------------------------------ interface
var map = ui.Map();
map.setOptions('HYBRID');
map.setCenter(105.5, 47.5, 6);
var tools = map.drawingTools();
tools.setShown(true);
tools.setDrawModes(['rectangle', 'polygon']);
tools.setLinked(false);

var panel = ui.Panel({ style: { width: '370px', padding: '8px' } });
ui.root.widgets().reset([panel, map]);
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));

var H = { fontWeight: 'bold', fontSize: '14px', margin: '10px 0 4px 0' };
var SMALL = { fontSize: '12px', color: '555555' };
function heading(text) { return ui.Label(text, H); }
function note(text) { return ui.Label(text, SMALL); }

panel.add(ui.Label('Шатсан талбай, гэмтлийн зэрэг (20 м)', { fontWeight: 'bold', fontSize: '18px' }));
panel.add(note('Монгол орны гамшгийн эрсдэлийн хяналт. Sentinel-2-ийн галын өмнөх, дараах зургийг харьцуулж (dNBR) шатсан газар, гэмтлийн зэргийг гаргаж, MODIS-ийн шатсан талбай, FIRMS-ийн галын цэгтэй харьцуулна. Албан ёсны мэдээ биш.'));

panel.add(heading('1. Талбай'));
panel.add(note('Газрын зургийн зүүн дээд буланд байгаа тэгш өнцөгт эсвэл олон өнцөгтийн хэрэгслээр талбайгаа зурна. 500 км² хүртэл 20 м-ээр, түүнээс том бол бүдүүн нарийвчлалаар тооцоолно.'));
var drawButton = ui.Button({ label: 'Шинэ талбай зурах', onClick: function () {
  tools.layers().reset();
  map.layers().reset();
  tools.setShape('rectangle');
  tools.draw();
} });
var exampleButton = ui.Button({ label: 'Жишээ: Дорнод, 2019 оны 4 сар', onClick: function () {
  var g = ee.Geometry.Rectangle(EXAMPLE.box);
  tools.layers().reset([ui.Map.GeometryLayer({ geometries: [g], name: 'талбай', color: 'ffffff' })]);
  beforeStart.setValue(EXAMPLE.before[0]); beforeEnd.setValue(EXAMPLE.before[1]);
  afterStart.setValue(EXAMPLE.after[0]); afterEnd.setValue(EXAMPLE.after[1]);
  map.centerObject(g, 11);
} });
panel.add(ui.Panel([drawButton, exampleButton], ui.Panel.Layout.flow('horizontal')));

panel.add(heading('2. Огноо (ЖЖЖЖ-СС-ӨӨ, жишээ нь 2019-04-29)'));
function dateBox(value) { return ui.Textbox({ value: value, style: { width: '96px', margin: '2px 3px' } }); }
var beforeStart = dateBox(EXAMPLE.before[0]), beforeEnd = dateBox(EXAMPLE.before[1]);
var afterStart = dateBox(EXAMPLE.after[0]), afterEnd = dateBox(EXAMPLE.after[1]);
var DATE_LABEL = { width: '82px', fontSize: '12.5px', margin: '8px 2px 0 4px' };
panel.add(ui.Panel([ui.Label('Галын өмнө:', DATE_LABEL), beforeStart, beforeEnd], ui.Panel.Layout.flow('horizontal')));
panel.add(ui.Panel([ui.Label('Галын дараа:', DATE_LABEL), afterStart, afterEnd], ui.Panel.Layout.flow('horizontal')));
var autumn = ui.Checkbox({ label: 'Хаврын гал (3–5 сар): өмнөх зургийг өмнөх намраас (9-15 – 10-31) авах', value: true, style: { fontSize: '12.5px' } });
panel.add(autumn);
panel.add(note('Хавар галын өмнөх зураг дээр цас, хайлсан усны чийг үлдэж, шатаагүй газрыг шатсан мэт харуулдаг. Галын дараах хугацааг галаас хойш 2–30 хоногоор авахад тохиромжтой: ургамал ургаж эхлэхээр ул мөр арилна.'));

var runButton = ui.Button({ label: 'Тооцоолох', style: { stretch: 'horizontal', fontWeight: 'bold' } });
panel.add(runButton);
var status = ui.Label('', { color: 'b00020', whiteSpace: 'pre-wrap' });
panel.add(status);
var results = ui.Panel();
panel.add(results);

panel.add(heading('Анхааруулга'));
panel.add(note('dNBR-ийн ангиллын босгыг Хойд Америкийн ойд тогтоосон. Монголын хээрийн гал ихэвчлэн "бага зэрэг шатсан" ангилалд ордог бөгөөд энэ нь галын хүч бага гэсэн үг биш: өвс бүрэн шатсан ч ногоон биомасс бага байдаг.'));
panel.add(note('Шалгалт: Дорнодын гурван түймэрт (2019, 2023) Sentinel-2 ба MODIS-ийн шатсан талбайн тохирол F1 = 0.64–0.80; гал гараагүй хоёр талбайд Sentinel-2 нь 3 ба 8 км²-ийг шатсан гэж андуурсан (талбайн 1–2%). MODIS 500 м тул жижиг галыг алгасдаг.'));

panel.add(heading('Эх сурвалж'));
function link(text, url) { return ui.Label(text, { fontSize: '12px', margin: '2px 8px' }).setUrl(url); }
panel.add(link('Key & Benson (2006), Landscape Assessment: dNBR, FIREMON, USDA RMRS-GTR-164-CD', 'https://research.fs.usda.gov/treesearch/24066'));
panel.add(link('Giglio et al. (2018), MODIS Collection 6 burned area (MCD64A1), Remote Sensing of Environment 217', 'https://doi.org/10.1016/j.rse.2018.08.005'));
panel.add(link('NASA FIRMS: Fire Information for Resource Management System', 'https://firms.modaps.eosdis.nasa.gov/'));
panel.add(link('Contains modified Copernicus Sentinel data (Sentinel-2)', 'https://sentinels.copernicus.eu/'));
panel.add(link('Код: github.com/Sigma0sanaa/hazard, gee_app (GPL-2.0)', 'https://github.com/Sigma0sanaa/hazard'));

function legendRow(color, text) {
  return ui.Panel([ui.Label('', { backgroundColor: '#' + color, padding: '7px', margin: '2px 6px 2px 0' }), ui.Label(text, { fontSize: '12px', margin: '2px 0' })], ui.Panel.Layout.flow('horizontal'));
}

// ------------------------------------------------------------------------------------------------ run
function readDates() {
  var boxes = [beforeStart, beforeEnd, afterStart, afterEnd], v = [];
  for (var i = 0; i < boxes.length; i++) {
    var d = normalDate(boxes[i].getValue());
    if (!d) return null;
    boxes[i].setValue(d);
    v.push(d);
  }
  if (!(v[0] <= v[1] && v[1] < v[2] && v[2] <= v[3])) return null;
  var before = [v[0], v[1]], spring = false;
  var month = Number(v[2].slice(5, 7));
  if (autumn.getValue() && month >= 3 && month <= 5) {
    var y = Number(v[2].slice(0, 4)) - 1;
    before = [y + '-09-15', y + '-10-31'];
    spring = true;
  }
  // MODIS and FIRMS are compared from the end of the period the user typed, also when the image comes from autumn
  return { before: before, after: [v[2], v[3]], spring: spring, compareFrom: v[1] };
}

function busy(on) {
  runButton.setDisabled(on);
  if (on) status.style().set('color', '1a5fb4');
}

function fail(text) {
  status.style().set('color', 'b00020');
  status.setValue(text);
  busy(false);
}

runButton.onClick(function () {
  results.clear();
  if (tools.layers().length() === 0) return fail('Газрын зураг дээр талбай зурна уу.');
  var dates = readDates();
  if (!dates) return fail('Огноог ЖЖЖЖ-СС-ӨӨ хэлбэрээр, галын өмнөх хугацааг дараах хугацаанаас өмнө бичнэ үү.');
  var region = tools.layers().get(0).toGeometry();
  busy(true);
  status.setValue('Тооцоолж байна… (талбайн хэмжээг шалгаж байна)');
  region.area(1).evaluate(function (m2, err) {
    if (err) return fail(plainError(err));
    var km2 = m2 / 1e6;
    if (km2 > APP.hardKm2) return fail('Талбай хэт том байна (' + fmt(km2, 0) + ' км²). ' + APP.hardKm2 + ' км²-аас бага талбай зурна уу.');
    var scale = km2 <= APP.maxKm2 ? 20 : (km2 <= 4 * APP.maxKm2 ? 40 : 60);
    var notes = [];
    if (scale > 20) notes.push('Талбай ' + APP.maxKm2 + ' км²-аас том (' + fmt(km2, 0) + ' км²) тул тоог ' + scale + ' м-ийн нарийвчлалаар гаргалаа.');
    if (dates.spring) notes.push('Хаврын гал тул галын өмнөх зургийг ' + dates.before[0] + ' – ' + dates.before[1] + ' хооронд авлаа.');
    compute(region, dates, scale, km2, notes);
  });
});

function compute(region, dates, scale, km2, notes) {
  status.setValue('Тооцоолж байна… (Sentinel-2 зураг хайж байна)');
  var pre = nbr(region, dates.before[0], dayAfter(dates.before[1]));
  var post = nbr(region, dates.after[0], dayAfter(dates.after[1]));
  ee.Dictionary({ a: pre.count, b: post.count }).evaluate(function (c, err) {
    if (err) return fail(plainError(err));
    if (!c.a || !c.b) {
      return fail('Сонгосон хугацаанд Sentinel-2-ийн хангалттай үүлгүй зураг олдсонгүй (өмнө ' + c.a + ', дараа ' + c.b + '). Хугацааг уртасгана уу.');
    }
    computeWith(region, dates, scale, km2, notes, pre, post);
  });
}

function computeWith(region, dates, scale, km2, notes, pre, post) {
  status.setValue('Тооцоолж байна… (шатсан талбай)');
  var dnbr = pre.image.subtract(post.image).rename('dnbr');
  var severity = classify(dnbr);
  var burned = dnbr.gte(APP.burned);
  var modis = modisBurned(region, dates.compareFrom, dayAfter(dates.after[1]));
  var fire = firms(region, dates.compareFrom, dayAfter(dates.after[1]));

  map.layers().reset();
  tools.layers().get(0).setShown(false);
  var palette = CLASSES.map(function (c) { return c.color; });
  map.addLayer(dnbr, { min: -0.2, max: 0.5, palette: ['1a9850', 'ffffff', 'd73027'] }, 'dNBR', false);
  map.addLayer(severity, { min: 0, max: CLASSES.length - 1, palette: palette }, 'Гэмтлийн зэрэг (dNBR)');
  map.addLayer(ee.Image().byte().paint(ee.FeatureCollection(modis.selfMask().reduceToVectors({ geometry: region, scale: 500, maxPixels: 1e9 })), 1, 2),
    { palette: ['0050ff'] }, 'MODIS-ийн шатсан талбай (хүрээ)');
  map.addLayer(fire.selfMask(), { min: 300, max: 400, palette: ['ff0000'] }, 'FIRMS галын цэг');
  map.addLayer(ee.Image().byte().paint(ee.FeatureCollection([ee.Feature(region)]), 1, 2), { palette: ['ffffff'] }, 'Талбайн хүрээ');
  map.centerObject(region);

  var area = ee.Image.pixelArea().divide(1e6);
  var sum = function (img) {
    return img.reduceRegion({ reducer: ee.Reducer.sum(), geometry: region, scale: scale, maxPixels: 1e10, tileScale: 4 }).values().get(0);
  };
  var numbers = ee.Dictionary({
    preCount: pre.count, postCount: post.count,
    seen: sum(area.updateMask(dnbr.mask())),
    burned: sum(area.updateMask(burned)),
    modis: sum(area.updateMask(modis)),
    both: sum(area.updateMask(burned.and(modis))),
    firms: sum(area.updateMask(fire.mask())),
    classes: area.addBands(severity).reduceRegion({ reducer: ee.Reducer.sum().group(1, 'severity'), geometry: region, scale: scale, maxPixels: 1e10, tileScale: 4 }).get('groups')
  });
  numbers.evaluate(function (n, err) {
    if (err) return fail(plainError(err));
    var lines = [
      'Sentinel-2 зураг: галын өмнө ' + n.preCount + ' (' + dates.before[0] + ' – ' + dates.before[1] + '), дараа ' + n.postCount + ' (' + dates.after[0] + ' – ' + dates.after[1] + ')',
      'Шатсан (dNBR ≥ ' + APP.burned + '): ' + fmt(n.burned, 2) + ' км²; үүлгүй харагдсан хэсэг ' + fmt(n.seen, 0) + ' км² / ' + fmt(km2, 0) + ' км²',
      'MODIS-ийн шатсан талбай: ' + fmt(n.modis, 2) + ' км²; Sentinel-2-ийн шатсаны MODIS-д багтсан хувь: ' + pct(n.both, n.burned) + '; MODIS-ийнхээс Sentinel-2 илрүүлсэн: ' + pct(n.both, n.modis),
      'FIRMS галын цэгтэй нүд: ' + fmt(n.firms, 1) + ' км²'
    ];
    (n.classes || []).forEach(function (g) {
      if (g.severity >= 3) lines.push('  ' + CLASSES[g.severity].name + ': ' + fmt(g.sum, 2) + ' км²');
    });
    if (n.seen < 0.5 * km2) lines.push('Талбайн талаас илүү нь үүл, цасанд дарагдсан тул үр дүн найдвар муутай.');
    var downloads = [
      ['Гэмтлийн зэрэг (GeoTIFF, 0–6 = хүснэгтийн дараалал)', severity.clip(region), scale],
      ['dNBR (GeoTIFF)', dnbr.toFloat().clip(region), scale]
    ];
    showResults(lines.concat(notes), downloads);
    status.style().set('color', '1a7f37');
    status.setValue('Бэлэн.');
    busy(false);
  });
}

function showResults(lines, downloads) {
  results.clear();
  results.add(heading('Үр дүн'));
  lines.forEach(function (l) { results.add(ui.Label(l, { fontSize: '12.5px', margin: '2px 8px', whiteSpace: 'pre-wrap' })); });
  for (var k = CLASSES.length - 1; k >= 0; k--) {
    results.add(legendRow(CLASSES[k].color, k + ': ' + CLASSES[k].name + ' (' + CLASSES[k].from + ' – ' + CLASSES[k].to + ')'));
  }
  results.add(legendRow('0050ff', 'MODIS MCD64A1-ийн шатсан талбайн хүрээ'));
  results.add(legendRow('ff0000', 'FIRMS идэвхтэй галын цэг'));
  downloads.forEach(function (d) {
    var label = ui.Label('Татах холбоос бэлтгэж байна…', { fontSize: '12px', margin: '2px 8px' });
    results.add(label);
    d[1].getDownloadURL({ name: 'mongolia_fire_aoi', scale: d[2], region: d[1].geometry(), format: 'GEO_TIFF', filePerBand: false }, function (url, err) {
      if (err) { label.setValue(d[0] + ': татах боломжгүй (' + plainError(err) + ')'); return; }
      label.setValue('Татах: ' + d[0]);
      label.setUrl(url);
    });
  });
}
