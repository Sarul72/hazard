/* Builds data/settlements.json (gers, houses, huts, livestock yards, winter and spring camps, settlements) and
 * data/water.json (OpenStreetMap water polygons) around every mine in js/config.js, from OpenStreetMap via the
 * Overpass API. Runs on GitHub Actions (the browser cannot rely on the public Overpass servers: they are
 * often at capacity). Data (c) OpenStreetMap contributors, ODbL. Remote Gobi is sparsely mapped, so counts are a lower bound. */
import { writeFile, mkdir } from "node:fs/promises";
import { MINES } from "../js/config.js";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const HALF_LAT = 0.55, HALF_LON = 0.75; // about 60 km: bigger boxes time out on the public Overpass servers

const HOUSE = /^(house|residential|detached|semidetached_house|bungalow|apartments|dormitory|farm)$/;
const HUT = /^(hut|cabin|tent|shed)$/;
const PLACE = /^(isolated_dwelling|hamlet|village|town|locality)$/;

/** Map OSM tags to one of: ger, house, hut, farmyard, place, winter, spring; or null to skip. */
export function classify(tags = {}) {
  const name = `${tags.name || ""} ${tags["name:mn"] || ""}`;
  if (/өвөлжө/i.test(name)) return "winter";
  if (/хаваржаа/i.test(name)) return "spring";
  if (tags.building === "ger" || tags.building === "yurt") return "ger";
  if (HOUSE.test(tags.building || "")) return "house";
  if (HUT.test(tags.building || "")) return "hut";
  if (tags.landuse === "farmyard") return "farmyard";
  if (PLACE.test(tags.place || "")) return "place";
  return null;
}

export function homesQuery(b) {
  const bb = `(${b.s},${b.w},${b.n},${b.e})`;
  return `[out:json][timeout:90];(
    nwr["building"~"^(ger|yurt|house|residential|detached|semidetached_house|bungalow|apartments|dormitory|farm|hut|cabin|tent|shed)$"]${bb};
    nwr["landuse"="farmyard"]${bb};
    nwr["place"~"^(isolated_dwelling|hamlet|village|town|locality)$"]${bb};
  );out center tags 20000;`;
}
export function waterQuery(b) {
  return `[out:json][timeout:90];way["natural"="water"](${b.s},${b.w},${b.n},${b.e});out geom tags 1500;`;
}

async function overpass(query) {
  let last;
  for (let round = 0; round < 3; round++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query), signal: AbortSignal.timeout(100000) });
        if (res.ok) return await res.json();
        last = new Error(`${url}: HTTP ${res.status}`);
      } catch (e) { last = new Error(`${url}: ${e.message}`); }
    }
    await new Promise((r) => setTimeout(r, 20000 * (round + 1)));
  }
  throw last;
}

const round4 = (x) => Math.round(x * 1e4) / 1e4;
function thin(pts, max = 40) { const k = Math.ceil(pts.length / max); return pts.filter((_, i) => i % k === 0 || i === pts.length - 1); }

async function main() {
  const homes = new Map(), water = new Map();
  for (const m of MINES) {
    const b = { s: m.lat - HALF_LAT, n: m.lat + HALF_LAT, w: m.lon - HALF_LON, e: m.lon + HALF_LON };
    console.log("mine", m.id);
    try {
      const j = await overpass(homesQuery(b));
      for (const e of j.elements) {
        const type = classify(e.tags); if (!type) continue;
        const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon; if (lat == null || lon == null) continue;
        homes.set(`${e.type}${e.id}`, { lat: round4(lat), lon: round4(lon), type, name: e.tags.name || "" });
      }
    } catch (err) { console.warn("::warning::homes failed for", m.id, err.message); }
    try {
      const j = await overpass(waterQuery(b));
      for (const e of j.elements) if (e.geometry && e.geometry.length >= 4) water.set(e.id, thin(e.geometry.map((g) => [round4(g.lat), round4(g.lon)])));
    } catch (err) { console.warn("::warning::water failed for", m.id, err.message); }
  }
  if (!homes.size && !water.size) throw new Error("Overpass returned nothing; keeping the previous files");
  await mkdir("data", { recursive: true });
  const stamp = new Date().toISOString();
  await writeFile("data/settlements.json", JSON.stringify({ generated_at: stamp, source: "OpenStreetMap contributors (ODbL)", items: [...homes.values()] }));
  await writeFile("data/water.json", JSON.stringify({ generated_at: stamp, source: "OpenStreetMap contributors (ODbL)", items: [...water.values()] }));
  console.log("settlements", homes.size, "water", water.size);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
