/* The colours of the hazards. check() is plain JavaScript so it also runs in a browser where Node is not installed. */
import { CLASSES, PALETTES, classesFor, luminance } from "../js/config.js";
import { rampLut } from "../js/riskmap.js";

const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

export function check() {
  const out = [];
  const yes = (name, cond) => out.push({ name, got: cond, want: true, ok: cond === true });

  for (const [hazard, colors] of Object.entries(PALETTES)) {
    yes(`${hazard} has one colour per class`, colors.length === CLASSES.length);
    yes(`${hazard} goes from light to dark`, colors.every((c, i) => !i || luminance(c) < luminance(colors[i - 1])));
    yes(`${hazard} steps can be told apart`, colors.every((c, i) => !i || contrast(c, colors[i - 1]) >= 1.3));
    for (const k of classesFor(hazard)) yes(`${hazard} ${k.key} label is readable`, contrast(k.color, k.ink) >= 4.5);
    const lut = rampLut(colors), at = (score) => [...lut.slice(Math.round(score / 0.4) * 4, Math.round(score / 0.4) * 4 + 4)];
    const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    yes(`${hazard} ramp sits on the class colour at its centre`, CLASSES.every((k, i) => at(k.min + 10).slice(0, 3).every((v, j) => Math.abs(v - hex(colors[i])[j]) <= 1)));
    yes(`${hazard} ramp blends between classes`, at(40).slice(0, 3).every((v, j) => Math.abs(v - (hex(colors[1])[j] + hex(colors[2])[j]) / 2) <= 1));
    const alpha = Array.from({ length: 251 }, (_, v) => lut[v * 4 + 3]);
    yes(`${hazard} opacity grows with the score`, alpha.every((a, i) => !i || a >= alpha[i - 1]));
    yes(`${hazard} low scores stay light`, alpha[0] < 100 && alpha[250] > 210);
    yes(`${hazard} a class holds one colour away from its limits`, [at(23), at(30), at(37)].every((c) => c.slice(0, 3).every((v, j) => v === hex(colors[1])[j])));
    yes(`${hazard} classes differ clearly in opacity too`, at(90)[3] - at(10)[3] > 120);
  }
  yes("the classes keep their limits in every colour", Object.keys(PALETTES).every((h) => classesFor(h).every((k, i) => k.min === CLASSES[i].min && k.max === CLASSES[i].max)));
  yes("the opening screen falls back to the combined colours", classesFor(null)[0].color === PALETTES.all[0]);
  yes("the hazards differ", new Set(Object.values(PALETTES).map((p) => p[3])).size === 4);
  return out;
}

if (typeof process !== "undefined" && process.versions?.node) {
  const { default: test } = await import("node:test");
  const { default: assert } = await import("node:assert/strict");
  test("hazard colours", () => assert.deepEqual(check().filter((r) => !r.ok), []));
}
