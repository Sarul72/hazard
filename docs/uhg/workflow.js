// Ухаа худаг, Цогтцэций. Google Earth Engine Code Editor (JavaScript).
// Талбай, QA, түүврийн дүрэм болон эх сурвалжийг тайлангаас харна уу.
var lon = 105.5181, lat = 43.6678;
var point = ee.Geometry.Point([lon, lat]);
var region = point.buffer(8000, 5);
var site = ee.Geometry.Polygon([[[105.542033,43.655389],[105.447569,43.655394],
  [105.447569,43.690394],[105.542036,43.690389],[105.542033,43.655389]]]);
// 2025 оны төлөвлөгөөний X/Y хүснэгтийг UTM 48N гэж таамагласан мэдрэмжийн шалгалт.
var altArea = ee.Geometry.Polygon([[[536106.290,4835630.651],[536085.354,4839519.390],
  [543699.684,4839364.841],[543725.328,4835676.639],[536106.290,4835630.651]]],
  'EPSG:32648',false);
var years = [2023, 2024, 2025];
var modis = ee.ImageCollection('MODIS/061/MCD19A2_GRANULES')
  .filterBounds(point).filter(ee.Filter.stringContains('system:index', '_h25v04_'));
var nativeGrid = ee.Image(modis.filterDate('2025-06-01','2025-06-02').first())
  .select('Optical_Depth_055').projection();
var era = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY').select(
  ['u_component_of_wind_10m','v_component_of_wind_10m','volumetric_soil_water_layer_1'],
  ['u','v','soil']);
var dust = ee.ImageCollection('NASA/GSFC/MERRA/aer/2').select('DUEXTTAU');
var ai = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_AER_AI').filterBounds(point)
  .select('absorbing_aerosol_index');
var xy = ee.Image.pixelLonLat();
var east = xy.select('longitude').subtract(lon).multiply(111.32 * Math.cos(lat*Math.PI/180));
var north = xy.select('latitude').subtract(lat).multiply(111.13);
var radius = east.hypot(north);
var ring = radius.gte(3).and(radius.lte(8));
var angleLimit = Math.cos(Math.PI/4);
var empty = ee.Image.constant(0).rename('aod').toFloat().selfMask();
function clean(img) {
  var qa = img.select('AOD_QA');
  var raw = img.select('Optical_Depth_055');
  var good = qa.bitwiseAnd(4095).eq(1).and(raw.gte(-100)).and(raw.lte(8000));
  return raw.updateMask(good).multiply(0.001).toFloat().rename('aod')
    .copyProperties(img, ['system:time_start']);
}
function daily(year, day) {
  var start = ee.Date.fromYMD(year, 6, day), end = start.advance(1,'day');
  var passes = modis.filterDate(start,end).map(clean);
  var aod = ee.ImageCollection([empty]).merge(passes).mean().setDefaultProjection(nativeGrid);
  // Орон нутгийн 11–14 цаг. Түр зуур эргэсэн болон сул салхийг хасна.
  var first = start.advance(3,'hour'), last = start.advance(7,'hour');
  var hours = era.filterDate(first,last).map(function(im) {
    return im.addBands(im.select('u').hypot(im.select('v')).rename('speed'));
  });
  var weather = hours.mean().reduceRegion({reducer:ee.Reducer.first(),
    geometry:point, crs:ee.Image(era.first()).projection()});
  var u = weather.getNumber('u'), v = weather.getNumber('v');
  var speed = u.hypot(v);
  var persistence = speed.divide(weather.getNumber('speed').max(0.0001));
  var cosine = east.multiply(u).add(north.multiply(v))
    .divide(radius.multiply(speed).max(0.000001));
  var down = ring.and(cosine.gte(angleLimit)), up = ring.and(cosine.lte(-angleLimit));
  var bands = aod.clip(site).rename('site').addBands(aod.updateMask(down).rename('down'))
    .addBands(aod.updateMask(up).rename('up'));
  var stats = bands.reduceRegion({reducer:ee.Reducer.mean().unweighted()
    .combine({reducer2:ee.Reducer.count(),sharedInputs:true}), geometry:region,
    crs:nativeGrid,maxPixels:100000});
  var alternative = aod.reduceRegion({reducer:ee.Reducer.mean().unweighted()
    .combine({reducer2:ee.Reducer.count(),sharedInputs:true}),geometry:altArea,
    crs:nativeGrid,maxPixels:100000});
  stats = stats.set('emp_utm48n_count',alternative.get('aod_count'))
    .set('emp_utm48n_mean',alternative.get('aod_mean'));
  var m = dust.filterDate(first,last).mean().reduceRegion({reducer:ee.Reducer.first(),
    geometry:point,crs:ee.Image(dust.first()).projection()}).get('DUEXTTAU');
  var uv = ee.ImageCollection([empty.rename('absorbing_aerosol_index')]).merge(ai.filterDate(start,end))
    .mean().reduceRegion({reducer:ee.Reducer.mean(),geometry:region,scale:5000}).get('absorbing_aerosol_index');
  var ok = speed.gte(2).and(persistence.gte(0.8)).and(hours.size().eq(4))
    .and(stats.getNumber('down_count').gte(8)).and(stats.getNumber('up_count').gte(8));
  return aod.set(stats).set({date:start.format('YYYY-MM-dd'),year:year,wind_ms:speed,
    u_ms:u,v_ms:v,bearing_to:v.atan2(u).multiply(180/Math.PI).add(360).mod(360),steadiness:persistence,
    soil_m3m3:weather.get('soil'),dust_aot:m,uvai:uv,passes:passes.size(),paired:ok,
    difference:ee.Algorithms.If(ok,ee.Number(stats.get('down_mean')).subtract(stats.get('up_mean')),null),
    'system:time_start':start.millis()});
}
var fields = ['date','year','passes','site_count','site_mean','down_count','down_mean',
  'up_count','up_mean','wind_ms','u_ms','v_ms','bearing_to','steadiness','soil_m3m3','dust_aot','uvai','paired','difference'];
fields.push('emp_utm48n_count','emp_utm48n_mean');
function table(images) {
  return ee.FeatureCollection(images.toList(30).map(function(im) {
    return ee.Feature(null, ee.Image(im).toDictionary(fields));
  }));
}
var palette=['183d66','40a3a0','f2d48a','c35933'];
var all = ee.FeatureCollection([]);
var lastMap;
years.forEach(function(year) {
  var days = ee.ImageCollection.fromImages(ee.List.sequence(1,30).map(function(day){return daily(year,day);}));
  var rows = table(days);
  all = all.merge(rows);
  lastMap = days.mean().rename('aod_mean').addBands(days.count().rename('days')).clip(region);
  Map.addLayer(lastMap.select('aod_mean'),{min:0,max:0.35,palette:palette},year+' VI · AOD',year===2025);
  Export.table.toDrive({collection:rows,description:'UHG_June_'+year,fileFormat:'CSV',selectors:fields});
  Export.image.toDrive({image:lastMap.toFloat(),description:'UHG_AOD_'+year,region:region.bounds(),
    crs:'EPSG:32648',scale:1000,maxPixels:1000000});
  print(ui.Label('CSV · '+year,{},rows.getDownloadURL({format:'CSV',selectors:fields,filename:'UHG_June_'+year})));
});
var summary=ee.FeatureCollection(years.map(function(y) {
  var rows=all.filter(ee.Filter.eq('year',y)), pairs=rows.filter(ee.Filter.eq('paired',1));
  var mine=rows.filter(ee.Filter.gte('site_count',8));
  return ee.Feature(null,{year:String(y),site:mine.aggregate_mean('site_mean'),
    n_site:mine.size(),down:pairs.aggregate_mean('down_mean'),up:pairs.aggregate_mean('up_mean'),n_pair:pairs.size()});
}));
print(ui.Chart.feature.byFeature(summary,'year',['site','down','up']).setChartType('ColumnChart')
  .setOptions({title:'Зургадугаар сарын 550 нм AOD',vAxis:{title:'AOD'},series:{0:{color:'#33536f'},1:{color:'#a65027'},2:{color:'#228b88'}}}));
// Индексийг зураг тус бүрийн гадаргын ойлтоор тооцоод хугацааны медиан авна.
function indices(n,s,t) {
  function ratio(a,b,name,epsilon){return a.divide(b).updateMask(b.abs().gt(epsilon)).rename(name);}
  return ratio(s.subtract(n).add(t),s.add(n).subtract(t),'ECDI',0.01)
    .addBands(ratio(s.subtract(n),s.add(n),'NDCI',0.01))
    .addBands(ratio(t.subtract(s),n.multiply(n.add(s)),'BCI',0.0001))
    .updateMask(n.gt(0).and(s.gt(0)).and(t.gt(0)));
}
var interval=['2025-06-01','2025-07-01'];
var s2=ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(region)
  .filterDate(interval[0],interval[1]).map(function(im){
    var scl=im.select('SCL'), land=scl.eq(4).or(scl.eq(5));
    var r=im.updateMask(land).multiply(0.0001);
    return indices(r.select('B8A'),r.select('B11'),r.select('B12'))
      .addBands(r.select(['B4','B3','B2'],['red','green','blue']))
      .addBands(r.normalizedDifference(['B8A','B4']).rename('NDVI'));
  }).median().clip(region);
var l8=ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
  .filterDate(interval[0],interval[1]).filterBounds(region).map(function(im){
    var mask=im.select('QA_PIXEL').bitwiseAnd(191).eq(0).and(im.select('QA_RADSAT').eq(0));
    var r=im.select(['SR_B5','SR_B6','SR_B7']).multiply(0.0000275).subtract(0.2).updateMask(mask);
    return indices(r.select('SR_B5'),r.select('SR_B6'),r.select('SR_B7'));
  }).median().clip(region);
Map.addLayer(s2,{bands:['red','green','blue'],min:0,max:0.3},'Sentinel-2 · RGB',false);
Map.addLayer(s2.select('ECDI'),{min:0,max:1.5,palette:palette},'Sentinel-2 · ECDI',false);
Map.addLayer(l8.select('BCI'),{min:-2,max:2,palette:palette},'Landsat · BCI',false);
Map.addLayer(ee.FeatureCollection([ee.Feature(site)]).style({color:'ffffff',fillColor:'00000000',width:2}),{},'MV-011952');
Map.centerObject(region,11);
Export.image.toDrive({image:s2.toFloat(),description:'UHG_S2_202506',region:region.bounds(),crs:'EPSG:32648',scale:20});
Export.image.toDrive({image:l8.toFloat(),description:'UHG_L89_202506',region:region.bounds(),crs:'EPSG:32648',scale:30});
function download(image,name,scale,area) {
  image.toFloat().getDownloadURL({name:name,region:area,crs:'EPSG:32648',scale:scale,
    format:'ZIPPED_GEO_TIFF',filePerBand:false},function(url,error){
    if(error) print(name,error); else print(ui.Label(name+' · GeoTIFF',{},url));
  });
}
var eventMap = daily(2025,1).select('aod').clip(region);
Map.addLayer(eventMap,{min:0,max:0.35,palette:palette},'2025-06-01 · AOD',false);
download(eventMap,'UHG_AOD_20250601',1000,region.bounds());
download(lastMap,'UHG_AOD_202506',1000,region.bounds());
download(s2,'UHG_S2_202506',20,site.buffer(500,10).bounds());
download(l8,'UHG_L89_202506',30,site.buffer(500,10).bounds());
