/* Dust settling in js/plume.js against values worked out separately (tests/dust_reference.json), and the exports in js/export.js.
 * check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import * as P from "../js/plume.js";
import { MATERIALS } from "../js/materials.js";

export function check(ref) {
  const out = [];
  const near = (name, got, want, tol) => out.push({ name, got, want, ok: typeof got === "number" && Math.abs(got - want) <= tol });
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });

  for (const [d, rho, v] of ref.settling) near(`vg d=${d} rho=${rho}`, P.settlingVelocity(d, rho), v, v * 1e-6);
  for (const [x, s] of ref.sigma_z) near(`sigma_z ${x} m`, P.sigmaZ(x), s, 1e-6);
  for (const [rho, x, u, share] of ref.airborne) near(`airborne rho=${rho} x=${x}`, P.airborneShare(rho, x, u), share, 2e-3);

  near("size bins add to one", P.SIZE_BINS.reduce((a, b) => a + b.f, 0), 1, 1e-12);

  const sorted = [...MATERIALS].sort((a, b) => a.rho - b.rho);
  const left = sorted.map((m) => P.airborneShare(m.rho, 50000, 6));
  yes("denser dust leaves the air sooner", left.every((v, i) => i === 0 || v <= left[i - 1]));
  yes("stronger wind carries dust further", P.airborneShare(2.65, 50000, 12) > P.airborneShare(2.65, 50000, 4));
  yes("nothing is lost at the source", Math.abs(P.airborneShare(2.65, 1, 6) - 1) < 1e-3);
  const half = P.halfDepositionKm(2.65, 6);
  near("half distance is where half has settled", P.airborneShare(2.65, half * 1000, 6), 0.5, 1e-3);

  // With no wind change, a dense mineral must end up lighter in the air than a light one, puff for puff.
  const grid = { lats: [47, 48], lons: [105, 106], ny: 2, nx: 2 };
  const time = Array.from({ length: 12 }, (_, i) => `2026-01-01T${String(i).padStart(2, "0")}:00`);
  const node = { time, wind_speed_10m: time.map(() => 6), wind_direction_10m: time.map(() => 270) };
  const field = P.buildField(grid, [node, node, node, node]);
  const run = (rho) => P.simulate({ source: { lat: 47.5, lon: 105.2 }, field, rho }).snaps[10];
  const a = run(1.32), b = run(7.5), mass = (s, k) => s[k].reduce((x, y) => x + y, 0);
  yes("emitted mass does not depend on the material", Math.abs(mass(a, "q0") - mass(b, "q0")) < 1e-6 * mass(a, "q0"));
  yes("lead ore keeps less in the air than coal", mass(b, "q") < mass(a, "q"));
  yes("settling never adds mass", mass(a, "q") <= mass(a, "q0"));
  yes("old behaviour stays without a density", P.simulate({ source: { lat: 47.5, lon: 105.2 }, field }).snaps[10].n > 0);
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  const { readFileSync } = await import("node:fs");
  const ref = JSON.parse(readFileSync(new URL("./dust_reference.json", import.meta.url), "utf8"));
  test("dust settling matches the separate calculation", () => assert.deepEqual(check(ref).filter((r) => !r.ok), []));
}
