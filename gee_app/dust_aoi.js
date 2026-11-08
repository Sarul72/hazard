/*
 * Монгол орны гамшгийн эрсдэлийн хяналт: тоосны хиймэл дагуулын шалгалт (Google Earth Engine App)
 * Mongolia Hazard Watch: satellite check of dust over a drawn area
 *
 * Copyright (C) 2026 Sigma0sanaa
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public
 * License version 2 as published by the Free Software Foundation. It is distributed WITHOUT ANY WARRANTY; see the
 * file LICENSE in this folder. Only the folder gee_app is under this licence.
 *
 * Three independent signs of dust for one day, all coarse (5-44 km): Sentinel-5P TROPOMI absorbing aerosol index
 * (positive = absorbing aerosol, dust or smoke), CAMS dust aerosol optical depth (a model; before 2021-06-24 only the
 * total aerosol optical depth exists), and the MODIS Aqua split-window brightness temperature difference BT31 - BT32
 * (negative over dust). Tests in Mongolia (docs/METHODS.md) found the BTD negative over clear spring desert as well, so
 * it never decides alone.
 *
 * The code is written in ES5 for the Code Editor.
 */

// ------------------------------------------------------------------------------------------------ settings
var APP = {
  hardKm2: 300000,   // coarse data: large areas are fine, but the free quota is shared by everyone
  aai: 1.0,          // AAI above this marks absorbing aerosol
  btd: -0.5,         // BT31 - BT32 below this (K) marks possible dust
  btWarm: 250,       // K; colder pixels are cloud tops, not dust
  camsDust: 0.1,     // CAMS dust AOD above this
  share: 0.3,        // a source "sees dust" when this share of the area is above its level
  seriesDays: 60     // longest time series
};

var EXAMPLE = { box: [103.5, 42.8, 105.5, 44.2], day: '2023-04-10', from: '2023-03-15', to: '2023-04-30' };

// ------------------------------------------------------------------------------------------------ data
function aai(day) {
  var d0 = ee.Date(day), d1 = d0.advance(1, 'day');
  var off = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_AER_AI').filterDate(d0, d1).select('absorbing_aerosol_index');
  var nrt = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_AER_AI').filterDate(d0, d1).select('absorbing_aerosol_index');
  var none = ee.ImageCollection([ee.Image.constant(0).rename('absorbing_aerosol_index').toFloat().updateMask(0)]);
  return ee.ImageCollection(ee.Algorithms.If(off.size().gt(0), off, nrt)).merge(none).mean().rename('aai');
}

/** CAMS for the daytime hours of a day (03-10 UTC = 11-18 Ulaanbaatar), from the run of 00 UTC. */
function cams(day) {
  var d0 = ee.Date(day);
  var col = ee.ImageCollection('ECMWF/CAMS/NRT').filterDate(d0.advance(3, 'hour'), d0.advance(10, 'hour'))
    .filter(ee.Filter.eq('model_initialization_hour', 0));
  var dust = col.filter(ee.Filter.listContains('system:band_names', 'dust_aerosol_optical_depth_at_550nm_surface'));
  var none = ee.ImageCollection([ee.Image.constant(0).rename('aod').toFloat().updateMask(0)]);
  var pick = ee.ImageCollection(ee.Algorithms.If(dust.size().gt(0),
    dust.select(['dust_aerosol_optical_depth_at_550nm_surface'], ['aod']),
    col.select(['total_aerosol_optical_depth_at_550nm_surface'], ['aod'])));
  return { image: pick.merge(none).mean().rename('aod'), isDust: dust.size().gt(0) };
}

function btd(day) {
  var d0 = ee.Date(day);
  var col = ee.ImageCollection('MODIS/061/MYD09CMG').filterDate(d0, d0.advance(1, 'day'));
  var none = ee.ImageCollection([ee.Image.constant([0, 0]).rename(['Coarse_Resolution_Brightness_Temperature_Band_31', 'Coarse_Resolution_Brightness_Temperature_Band_32']).toFloat().updateMask(0)]);
  var img = col.merge(none).first();
  var b31 = img.select('Coarse_Resolution_Brightness_Temperature_Band_31');
  var b32 = img.select('Coarse_Resolution_Brightness_Temperature_Band_32');
  return b31.subtract(b32).updateMask(b31.gt(APP.btWarm)).rename('btd');
}

function firms(day) {
  var d0 = ee.Date(day);
  var none = ee.ImageCollection([ee.Image.constant(0).rename('T21').toFloat().updateMask(0)]);
  return ee.ImageCollection('FIRMS').filterDate(d0.advance(-1, 'day'), d0.advance(1, 'day')).select('T21').merge(none).max();
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
function normalDate(text) {
  var m = DATE_RE.exec(text || '');
  if (!m) return null;
  var mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return m[1] + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
}
function fmt(x, d) { return x === null || x === undefined ? '—' : Number(x).toFixed(d); }
function pct(x) { return x === null || x === undefined ? '—' : Math.round(100 * x) + '%'; }

// ------------------------------------------------------------------------------------------------ interface
var map = ui.Map();
map.setOptions('HYBRID');
map.setCenter(105.5, 45.5, 5);
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

panel.add(ui.Label('Тоосны хиймэл дагуулын шалгалт', { fontWeight: 'bold', fontSize: '18px' }));
panel.add(note('Монгол орны гамшгийн эрсдэлийн хяналт. Сонгосон өдөр, талбайд гурван бие даасан эх сурвалж тоос харуулж байгаа эсэхийг шалгана: TROPOMI-ийн аэрозолийн индекс, CAMS-ийн тоосны загвар, MODIS-ийн дулааны хоёр сувгийн зөрүү. Бүгд бүдүүн (5–44 км). Албан ёсны мэдээ биш.'));

panel.add(heading('1. Талбай'));
panel.add(note('Тэгш өнцөгт эсвэл олон өнцөгт зурна. Өгөгдөл бүдүүн тул том талбай (300,000 км² хүртэл) зурж болно.'));
var drawButton = ui.Button({ label: 'Шинэ талбай зурах', onClick: function () {
  tools.layers().reset();
  map.layers().reset();
  tools.setShape('rectangle');
  tools.draw();
} });
var exampleButton = ui.Button({ label: 'Жишээ: Өмнөговь, 2023-04-10', onClick: function () {
  var g = ee.Geometry.Rectangle(EXAMPLE.box);
  tools.layers().reset([ui.Map.GeometryLayer({ geometries: [g], name: 'талбай', color: 'ffffff' })]);
  dayBox.setValue(EXAMPLE.day); fromBox.setValue(EXAMPLE.from); toBox.setValue(EXAMPLE.to);
  map.centerObject(g, 7);
} });
panel.add(ui.Panel([drawButton, exampleButton], ui.Panel.Layout.flow('horizontal')));

panel.add(heading('2. Огноо (ЖЖЖЖ-СС-ӨӨ)'));
function dateBox(value) { return ui.Textbox({ value: value, style: { width: '96px', margin: '2px 3px' } }); }
var dayBox = dateBox(EXAMPLE.day), fromBox = dateBox(EXAMPLE.from), toBox = dateBox(EXAMPLE.to);
var LBL = { width: '112px', fontSize: '12.5px', margin: '8px 2px 0 4px' };
panel.add(ui.Panel([ui.Label('Шалгах өдөр:', LBL), dayBox], ui.Panel.Layout.flow('horizontal')));
panel.add(ui.Panel([ui.Label('Цуваа (60 хоног хүртэл):', LBL), fromBox, toBox], ui.Panel.Layout.flow('horizontal')));
panel.add(note('Хиймэл дагуулууд Монголын дээгүүр өдрийн 13–14 цагт өнгөрдөг тул өглөө, орой болсон шуургыг алгасаж болно. CAMS-ийн тоосны тусдаа үзүүлэлт 2021-06-24-нөөс эхэлдэг; түүнээс өмнө нийт аэрозолийг харуулна.'));

var runButton = ui.Button({ label: 'Тооцоолох', style: { stretch: 'horizontal', fontWeight: 'bold' } });
panel.add(runButton);
var status = ui.Label('', { color: 'b00020', whiteSpace: 'pre-wrap' });
panel.add(status);
var results = ui.Panel();
panel.add(results);

panel.add(heading('Анхааруулга'));
panel.add(note('Аэрозолийн индекс тоос, утааг ялгадаггүй: ойролцоо FIRMS-ийн галын цэг байвал утаа байж болно. Бага өндөрт байгаа тоос, үүлэн доорх тоосыг сул харуулдаг.'));
panel.add(note('MODIS-ийн дулааны зөрүү (BTD) хаврын цэлмэг өдөр ч Говийн элсэн гадаргуу дээр сөрөг гардаг (туршилтад тайван өдөр талбайн 96%-ийг тоос гэж андуурсан). Тиймээс BTD-г ганцааранг нь шийдвэр болгохгүй. Нарийвчлал 5.6 км; МУИС-ын судалгаанууд 1 км-ийн өгөгдөл ашигласан.'));
panel.add(note('CAMS бол загварын тооцоо. Туршилтад Говийн том шуурганы өдөр тоосны AOD-ийг 0.07–0.18 гэж бага үнэлсэн.'));

panel.add(heading('Эх сурвалж'));
function link(text, url) { return ui.Label(text, { fontSize: '12px', margin: '2px 8px' }).setUrl(url); }
panel.add(link('Contains modified Copernicus Sentinel-5P data (TROPOMI UV Aerosol Index)', 'https://sentinels.copernicus.eu/'));
panel.add(link('Copernicus Atmosphere Monitoring Service (CAMS) global near-real-time, ECMWF', 'https://atmosphere.copernicus.eu/'));
panel.add(link('Vermote, E. (2021). MODIS/Aqua Surface Reflectance Daily L3 Global 0.05Deg CMG (MYD09CMG v061), NASA LP DAAC', 'https://doi.org/10.5067/MODIS/MYD09CMG.061'));
panel.add(link('Ackerman, S.A. (1997). Remote sensing aerosols using satellite infrared observations. JGR 102, 17069', 'https://doi.org/10.1029/96JD03066'));
panel.add(link('NASA FIRMS: Fire Information for Resource Management System', 'https://firms.modaps.eosdis.nasa.gov/'));
panel.add(link('Код: github.com/Sigma0sanaa/hazard, gee_app (GPL-2.0)', 'https://github.com/Sigma0sanaa/hazard'));

// ------------------------------------------------------------------------------------------------ run
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
  var day = normalDate(dayBox.getValue()), from = normalDate(fromBox.getValue()), to = normalDate(toBox.getValue());
  if (!day || !from || !to || from > to) return fail('Огноог ЖЖЖЖ-СС-ӨӨ хэлбэрээр, цувааны эхлэлийг төгсгөлөөс өмнө бичнэ үү.');
  dayBox.setValue(day); fromBox.setValue(from); toBox.setValue(to);
  var days = (new Date(to) - new Date(from)) / 86400000 + 1;
  if (days > APP.seriesDays) return fail('Цуваа ' + APP.seriesDays + ' хоногоос урт байна. Хугацааг богиносгоно уу.');
  var region = tools.layers().get(0).toGeometry();
  busy(true);
  status.setValue('Тооцоолж байна… (талбайн хэмжээг шалгаж байна)');
  region.area(1000).evaluate(function (m2, err) {
    if (err) return fail(plainError(err));
    var km2 = m2 / 1e6;
    if (km2 > APP.hardKm2) return fail('Талбай хэт том байна (' + fmt(km2, 0) + ' км²). ' + APP.hardKm2 + ' км²-аас бага талбай зурна уу.');
    compute(region, day, from, days, km2);
  });
});

function compute(region, day, from, days, km2) {
  status.setValue('Тооцоолж байна… (тухайн өдөр)');
  var a = aai(day).clip(region), c = cams(day), b = btd(day).clip(region), f = firms(day).clip(region);
  var aod = c.image.clip(region);

  map.layers().reset();
  tools.layers().get(0).setShown(false);
  map.addLayer(aod, { min: 0, max: 0.6, palette: ['ffffcc', 'fd8d3c', '800026'] }, 'CAMS AOD', false);
  map.addLayer(b, { min: -3, max: 3, palette: ['8c510a', 'f5f5f5', '01665e'] }, 'MODIS BT31 − BT32 (бор = тоос байж болох)', false);
  map.addLayer(a, { min: -1, max: 4, palette: ['2166ac', 'f7f7f7', 'fdae61', 'b2182b'] }, 'TROPOMI аэрозолийн индекс (AAI)');
  map.addLayer(f.selfMask(), { min: 300, max: 400, palette: ['ff00ff'] }, 'FIRMS галын цэг (утаа байж болох)');
  map.addLayer(ee.Image().byte().paint(ee.FeatureCollection([ee.Feature(region)]), 1, 2), { palette: ['ffffff'] }, 'Талбайн хүрээ');
  map.centerObject(region);

  var mean = function (img, scale) {
    return img.reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: scale, maxPixels: 1e10, tileScale: 4, bestEffort: true }).values().get(0);
  };
  var numbers = ee.Dictionary({
    aaiMean: mean(a, 5500), aaiShare: mean(a.gt(APP.aai), 5500), aaiSeen: mean(a.mask(), 5500),
    aodMean: mean(aod, 44000), aodMax: aod.reduceRegion({ reducer: ee.Reducer.max(), geometry: region, scale: 44000, bestEffort: true }).values().get(0), isDust: c.isDust,
    btdMean: mean(b, 5600), btdShare: mean(b.lt(APP.btd), 5600), btdSeen: mean(b.mask().unmask(0), 5600),
    fires: f.mask().reduceRegion({ reducer: ee.Reducer.sum(), geometry: region, scale: 1000, bestEffort: true }).values().get(0)
  });
  numbers.evaluate(function (n, err) {
    if (err) return fail(plainError(err));
    var votes = 0, lines = [];
    var aaiYes = n.aaiShare !== null && n.aaiShare >= APP.share;
    var btdYes = n.btdShare !== null && n.btdShare >= APP.share;
    var camsYes = n.isDust && n.aodMax !== null && n.aodMax >= APP.camsDust;
    if (aaiYes) votes++;
    if (btdYes) votes++;
    if (camsYes) votes++;
    lines.push('TROPOMI AAI: дундаж ' + fmt(n.aaiMean, 2) + ', AAI > ' + APP.aai + ' талбайн ' + pct(n.aaiShare) + (aaiYes ? ' → тоос эсвэл утаа' : ''));
    lines.push('CAMS ' + (n.isDust ? 'тоосны' : 'нийт аэрозолийн (тоосны тусдаа үзүүлэлт байхгүй)') + ' AOD: дундаж ' + fmt(n.aodMean, 3) + ', хамгийн их ' + fmt(n.aodMax, 3) + (camsYes ? ' → тоос' : ''));
    lines.push('MODIS BTD: дундаж ' + fmt(n.btdMean, 2) + ' K, ' + APP.btd + ' K-ээс бага талбайн ' + pct(n.btdShare) + ', үүлгүй ' + pct(n.btdSeen) + (btdYes ? ' → тоос байж болно' : ''));
    var verdict = (n.isDust ? 3 : 2) + ' эх сурвалжаас ' + votes + ' нь тоос гэж байна';
    if (aaiYes && btdYes) verdict += ': TROPOMI ба MODIS хоёул тоос гэж байгаа нь хамгийн найдвартай тохиолдол.';
    else if (btdYes && !aaiYes) verdict += ': зөвхөн BTD тоос гэж байна. Хаврын элсэн гадаргуу дээр BTD хуурамч дохио өгдөг тул баталгаагүй.';
    else if (aaiYes && !btdYes) verdict += ': зөвхөн AAI. Үүл, утаа эсвэл өндөрт байгаа тоос байж болно.';
    else verdict += '.';
    lines.push(verdict);
    if (n.fires > 0) lines.push('Ойролцоо FIRMS-ийн галын цэг байна: AAI-ийн дохио утаа байж болно.');
    showResults(lines);
    series(region, from, days);
  });
}

function series(region, from, days) {
  status.setValue('Тооцоолж байна… (хугацааны цуваа)');
  var start = ee.Date(from);
  var fc = ee.FeatureCollection(ee.List.sequence(0, days - 1).map(function (k) {
    var d = start.advance(ee.Number(k), 'day');
    var a = aai(d).reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 11000, bestEffort: true, tileScale: 4 }).get('aai');
    var c = cams(d).image.reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 44000, bestEffort: true }).get('aod');
    return ee.Feature(null, { 'system:time_start': d.millis(), 'AAI (TROPOMI)': a, 'AOD x10 (CAMS)': ee.Algorithms.If(c, ee.Number(c).multiply(10), null) });
  }));
  var chart = ui.Chart.feature.byFeature(fc, 'system:time_start', ['AAI (TROPOMI)', 'AOD x10 (CAMS)'])
    .setChartType('LineChart')
    .setOptions({ title: 'Талбайн өдөр бүрийн дундаж', hAxis: { title: 'Өдөр', format: 'MM-dd' }, vAxis: { title: 'AAI; CAMS AOD x10' },
      lineWidth: 1.5, pointSize: 2, interpolateNulls: false, colors: ['b2182b', 'fd8d3c'] });
  results.add(chart);
  status.style().set('color', '1a7f37');
  status.setValue('Бэлэн. Графикт AAI 1-ээс дээш бол тоос эсвэл утаа байх магадлалтай.');
  busy(false);
}

function showResults(lines) {
  results.clear();
  results.add(heading('Үр дүн'));
  lines.forEach(function (l) { results.add(ui.Label(l, { fontSize: '12.5px', margin: '2px 8px', whiteSpace: 'pre-wrap' })); });
}
