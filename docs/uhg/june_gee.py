"""June AOD on both sides of the wind at Ukhaa Khudag, for any list of years.

Python port of docs/uhg/workflow.js (main branch): same point, MV-011952 boundary, MAIAC h25v04 QA
(AOD_QA & 4095 == 1), ERA5-Land 03-06 UTC vector mean, 90-degree sectors at 3-8 km, filters
wind >= 2 m/s, steadiness >= 0.8, >= 8 pixels per side. Besides the published per-day table it saves
the per-pixel daily AOD field inside 9.5 km on the native MAIAC grid, so that rotated sectors,
static-gradient controls and confounder masks can be computed offline from the same pixels.

usage: python june.py 2003 2004 ...   ->  out/june_<year>.csv, out/june_field_<year>.json
Runs from research/uhg on branch research/uhg-dust (common_uhg.py, Earth Engine service account).
"""
import csv
import json
import os
import sys

import ee

from common_uhg import OUT, init, retry

LON, LAT = 105.5181, 43.6678
SITE = [[105.542033, 43.655389], [105.447569, 43.655394], [105.447569, 43.690394],
        [105.542036, 43.690389], [105.542033, 43.655389]]
FIELDS = ['date', 'year', 'passes', 'hours', 'site_count', 'site_mean', 'down_count', 'down_mean',
          'up_count', 'up_mean', 'wind_ms', 'u_ms', 'v_ms', 'bearing_to', 'steadiness', 'soil_m3m3',
          'dust_aot', 'uvai', 'paired', 'difference']


def build():
    point = ee.Geometry.Point([LON, LAT])
    region = point.buffer(8000, 5)
    site = ee.Geometry.Polygon([SITE])
    modis = (ee.ImageCollection('MODIS/061/MCD19A2_GRANULES').filterBounds(point)
             .filter(ee.Filter.stringContains('system:index', '_h25v04_')))
    native = ee.Image(modis.filterDate('2025-06-01', '2025-06-02').first()).select('Optical_Depth_055').projection()
    era = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY').select(
        ['u_component_of_wind_10m', 'v_component_of_wind_10m', 'volumetric_soil_water_layer_1'], ['u', 'v', 'soil'])
    dust = ee.ImageCollection('NASA/GSFC/MERRA/aer/2').select('DUEXTTAU')
    ai = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_AER_AI').filterBounds(point).select('absorbing_aerosol_index')
    xy = ee.Image.pixelLonLat()
    east = xy.select('longitude').subtract(LON).multiply(111.32 * __import__('math').cos(LAT * 3.141592653589793 / 180))
    north = xy.select('latitude').subtract(LAT).multiply(111.13)
    radius = east.hypot(north)
    ring = radius.gte(3).And(radius.lte(8))
    limit = 0.7071067811865476
    empty = ee.Image.constant(0).rename('aod').toFloat().selfMask()

    def clean(img):
        qa = img.select('AOD_QA')
        raw = img.select('Optical_Depth_055')
        good = qa.bitwiseAnd(4095).eq(1).And(raw.gte(-100)).And(raw.lte(8000))
        return raw.updateMask(good).multiply(0.001).toFloat().rename('aod').copyProperties(img, ['system:time_start'])

    def daily(year, day):
        start = ee.Date.fromYMD(year, 6, day)
        end = start.advance(1, 'day')
        passes = modis.filterDate(start, end).map(clean)
        aod = ee.ImageCollection([empty]).merge(passes).mean().setDefaultProjection(native)
        first, last = start.advance(3, 'hour'), start.advance(7, 'hour')
        hours = era.filterDate(first, last).map(lambda im: im.addBands(im.select('u').hypot(im.select('v')).rename('speed')))
        weather = hours.mean().reduceRegion(reducer=ee.Reducer.first(), geometry=point,
                                            crs=ee.Image(era.first()).projection())
        u, v = weather.getNumber('u'), weather.getNumber('v')
        speed = u.hypot(v)
        persistence = speed.divide(weather.getNumber('speed').max(0.0001))
        cosine = east.multiply(u).add(north.multiply(v)).divide(radius.multiply(speed).max(0.000001))
        down = ring.And(cosine.gte(limit))
        up = ring.And(cosine.lte(-limit))
        bands = (aod.clip(site).rename('site').addBands(aod.updateMask(down).rename('down'))
                 .addBands(aod.updateMask(up).rename('up')))
        stats = bands.reduceRegion(reducer=ee.Reducer.mean().unweighted().combine(
            reducer2=ee.Reducer.count(), sharedInputs=True), geometry=region, crs=native, maxPixels=100000)
        m = dust.filterDate(first, last).mean().reduceRegion(
            reducer=ee.Reducer.first(), geometry=point, crs=ee.Image(dust.first()).projection()).get('DUEXTTAU')
        uv = (ee.ImageCollection([empty.rename('absorbing_aerosol_index')]).merge(ai.filterDate(start, end)).mean()
              .reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=5000).get('absorbing_aerosol_index'))
        ok = (speed.gte(2).And(persistence.gte(0.8)).And(hours.size().eq(4))
              .And(stats.getNumber('down_count').gte(8)).And(stats.getNumber('up_count').gte(8)))
        return aod.set(stats).set({
            'date': start.format('YYYY-MM-dd'), 'year': year, 'wind_ms': speed, 'u_ms': u, 'v_ms': v,
            'bearing_to': v.atan2(u).multiply(180 / 3.141592653589793).add(360).mod(360),
            'steadiness': persistence, 'soil_m3m3': weather.get('soil'), 'dust_aot': m, 'uvai': uv,
            'passes': passes.size(), 'hours': hours.size(), 'paired': ok,
            'difference': ee.Algorithms.If(ok, ee.Number(stats.get('down_mean')).subtract(stats.get('up_mean')), None),
            'system:time_start': start.millis()})

    return point, native, daily


def run(year):
    point, native, daily = build()
    days = [daily(year, d) for d in range(1, 31)]
    col = ee.ImageCollection.fromImages(days)
    table = ee.FeatureCollection(col.toList(30).map(lambda im: ee.Feature(None, ee.Image(im).toDictionary(FIELDS))))
    rows = retry(lambda: table.getInfo())['features']
    with open(os.path.join(OUT, f'june_{year}.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r['properties'].get(k) for k in FIELDS})
    # Per-pixel field on the native MAIAC grid (pixel centres inside 9.5 km), -9 = no valid retrieval.
    stack = ee.Image.cat([ee.Image(im).select('aod').unmask(-9).rename(f'd{k + 1:02d}') for k, im in enumerate(days)])
    stack = stack.addBands(ee.Image.pixelLonLat()).setDefaultProjection(native)
    lists = retry(lambda: stack.reduceRegion(reducer=ee.Reducer.toList(), geometry=point.buffer(9500, 5),
                                             crs=native, maxPixels=1000000).getInfo())
    with open(os.path.join(OUT, f'june_field_{year}.json'), 'w') as f:
        json.dump({'year': year, 'lon': lists['longitude'], 'lat': lists['latitude'],
                   'aod': [lists[f'd{k:02d}'] for k in range(1, 31)]}, f, separators=(',', ':'))
    n = sum(1 for r in rows if r['properties'].get('paired'))
    print(year, 'rows', len(rows), 'paired', n, 'pixels', len(lists['longitude']), flush=True)


if __name__ == '__main__':
    init()
    for y in sys.argv[1:]:
        run(int(y))
