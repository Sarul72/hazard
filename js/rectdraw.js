/* Rectangle selection. With a mouse, holding the left button and dragging draws the box straight away: there is no
 * tool to switch on. The right button moves the map and the wheel zooms. Touch screens start in move mode, because
 * one finger has to scroll the map; the draw button on the rail switches them over.
 * Esc cancels. A press without a real drag stays an ordinary click, so map clicks in other tools keep working. */

const MIN_DRAG_PX = 8;

export function initRectDraw(map, { onDone, onClear, isBlocked = () => false }) {
  const L = window.L, box = map.getContainer();
  const style = { color: "#ffffff", weight: 2, fillColor: "#ffffff", fillOpacity: 0.06, interactive: false };
  let mode = "draw", active = true, rect = null, drag = null, pan = null;

  const apply = () => {
    const draw = active && mode === "draw";
    if (draw) map.dragging.disable(); else map.dragging.enable();
    box.classList.toggle("is-draw", draw);
  };
  const setMode = (m) => { mode = m; apply(); };

  const latlng = (e) => {
    const r = box.getBoundingClientRect();
    return map.containerPointToLatLng([e.clientX - r.left, e.clientY - r.top]);
  };

  function cancel() {
    if (!drag) return;
    const had = drag.prev;
    if (rect) rect.remove();
    rect = had;
    if (rect) rect.addTo(map);
    drag = null;
  }

  box.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button === 2) {
      pan = { x: e.clientX, y: e.clientY };
      box.classList.add("is-pan");
      box.setPointerCapture(e.pointerId);
      return;
    }
    if (drag) { cancel(); return; } // a second finger means pinch, not a box
    if (!active || mode !== "draw" || e.button !== 0 || isBlocked()) return;
    if (e.target.closest?.(".leaflet-control")) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, a: latlng(e), moved: false, prev: rect };
  });

  box.addEventListener("pointermove", (e) => {
    if (pan) {
      map.panBy([pan.x - e.clientX, pan.y - e.clientY], { animate: false });
      pan = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < MIN_DRAG_PX) return;
      drag.moved = true;
      // Capture only now: capturing on press would send the click of a plain press to the container, not to a soum.
      box.setPointerCapture(e.pointerId);
      if (rect) rect.remove();
      rect = L.rectangle(L.latLngBounds(drag.a, drag.a), style).addTo(map);
    }
    rect.setBounds(L.latLngBounds(drag.a, latlng(e)));
  });

  const finish = (e) => {
    if (pan) { pan = null; box.classList.remove("is-pan"); return; }
    if (!drag || e.pointerId !== drag.id) return;
    const done = drag.moved;
    drag = null;
    if (done) {
      const b = rect.getBounds();
      onDone({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() });
    }
  };
  box.addEventListener("pointerup", finish);
  box.addEventListener("pointercancel", (e) => { pan = null; box.classList.remove("is-pan"); if (drag && e.pointerId === drag.id) cancel(); });
  box.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") cancel(); });

  map.boxZoom.disable();
  setMode(window.matchMedia("(pointer: coarse)").matches ? "move" : "draw");

  return {
    get mode() { return mode; },
    toggle() { setMode(mode === "draw" ? "move" : "draw"); return mode; },
    /** With nothing to compute there is nothing to select, and the left button moves the map as on any other map. */
    setActive(on) { active = on; apply(); },
    clear() { if (rect) rect.remove(); rect = null; drag = null; onClear?.(); },
    /** Draw a given box {s, n, w, e}, as if the user had drawn it (used by examples). */
    set(b) { if (rect) rect.remove(); drag = null; rect = L.rectangle(L.latLngBounds([b.s, b.w], [b.n, b.e]), style).addTo(map); onDone(b); },
  };
}
