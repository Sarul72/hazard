import test from "node:test";
import assert from "node:assert/strict";
import { classify, homesQuery } from "../scripts/build-settlements.mjs";

test("classify OSM tags", () => {
  assert.equal(classify({ building: "ger" }), "ger");
  assert.equal(classify({ building: "yurt" }), "ger");
  assert.equal(classify({ building: "house" }), "house");
  assert.equal(classify({ building: "hut" }), "hut");
  assert.equal(classify({ landuse: "farmyard" }), "farmyard");
  assert.equal(classify({ place: "hamlet" }), "place");
  assert.equal(classify({ building: "yes" }), null, "plain building=yes is mostly industrial at mines: skipped");
  assert.equal(classify({ building: "yes", name: "Дорж өвөлжөө" }), "winter");
  assert.equal(classify({ landuse: "farmyard", name: "Хаваржаа" }), "spring");
});
test("homesQuery is a well-formed bbox query", () => {
  const q = homesQuery({ s: 1, w: 2, n: 3, e: 4 });
  assert.ok(q.includes("(1,2,3,4)") && q.startsWith("[out:json]"));
  assert.ok(!q.includes("өвөлжө"), "no slow name-regex scan");
});
