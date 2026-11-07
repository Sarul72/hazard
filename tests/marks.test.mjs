/* The sizes of the map marks. check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { arrowLength, gerSize, thinning } from "../js/mapmarks.js";

export function check() {
  const out = [];
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });
  const zooms = [4, 6, 8, 9, 10, 11, 12, 13];
  yes("a ger never shrinks as the map comes closer", zooms.every((z, i) => !i || gerSize(z) >= gerSize(zooms[i - 1])));
  yes("a ger is clearly larger when close", gerSize(11) >= 2 * gerSize(8));
  yes("a ger stays small from afar", gerSize(5) <= 4);
  yes("a ger has a limit", gerSize(20) <= 14);
  yes("a faster wind gives a longer arrow", arrowLength(10) > arrowLength(2));
  yes("the weakest arrow can still be read", arrowLength(0) >= 20);
  yes("the strongest arrow stays compact", arrowLength(40) <= 42);
  yes("a sparse area keeps every dot", thinning(100, 100000, 1) === 1);
  yes("a crowded area is thinned to a speckle", thinning(20000, 12000, 0.55) >= 8);
  yes("thinned dots cover at most a sixth", (20000 / thinning(20000, 12000, 0.55)) * Math.PI * 0.55 ** 2 <= 12000 / 6);
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("map marks", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
