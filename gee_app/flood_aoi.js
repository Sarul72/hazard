/*
 * Монгол орны гамшгийн эрсдэлийн хяналт: нарийвчилсан үерийн тооцоо (Google Earth Engine App)
 * Mongolia Hazard Watch: detailed flood mapping inside a drawn area
 *
 * Copyright (C) 2026 Sigma0sanaa
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public
 * License version 2 as published by the Free Software Foundation. It is distributed WITHOUT ANY WARRANTY; see the
 * file LICENSE in this folder. Only the folder gee_app is under this licence.
 *
 * The water depth part is a port of FwDET-GEE v2.1 from https://github.com/csdms-contrib/fwdet (FwDET2p1_GEE.txt,
 * GPL-2.0): Peter, B.G., Cohen, S., et al. (2020) IEEE GRSL, doi:10.1109/LGRS.2020.3031190; Cohen, S., et al. (2022)
 * Remote Sensing 14, 5313, doi:10.3390/rs14215313. Changes: Copernicus DEM GLO-30 in place of NED, flood layer from
 * Sentinel-1, the parameters below.
 *
 * Flood extent follows the UN-SPIDER Recommended Practice "Flood mapping and damage assessment using Sentinel-1 SAR
 * data in Google Earth Engine": VH change ratio of smoothed images, threshold 1.25, JRC permanent water and slopes above
 * 5 degrees removed, groups of fewer than 8 pixels removed.
 *
 * How to publish: see README.md in this folder. The code is written in ES5 for the Code Editor.
 */

// ------------------------------------------------------------------------------------------------ settings
var APP = {
  maxKm2: 500,          // up to this area the result is computed at 10 m
  hardKm2: 5000,        // above this the app refuses: the free quota of the project is shared by everyone
  depthKm2: 500,        // water depth only up to this area: the cost surface is heavy
  threshold: 1.25,      // UN-SPIDER; checked on two Mongolian floods, see docs/METHODS.md
  smoothing: 50,        // m, focal mean before the ratio
  permanentMonths: 10,  // JRC seasonality: water at least this many months a year is permanent
  slopeMax: 5,          // degrees
  minPixels: 8,         // smallest group of flood pixels kept
  opticalDays: 3,       // Sentinel-2 within this many days of the radar image confirms water
  fwdet: { slope: 0.5, iterations: 10, kernel: 5 }  // FwDET-GEE v2.1 settings of FwDET2p1_GEE.txt
};

// The test flood: Selenge and Orkhon at Sükhbaatar city, above the danger level on 2021-09-06.
var EXAMPLE = {
  box: [106.05, 50.12, 106.33, 50.28],
  before: ['2021-08-15', '2021-08-25'],
  after: ['2021-09-10', '2021-09-16']
};

var JRC = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('seasonality');
var BUILT = ee.ImageCollection('ESA/WorldCover/v200').first().eq(50).unmask(0);
var PERMANENT = JRC.gte(APP.permanentMonths).unmask(0);

// ------------------------------------------------------------------------------------------------ data
function demFor(region) {
  var c = ee.ImageCollection('COPERNICUS/DEM/GLO30_2024_1').filterBounds(region).select('DEM');
  return c.mosaic().setDefaultProjection(c.first().projection()).clip(region.buffer(2000)).rename('elevation');
}

function radarCollection(region) {
  return ee.ImageCollection('COPERNICUS/S1_GRD')
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('resolution_meters', 10))
    .filterBounds(region)
    .select('VH');
}

function period(pair) {
  return [ee.Date(pair[0]), ee.Date(pair[1]).advance(1, 'day')];  // the end date counts too
}

/** Relative orbits that have a scene in both periods: before and after must look from the same side. */
function sharedOrbits(region, before, after) {
  var col = radarCollection(region), b = period(before), a = period(after);
  var orbitsBefore = col.filterDate(b[0], b[1]).aggregate_array('relativeOrbitNumber_start');
  return col.filterDate(a[0], a[1]).aggregate_array('relativeOrbitNumber_start').distinct()
    .filter(ee.Filter.inList('item', orbitsBefore));
}

/** The last pass before and the first pass after, from one orbit, with every frame of each pass. */
function radarPair(region, before, after, orbit) {
  var col = radarCollection(region).filter(ee.Filter.eq('relativeOrbitNumber_start', orbit));
  var b = period(before), a = period(after);
  var colA = col.filterDate(a[0], a[1]), colB = col.filterDate(b[0], b[1]);
  var tA = ee.Date(colA.aggregate_min('system:time_start')), tB = ee.Date(colB.aggregate_max('system:time_start'));
  return {
    after: colA.filterDate(tA.advance(-1, 'hour'), tA.advance(1, 'hour')).mosaic().clip(region),
    before: colB.filterDate(tB.advance(-1, 'hour'), tB.advance(1, 'hour')).mosaic().clip(region),
    afterDate: tA,
    beforeDate: tB,
    pass: colA.first().get('orbitProperties_pass')
  };
}

/** UN-SPIDER Recommended Practice. The ratio is taken on the dB values, as in the original script.
 * The ratio means "darker" only for negative dB; where the smoothed before image is 0 dB or more it is left out.
 * focal_mean on dB averages logarithms, so in linear power it is the geometric mean, not the arithmetic mean. */
function radarFlood(region, pair, threshold, scale) {
  var before = pair.before.focal_mean(APP.smoothing, 'circle', 'meters');
  var ratio = pair.after.focal_mean(APP.smoothing, 'circle', 'meters').divide(before);
  var water = ratio.gt(threshold).and(before.lt(0)).where(PERMANENT, 0);
  water = water.updateMask(water);
  // connectedPixelCount runs at the scale of the request, so the count is set for that scale: the smallest patch
  // stays 8 pixels of 10 m (800 m2) at 10 m, 2 pixels (800 m2) at 20 m and 1 pixel (900 m2) at 30 m. A reproject
  // to 10 m would hold it exactly but makes large areas and zoomed-out map tiles fail. The map layer still follows
  // the zoom of the screen; the numbers and downloads use this scale.
  var minCount = Math.max(1, Math.ceil(APP.minPixels * 100 / (scale * scale)));
  water = water.updateMask(water.connectedPixelCount(25).gte(minCount));
  water = water.updateMask(ee.Terrain.slope(demFor(region)).lt(APP.slopeMax));
  return water.rename('flood');
}

function clearMask(img) {
  var scl = img.select('SCL');
  return scl.neq(0).and(scl.neq(3)).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
}

/** Sentinel-2 images near the radar date, each with the share of the area it sees without cloud. */
function opticalCandidates(region, date) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(region)
    .filterDate(date.advance(-APP.opticalDays, 'day'), date.advance(APP.opticalDays + 1, 'day'))
    .map(function (img) {
      var share = clearMask(img).reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 60, maxPixels: 1e9 }).get('SCL');
      return img.set('clear_share', share);
    });
}

/** New open water seen by Sentinel-2 on the clearest day: MNDWI above 0, cloud and permanent water removed. */
function opticalWater(region, candidates) {
  var best = ee.Image(candidates.sort('clear_share', false).first());
  var t = best.date();
  var day = candidates.filterDate(t.advance(-1, 'hour'), t.advance(1, 'hour')).mosaic();
  var clear = clearMask(day);
  var water = day.normalizedDifference(['B3', 'B11']).gt(0).and(clear).and(PERMANENT.not());
  return { water: water.rename('optical').clip(region), clear: clear.clip(region), date: t, share: best.get('clear_share') };
}

/** FwDET-GEE v2.1 (GPL-2.0), ported from FwDET2p1_GEE.txt. Depth in metres inside the flood layer. */
function fwdet(floodLayer, region) {
  var dem = demFor(region);
  var prj = dem.projection();
  var res = prj.nominalScale();
  var flood = floodLayer.reproject(prj);
  var floodMask = flood.mask().not();
  var floodExtent = floodMask.updateMask(floodMask.eq(0));
  var expand = floodExtent.focal_max(res, 'square', 'meters');
  var mask = expand.mask().add(floodExtent.mask());
  var demEdge = dem.updateMask(mask.eq(1));
  var demE = demEdge;
  demEdge = demEdge.updateMask(ee.Terrain.slope(dem).gt(APP.fwdet.slope).eq(0));
  var edgeMod = demEdge;
  for (var i = 0; i < APP.fwdet.iterations; i++) {
    edgeMod = edgeMod.focal_mean(res.multiply(APP.fwdet.kernel), 'square', 'meters');
  }
  dem = dem.where(demE, edgeMod);
  var mod = dem.updateMask(floodExtent.mask().eq(0));
  var source = mod.mask();
  var val = 10000, push = 5000;
  var cost0 = ee.Image(val).where(source, 0).cumulativeCost(source, push);
  var cost1 = ee.Image(val).where(source, 1).cumulativeCost(source, push);
  var cost2 = mod.unmask(val).cumulativeCost(source, push);
  var costFill = cost2.subtract(cost0).divide(cost1.subtract(cost0));
  var costSurface = mod.unmask(0).add(costFill);
  var costDepth = costSurface.subtract(dem)
    .convolve(ee.Kernel.square({ radius: res.multiply(3), units: 'meters', normalize: true }));
  return costDepth.where(costDepth.lt(0), 0).rename('depth').updateMask(floodLayer.reproject(prj).mask());
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

panel.add(ui.Label('Нарийвчилсан үерийн тооцоо (10–30 м)', { fontWeight: 'bold', fontSize: '18px' }));
panel.add(note('Монгол орны гамшгийн эрсдэлийн хяналт. Sentinel-1 радарын өмнөх, дараах зургийг харьцуулж шинээр усанд автсан газрыг олно. Албан ёсны сэрэмжлүүлэг биш.'));

panel.add(heading('1. Талбай'));
panel.add(note('Газрын зургийн зүүн дээд буланд байгаа тэгш өнцөгт эсвэл олон өнцөгтийн хэрэгслээр талбайгаа зурна. 500 км² хүртэл 10 м-ээр, түүнээс том бол бүдүүн нарийвчлалаар тооцоолно.'));
var drawButton = ui.Button({ label: 'Шинэ талбай зурах', onClick: function () {
  tools.layers().reset();
  map.layers().reset();
  tools.setShape('rectangle');
  tools.draw();
} });
var exampleButton = ui.Button({ label: 'Жишээ: Сэлэнгэ, 2021 оны 9 сар', onClick: function () {
  var g = ee.Geometry.Rectangle(EXAMPLE.box);
  tools.layers().reset([ui.Map.GeometryLayer({ geometries: [g], name: 'талбай', color: 'ffffff' })]);
  beforeStart.setValue(EXAMPLE.before[0]); beforeEnd.setValue(EXAMPLE.before[1]);
  afterStart.setValue(EXAMPLE.after[0]); afterEnd.setValue(EXAMPLE.after[1]);
  map.centerObject(g, 11);
} });
panel.add(ui.Panel([drawButton, exampleButton], ui.Panel.Layout.flow('horizontal')));

panel.add(heading('2. Огноо (ЖЖЖЖ-СС-ӨӨ, жишээ нь 2021-09-13)'));
function dateBox(value) { return ui.Textbox({ value: value, style: { width: '96px', margin: '2px 3px' } }); }
var beforeStart = dateBox(EXAMPLE.before[0]), beforeEnd = dateBox(EXAMPLE.before[1]);
var afterStart = dateBox(EXAMPLE.after[0]), afterEnd = dateBox(EXAMPLE.after[1]);
var DATE_LABEL = { width: '82px', fontSize: '12.5px', margin: '8px 2px 0 4px' };
panel.add(ui.Panel([ui.Label('Үерийн өмнө:', DATE_LABEL), beforeStart, beforeEnd], ui.Panel.Layout.flow('horizontal')));
panel.add(ui.Panel([ui.Label('Үерийн дараа:', DATE_LABEL), afterStart, afterEnd], ui.Panel.Layout.flow('horizontal')));
panel.add(note('Өмнөх хугацааны хамгийн сүүлийн, дараах хугацааны хамгийн эхний радарын зургийг нэг тойрог замаас авна. Sentinel-1 Монголын ихэнх нутагт 6–12 хоногт нэг удаа дайрдаг. 2022–2024 онд олон газарт зураг байхгүй.'));

panel.add(heading('3. Тохиргоо'));
var threshold = ui.Slider({ min: 1.1, max: 1.6, value: APP.threshold, step: 0.05, style: { width: '200px' } });
panel.add(ui.Panel([ui.Label('Өөрчлөлтийн босго:'), threshold], ui.Panel.Layout.flow('horizontal')));
panel.add(note('1.25 нь UN-SPIDER-ийн анхны утга. Бага бол илүү их талбай, илүү их хуурамч үер; их бол цөөн боловч илүү найдвартай.'));
var withDepth = ui.Checkbox({ label: 'Усны гүнийг тооцох (FwDET, удаан)', value: true });
panel.add(withDepth);

var runButton = ui.Button({ label: 'Тооцоолох', style: { stretch: 'horizontal', fontWeight: 'bold' } });
panel.add(runButton);
var status = ui.Label('', { color: 'b00020', whiteSpace: 'pre-wrap' });
panel.add(status);
var results = ui.Panel();
panel.add(results);

panel.add(heading('Анхааруулга'));
panel.add(note('Хот доторх үр дүн магадлалын тооцоо: радар барилгын дунд муу ажилладаг тул улбар шараар тусад нь харуулна. Copernicus DEM нь барилга, модыг багтаасан гадаргын загвар (DSM) тул хот, ойтой газарт усны гүн бодитоос бага гарч болно.'));
panel.add(note('Монголын бэлчээрт хадлан хадах, ургамал хатах үед радар газрыг ус шиг харанхуй харж хуурамч үер гаргадаг. Иймд үүлгүй Sentinel-2 зураг байвал радарын үерийг түүгээр баталгаажуулж, батлагдсан хэсгийг тусад нь харуулна.'));
panel.add(note('Шалгалт: Сэлэнгэ (2021) ба Хэрлэн (2020)-ийн үерт радарын тэмдэглэсэн усны 33–63%-ийг Sentinel-2 баталсан. Усны гүнийг хэмжилттэй харьцуулж шалгаагүй.'));

panel.add(heading('Эх сурвалж'));
function link(text, url) { return ui.Label(text, { fontSize: '12px', margin: '2px 8px' }).setUrl(url); }
panel.add(link('UN-SPIDER Recommended Practice: Sentinel-1 flood mapping in GEE', 'https://www.un-spider.org/advisory-support/recommended-practices/recommended-practice-google-earth-engine-flood-mapping'));
panel.add(link('Peter et al. (2020), FwDET-GEE, IEEE GRSL', 'https://doi.org/10.1109/LGRS.2020.3031190'));
panel.add(link('Cohen et al. (2022), FwDET v2.1, Remote Sensing 14, 5313', 'https://doi.org/10.3390/rs14215313'));
panel.add(link('Contains modified Copernicus Sentinel data (Sentinel-1, Sentinel-2)', 'https://sentinels.copernicus.eu/'));
panel.add(link('Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved', 'https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model'));
panel.add(link('Pekel et al. (2016), JRC Global Surface Water, Nature 540', 'https://doi.org/10.1038/nature20584'));
panel.add(link('Zanaga et al. (2022), ESA WorldCover 10 m v200, CC BY 4.0', 'https://doi.org/10.5281/zenodo.7254221'));
panel.add(link('Код: github.com/Sigma0sanaa/hazard, gee_app (GPL-2.0)', 'https://github.com/Sigma0sanaa/hazard'));

function legendRow(color, text) {
  return ui.Panel([ui.Label('', { backgroundColor: color, padding: '7px', margin: '2px 6px 2px 0' }), ui.Label(text, { fontSize: '12px', margin: '2px 0' })], ui.Panel.Layout.flow('horizontal'));
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
  return { before: [v[0], v[1]], after: [v[2], v[3]] };
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
  if (!dates) return fail('Огноог ЖЖЖЖ-СС-ӨӨ хэлбэрээр, үерийн өмнөх хугацааг дараах хугацаанаас өмнө бичнэ үү.');
  var region = tools.layers().get(0).toGeometry();
  busy(true);
  status.setValue('Тооцоолж байна… (талбайн хэмжээг шалгаж байна)');
  region.area(1).evaluate(function (m2, err) {
    if (err) return fail(plainError(err));
    var km2 = m2 / 1e6;
    if (km2 > APP.hardKm2) return fail('Талбай хэт том байна (' + fmt(km2, 0) + ' км²). ' + APP.hardKm2 + ' км²-аас бага талбай зурна уу.');
    var scale = km2 <= APP.maxKm2 ? 10 : (km2 <= 4 * APP.maxKm2 ? 20 : 30);
    var notes = [];
    if (scale > 10) notes.push('Талбай ' + APP.maxKm2 + ' км²-аас том (' + fmt(km2, 0) + ' км²) тул тоог ' + scale + ' м-ийн нарийвчлалаар гаргалаа.');
    var depthOn = withDepth.getValue() && km2 <= APP.depthKm2;
    if (withDepth.getValue() && !depthOn) notes.push('Усны гүнийг ' + APP.depthKm2 + ' км² хүртэлх талбайд л тооцно.');
    status.setValue('Тооцоолж байна… (радарын зураг хайж байна)');
    sharedOrbits(region, dates.before, dates.after).evaluate(function (orbits, err2) {
      if (err2) return fail(plainError(err2));
      if (!orbits || orbits.length === 0) {
        return fail('Энэ талбайд сонгосон хоёр хугацаанд нэг тойрог замын Sentinel-1 зураг олдсонгүй. Хугацааг уртасгана уу. 2022–2024 онд Монголын олон газарт Sentinel-1 зураг байхгүй.');
      }
      compute(region, dates, orbits[0], scale, km2, depthOn, notes);
    });
  });
});

function compute(region, dates, orbit, scale, km2, depthOn, notes) {
  status.setValue('Тооцоолж байна… (үерийн талбай)');
  var pair = radarPair(region, dates.before, dates.after, orbit);
  var flood = radarFlood(region, pair, threshold.getValue(), scale);
  var floodRural = flood.updateMask(BUILT.not());
  var floodCity = flood.updateMask(BUILT);
  var candidates = opticalCandidates(region, pair.afterDate);

  map.layers().reset();
  // the drawn shape hides the result under its fill: show only a thin outline from here on
  tools.layers().get(0).setShown(false);
  map.addLayer(pair.before, { min: -25, max: -5 }, 'Радар, өмнө', false);
  map.addLayer(pair.after, { min: -25, max: -5 }, 'Радар, дараа', false);
  map.addLayer(PERMANENT.selfMask().clip(region), { palette: ['1f3b8a'] }, 'Байнгын ус (JRC)');
  map.addLayer(floodRural, { palette: ['00e5ff'] }, 'Радарын үер');
  map.addLayer(floodCity, { palette: ['ff9900'] }, 'Хот дахь радарын үер (магадлалын)');
  map.addLayer(ee.Image().byte().paint(ee.FeatureCollection([ee.Feature(region)]), 1, 2), { palette: ['ffffff'] }, 'Талбайн хүрээ');
  map.centerObject(region);

  var area = ee.Image.pixelArea().divide(1e6);
  var numbers = ee.Dictionary({
    before: pair.beforeDate.format('YYYY-MM-dd HH:mm'),
    after: pair.afterDate.format('YYYY-MM-dd HH:mm'),
    pass: pair.pass,
    optical_n: candidates.size(),
    radar: area.updateMask(floodRural.mask()).reduceRegion({ reducer: ee.Reducer.sum(), geometry: region, scale: scale, maxPixels: 1e10, tileScale: 4 }).get('area'),
    city: area.updateMask(floodCity.mask()).reduceRegion({ reducer: ee.Reducer.sum(), geometry: region, scale: scale, maxPixels: 1e10, tileScale: 4 }).get('area')
  });
  numbers.evaluate(function (n, err) {
    if (err) return fail(plainError(err));
    var lines = [
      'Радарын зураг (тойрог зам ' + orbit + ', ' + (n.pass === 'ASCENDING' ? 'өгсөх' : 'уруудах') + '): ' + n.before + ' → ' + n.after + ' (UTC)',
      'Шинээр усанд автсан (хотоос гадна): ' + fmt(n.radar, 2) + ' км²',
      'Хот доторх (магадлалын): ' + fmt(n.city, 2) + ' км²',
      'Талбайн хэмжээ: ' + fmt(km2, 0) + ' км², тооцоолсон нарийвчлал ' + scale + ' м'
    ];
    showResults(lines.concat(notes), []);
    var downloads = [];
    var floodCode = flood.unmask(0).add(floodCity.unmask(0)).toByte().clip(region).rename('flood');  // 1 radar flood, 2 in a city
    downloads.push(['Үерийн давхарга (GeoTIFF, 1 = үер, 2 = хот дахь үер)', floodCode, scale]);
    if (n.optical_n > 0) {
      status.setValue('Тооцоолж байна… (Sentinel-2-оор шалгаж байна)');
      var o = opticalWater(region, candidates);
      map.addLayer(o.water.selfMask(), { palette: ['ffff00'] }, 'Sentinel-2 дээрх шинэ ус', false);
      var confirmed = floodRural.updateMask(o.water);
      map.addLayer(confirmed, { palette: ['00a651'] }, 'Sentinel-2-оор батлагдсан үер');
      var sums = ee.Dictionary({
        date: o.date.format('YYYY-MM-dd'),
        share: o.share,
        seen: area.updateMask(floodRural.mask()).updateMask(o.clear).reduceRegion({ reducer: ee.Reducer.sum(), geometry: region, scale: scale, maxPixels: 1e10, tileScale: 4 }).get('area'),
        optical: area.updateMask(o.water.and(BUILT.not())).reduceRegion({ reducer: ee.Reducer.sum(), geometry: region, scale: scale, maxPixels: 1e10, tileScale: 4 }).get('area'),
        both: area.updateMask(confirmed.mask()).reduceRegion({ reducer: ee.Reducer.sum(), geometry: region, scale: scale, maxPixels: 1e10, tileScale: 4 }).get('area')
      });
      sums.evaluate(function (s, err3) {
        if (err3) return fail(plainError(err3));
        lines.push('Sentinel-2 (' + s.date + ', талбайн ' + Math.round(100 * (s.share || 0)) + '% нь үүлгүй): шинэ ус ' + fmt(s.optical, 2) + ' км²');
        lines.push('Радарын үерийн батлагдсан хувь: ' + pct(s.both, s.seen) + ' (үүлгүй хэсэгт)');
        lines.push('Sentinel-2-ийн уснаас радар илрүүлсэн хувь: ' + pct(s.both, s.optical));
        if ((s.share || 0) < 0.5) lines.push('Sentinel-2 зураг үүлтэй тул баталгаажуулалт найдвар муутай.');
        showResults(lines.concat(notes), []);
        finish(region, flood, depthOn, lines, notes, downloads);
      });
    } else {
      lines.push('Радарын зургаас ±' + APP.opticalDays + ' хоногт Sentinel-2 зураг олдсонгүй: үр дүн баталгаажаагүй.');
      showResults(lines.concat(notes), []);
      finish(region, flood, depthOn, lines, notes, downloads);
    }
  });
}

function finish(region, flood, depthOn, lines, notes, downloads) {
  if (!depthOn) { done(lines, notes, downloads); return; }
  status.setValue('Тооцоолж байна… (усны гүн, FwDET)');
  var depth = fwdet(flood, region);
  map.addLayer(depth, { min: 0, max: 2, palette: ['e0f3ff', '3a7bd5', '6a0dad'] }, 'Усны гүн, м (FwDET)', false);
  depth.reduceRegion({ reducer: ee.Reducer.percentile([50, 90]).combine(ee.Reducer.mean(), '', true), geometry: region, scale: 30, maxPixels: 1e10, tileScale: 4 })
    .evaluate(function (d, err) {
      if (err) { notes.push('Усны гүнийг тооцож чадсангүй: ' + plainError(err)); done(lines, notes, downloads); return; }
      lines.push('Усны гүн (FwDET): дундаж ' + fmt(d.depth_mean, 2) + ' м, медиан ' + fmt(d.depth_p50, 2) + ' м, 90%-ийн ' + fmt(d.depth_p90, 2) + ' м. Хэмжилттэй харьцуулж шалгаагүй.');
      downloads.push(['Усны гүн (GeoTIFF, метр)', depth.toFloat().clip(region), 30]);
      done(lines, notes, downloads);
    });
}

function done(lines, notes, downloads) {
  showResults(lines.concat(notes), downloads);
  status.style().set('color', '1a7f37');
  status.setValue('Бэлэн.');
  busy(false);
}

function showResults(lines, downloads) {
  results.clear();
  results.add(heading('Үр дүн'));
  lines.forEach(function (l) { results.add(ui.Label(l, { fontSize: '12.5px', margin: '2px 8px', whiteSpace: 'pre-wrap' })); });
  results.add(legendRow('#00a651', 'Sentinel-2-оор батлагдсан үер'));
  results.add(legendRow('#00e5ff', 'Радарын үер (батлагдаагүй хэсэг)'));
  results.add(legendRow('#ff9900', 'Хот дахь радарын үер (магадлалын)'));
  results.add(legendRow('#1f3b8a', 'Байнгын ус (JRC, жилд 10+ сар)'));
  downloads.forEach(function (d) {
    var label = ui.Label('Татах холбоос бэлтгэж байна…', { fontSize: '12px', margin: '2px 8px' });
    results.add(label);
    d[1].getDownloadURL({ name: 'mongolia_flood_aoi', scale: d[2], region: d[1].geometry(), format: 'GEO_TIFF', filePerBand: false }, function (url, err) {
      if (err) { label.setValue(d[0] + ': татах боломжгүй (' + plainError(err) + ')'); return; }
      label.setValue('Татах: ' + d[0]);
      label.setUrl(url);
    });
  });
}
