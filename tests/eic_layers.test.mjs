/* EIC's map layers shown in the mine-dust tool (js/eic_layers.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { EIC_MINE_LAYERS, eicWmsUrl } from "../js/eic_layers.js";

test("each EIC layer names its map file and WMS layers on eic.mn's map server", () => {
  assert.deepEqual(Object.keys(EIC_MINE_LAYERS), ["licences", "degraded", "waterzones"]);
  for (const [k, v] of Object.entries(EIC_MINE_LAYERS)) {
    assert.match(eicWmsUrl(k), /^https:\/\/eic\.mn\/cgi-bin\/mapserver\?map=\/var\/www\/html\/[a-z/]+\.map$/, k);
    assert.ok(v.layers.split(",").every((n) => /^[a-z_0-9]+$/.test(n)), k);
    assert.ok(v.opacity > 0 && v.opacity <= 1, k);
  }
  assert.equal(EIC_MINE_LAYERS.licences.layers, "miningdb_miningcadasre", "valid licences only");
  assert.throws(() => eicWmsUrl("nope"), /no EIC layer/);
});
