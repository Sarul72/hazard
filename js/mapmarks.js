/* Marks that keep a readable size at every zoom: wind arrows and camps. They are drawn on a canvas the size of the screen, which is
 * redrawn after each move, so they stay sharp and do not stretch with the map. The same canvas goes into the downloaded image. */

const SCALE = 2; // canvas pixels per screen pixel, for a sharp downloaded image
const WHITE = "rgba(255, 255, 255, .95)";

/** Half width of a ger on screen, in pixels: it grows as the map comes closer, so a camp is easier to see, not harder. */
export const gerSize = (zoom) => Math.min(14, Math.max(3.2, 3.2 * 2 ** ((zoom - 8) / 2)));

/** Length of a wind arrow on screen, in pixels: the only thing that speaks of the speed. */
export const arrowLength = (speed) => 17 + Math.min(speed, 16) * 0.95;

/** An arrow of the wind, pointing where the air goes: a grey dart with a notched tail, one solid shape with no thin parts. A fine
 * light edge lets it read on dark ground and a soft shadow on snow. */
export function drawArrow(ctx, x, y, angleDeg, len, k = 1) {
  const half = len / 2, wing = Math.max(5.2 * k, len * 0.3), notch = len * 0.3;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(0, -half);
  ctx.lineTo(wing, half);
  ctx.lineTo(0, half - notch);
  ctx.lineTo(-wing, half);
  ctx.closePath();
  ctx.shadowColor = "rgba(0, 0, 0, .5)";
  ctx.shadowBlur = 3 * k;
  ctx.shadowOffsetY = k;
  ctx.fillStyle = "#59626b";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(240, 243, 246, .92)";
  ctx.lineWidth = 1.1 * k;
  ctx.stroke();
  ctx.restore();
}

/** A ger seen from the side: round walls under a low dome, with a door. `s` is half its width. */
function drawGer(ctx, x, y, s, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x - s, y + 0.72 * s);
  ctx.lineTo(x - s, y + 0.08 * s);
  ctx.quadraticCurveTo(x - 0.42 * s, y - 0.62 * s, x, y - 0.92 * s);
  ctx.quadraticCurveTo(x + 0.42 * s, y - 0.62 * s, x + s, y + 0.08 * s);
  ctx.lineTo(x + s, y + 0.72 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(24, 26, 28, .8)";
  ctx.fillRect(x - 0.22 * s, y + 0.06 * s, 0.44 * s, 0.66 * s);
}

/** Draw every k-th of n dots of radius r, so that they cover at most a sixth of the ground they spread over. */
export const thinning = (n, covered, r) => Math.max(1, Math.ceil((n * Math.PI * r * r) / (covered / 6)));

/** Camps on the view. Gers while they can be told apart; where they crowd, fine dots, so that a large area stays a light speckle. */
export function paintCamps(ctx, view, points, tint = () => WHITE) {
  const { box, w, h, zoom } = view, shown = points.filter((p) => p.lat >= box.s && p.lat <= box.n && p.lon >= box.w && p.lon <= box.e);
  // Crowding is judged on the ground the camps cover, not on the whole screen: a far view of one cluster must not become a blot.
  const at = shown.map((p) => view.project(p.lat, p.lon)), xs = at.map((p) => p[0]), ys = at.map((p) => p[1]);
  const covered = at.length ? Math.max(Math.max(...xs) - Math.min(...xs), 40) * Math.max(Math.max(...ys) - Math.min(...ys), 40) : w * h;
  const n = Math.max(shown.length, 1), s = gerSize(zoom), gers = n * (2.4 * s) ** 2 <= 0.75 * covered;
  const r = Math.min(1.1, Math.max(0.55, Math.sqrt((0.3 * covered) / (n * Math.PI))));
  // From far away only every k-th dot is drawn, or thousands of them would merge into a white patch. The counts always use them all.
  const every = gers ? 1 : thinning(n, covered, r);
  ctx.strokeStyle = "rgba(0, 0, 0, .65)";
  ctx.lineWidth = gers ? Math.max(0.5, s * 0.1) : 0.3;
  shown.forEach((p, i) => {
    if (i % every) return;
    const [x, y] = at[i];
    if (gers) { drawGer(ctx, x, y, s, tint(p)); return; }
    ctx.fillStyle = tint(p);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
    if (r > 0.6) ctx.stroke();
  });
}

/** A canvas over the map that `paint(ctx, view)` fills after every move. Its `canvas` and `box` can go straight into an image. */
export function createViewCanvas(map, name, zIndex, paint) {
  const L = window.L, pane = map.createPane(name), canvas = document.createElement("canvas");
  pane.style.zIndex = zIndex;
  pane.style.pointerEvents = "none";
  canvas.style.position = "absolute";
  pane.append(canvas);
  let on = false, box = null;

  function view() {
    const b = map.getBounds(), size = map.getSize(), zoom = map.getZoom();
    box = { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() };
    return {
      box, zoom, w: size.x, h: size.y,
      project: (lat, lon) => { const p = map.latLngToContainerPoint([lat, lon]); return [p.x, p.y]; },
      /** Points every `step` screen pixels, fixed to the ground, so that they do not slide when the map moves. */
      lattice(step) {
        const o = map.getPixelBounds(), out = [];
        for (let y = Math.ceil(o.min.y / step) * step; y < o.max.y; y += step) for (let x = Math.ceil(o.min.x / step) * step; x < o.max.x; x += step) {
          const g = map.unproject([x, y], zoom);
          out.push({ lat: g.lat, lon: g.lng, x: x - o.min.x, y: y - o.min.y });
        }
        return out;
      },
    };
  }

  function redraw() {
    if (!on) return;
    const v = view();
    canvas.width = v.w * SCALE;
    canvas.height = v.h * SCALE;
    canvas.style.width = `${v.w}px`;
    canvas.style.height = `${v.h}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    paint(ctx, v);
    canvas.style.visibility = "visible";
  }

  map.on("moveend zoomend resize", redraw);
  map.on("zoomstart", () => { canvas.style.visibility = "hidden"; }); // the map scales during a zoom and this canvas does not
  return {
    canvas, redraw, view,
    get box() { return box; },
    get on() { return on; },
    show(want) { on = want; canvas.style.display = want ? "" : "none"; redraw(); },
  };
}
