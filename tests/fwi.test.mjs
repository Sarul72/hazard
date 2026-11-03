import test from "node:test";
import assert from "node:assert/strict";
import { step, run, FWI_START, fwi } from "../js/fwi.js";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b} +-${tol}`);

// Day 1 of the cffdrs R package test data: April, T 17, RH 42, W 25, rain 0, start 85/6/15.
// Reference values (cffdrs documentation): FFMC 87.692, DMC 8.545, DC 19.013, ISI 10.853, BUI 8.49, FWI 10.096.
test("FWI matches the published first-day reference values", () => {
  const s = step({ ...FWI_START }, { T: 17, RH: 42, W: 25, r0: 0 }, 4);
  close(s.ffmc, 87.692, 0.01, "FFMC");
  close(s.dmc, 8.545, 0.01, "DMC");
  close(s.dc, 19.013, 0.01, "DC");
  close(s.isi, 10.853, 0.01, "ISI");
  close(s.bui, 8.490, 0.01, "BUI");
  close(s.fwi, 10.096, 0.01, "FWI");
});

test("rain lowers all moisture codes", () => {
  const dry = step({ ffmc: 90, dmc: 40, dc: 200 }, { T: 20, RH: 30, W: 15, r0: 0 }, 6);
  const wet = step({ ffmc: 90, dmc: 40, dc: 200 }, { T: 20, RH: 30, W: 15, r0: 20 }, 6);
  assert.ok(wet.ffmc < dry.ffmc && wet.dmc < dry.dmc && wet.dc < dry.dc && wet.fwi < dry.fwi);
});

test("outputs stay finite and bounded for extreme but valid inputs", () => {
  const cases = [
    { T: -40, RH: 100, W: 0, r0: 0 }, { T: 45, RH: 1, W: 120, r0: 0 },
    { T: 10, RH: 100, W: 200, r0: 300 }, { T: 0, RH: 0, W: 0, r0: 0 },
  ];
  for (const c of cases) {
    for (const start of [FWI_START, { ffmc: 0, dmc: 0, dc: 0 }, { ffmc: 99, dmc: 500, dc: 1000 }]) {
      const s = step(start, c, 7);
      for (const k of ["ffmc", "dmc", "dc", "isi", "bui", "fwi"]) {
        assert.ok(Number.isFinite(s[k]) && s[k] >= 0, `${k} not finite/non-negative for ${JSON.stringify(c)}: ${s[k]}`);
      }
      assert.ok(s.ffmc <= 101);
    }
  }
});

test("FWI is monotone in ISI and BUI", () => {
  assert.ok(fwi(10, 50) > fwi(5, 50));
  assert.ok(fwi(10, 80) > fwi(10, 40));
});

test("a missing day keeps previous codes and reports null", () => {
  const out = run([
    { T: 17, RH: 42, W: 25, r0: 0, month: 4 },
    { T: NaN, RH: 42, W: 25, r0: 0, month: 4 },
    { T: 17, RH: 42, W: 25, r0: 0, month: 4 },
  ]);
  assert.equal(out[1].fwi, null);
  assert.equal(out[1].ffmc, out[0].ffmc);
  assert.ok(out[2].ffmc > out[0].ffmc);
});
