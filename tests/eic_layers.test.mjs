/* EIC's map layers shown in the mine-dust tool (js/eic_layers.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { EIC_MINE_LAYERS, eicWmsUrl, giveUp } from "../js/eic_layers.js";

test("each EIC layer names its map file and WMS layers on eic.mn's map server", () => {
  assert.deepEqual(Object.keys(EIC_MINE_LAYERS), ["licences", "sources", "waterzones"]);
  for (const [k, v] of Object.entries(EIC_MINE_LAYERS)) {
    assert.match(eicWmsUrl(k), /^https:\/\/eic\.mn\/cgi-bin\/mapserver\?map=\/var\/www\/html\/[a-z/]+\.map$/, k);
    assert.ok(v.layers.split(",").every((n) => /^[a-z_0-9]+$/.test(n)), k);
    assert.ok(v.opacity > 0 && v.opacity <= 1, k);
  }
  assert.equal(EIC_MINE_LAYERS.licences.layers, "miningdb_miningcadasre", "valid licences only");
  assert.throws(() => eicWmsUrl("nope"), /no EIC layer/);
});

test("an EIC layer is given up only when a whole round of tiles failed, not on one slow tile", () => {
  assert.equal(giveUp({ loaded: 0, failed: 4 }), true, "nothing came: eic.mn is down");
  assert.equal(giveUp({ loaded: 29, failed: 1 }), false, "one tile timed out on the single CGI server");
  assert.equal(giveUp({ loaded: 0, failed: 0 }), false, "no tile asked for yet");
  assert.equal(giveUp({ loaded: 1, failed: 0 }), false);
});
