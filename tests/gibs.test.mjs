/* Which satellite serves a layer on a day. check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { GIBS } from "../js/config.js";
import { firstDate, tileTemplate, versionAt } from "../js/gibs.js";

const layer = (key) => GIBS.layers.find((l) => l.key === key);

export function check() {
  const out = [];
  const same = (name, got, want) => out.push({ name, got, want, ok: got === want });
  const id = (key, date) => versionAt(layer(key), date)?.id ?? null;

  same("viirs today is NOAA-21", id("truecolor_viirs", "2026-11-07"), "VIIRS_NOAA21_CorrectedReflectance_TrueColor");
  same("viirs on the first NOAA-21 day", id("truecolor_viirs", "2024-02-29"), "VIIRS_NOAA21_CorrectedReflectance_TrueColor");
  same("viirs the day before is NOAA-20", id("truecolor_viirs", "2024-02-28"), "VIIRS_NOAA20_CorrectedReflectance_TrueColor");
  same("viirs on the first NOAA-20 day", id("truecolor_viirs", "2022-01-14"), "VIIRS_NOAA20_CorrectedReflectance_TrueColor");
  same("viirs the day before is Suomi NPP", id("truecolor_viirs", "2022-01-13"), "VIIRS_SNPP_CorrectedReflectance_TrueColor");
  same("viirs before its record", id("truecolor_viirs", "2015-11-23"), null);
  same("fire today is NOAA-21", id("fire_viirs", "2026-11-07"), "VIIRS_NOAA21_Thermal_Anomalies_375m_All");
  same("fire in 2021 is NOAA-20", id("fire_viirs", "2021-06-01"), "VIIRS_NOAA20_Thermal_Anomalies_375m_All");
  same("fire in 2015 is Suomi NPP", id("fire_viirs", "2015-06-01"), "VIIRS_SNPP_Thermal_Anomalies_375m_All");
  same("aqua before launch", id("truecolor_aqua", "2002-07-02"), null);
  same("aqua on its first day", id("truecolor_aqua", "2002-07-03"), "MODIS_Aqua_CorrectedReflectance_TrueColor");
  same("terra needs no dates", id("truecolor_terra", "2000-02-24"), "MODIS_Terra_CorrectedReflectance_TrueColor");

  same("the sensor follows the day", versionAt(layer("truecolor_viirs"), "2018-01-01").sensor, "VIIRS Suomi NPP");
  same("the resolution stays with the layer", versionAt(layer("truecolor_viirs"), "2026-11-07").res, "250 m");
  same("first day of a chain", firstDate(layer("truecolor_viirs")), "2015-11-24");
  same("first day of a single layer", firstDate(layer("truecolor_aqua")), "2002-07-03");
  same("tile address uses the satellite of the day", tileTemplate(layer("truecolor_viirs"), "2026-11-07"), `${GIBS.base}/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/2026-11-07/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`);
  same("a resolved layer gives the same address", tileTemplate(versionAt(layer("truecolor_viirs"), "2019-05-05"), "2019-05-05"), tileTemplate(layer("truecolor_viirs"), "2019-05-05"));
  for (const l of GIBS.layers.filter((x) => x.versions)) {
    same(`${l.key} lists newest first`, l.versions.every((v, i) => !i || v.from < l.versions[i - 1].from), true);
    same(`${l.key} names every satellite`, l.versions.every((v) => v.id && v.sensor), true);
  }
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("layers by date", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
