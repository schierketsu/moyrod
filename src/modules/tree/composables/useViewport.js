import { computed, onBeforeUnmount, onMounted, ref } from "vue";

export function useViewport(store) {
  const viewportRef = ref(null);
  const panState = ref(null);
  const smoothCam = ref({ x: store.camX, y: store.camY });
  const targetCam = ref({ x: store.camX, y: store.camY });
  let panRaf = 0;
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2.5;
  const PAN_EASING = 0.26;
  const PAN_STOP_EPS = 0.08;

  function clampCamera(camX, camY, zoom = store.zoom) {
    const viewport = viewportRef.value;
    const vw = viewport?.clientWidth || 1;
    const vh = viewport?.clientHeight || 1;
    const halfW = vw / (2 * zoom);
    const halfH = vh / (2 * zoom);

    let minX = halfW;
    let maxX = store.fieldW - halfW;
    let minY = halfH;
    let maxY = store.fieldH - halfH;

    if (minX > maxX) minX = maxX = store.fieldW / 2;
    if (minY > maxY) minY = maxY = store.fieldH / 2;

    return {
      x: Math.max(minX, Math.min(maxX, camX)),
      y: Math.max(minY, Math.min(maxY, camY)),
    };
  }

  function runPanFrame() {
    const dx = targetCam.value.x - smoothCam.value.x;
    const dy = targetCam.value.y - smoothCam.value.y;
    smoothCam.value.x += dx * PAN_EASING;
    smoothCam.value.y += dy * PAN_EASING;
    const clamped = clampCamera(smoothCam.value.x, smoothCam.value.y, store.zoom);
    smoothCam.value.x = clamped.x;
    smoothCam.value.y = clamped.y;
    store.setViewport(clamped.x, clamped.y, store.zoom, false);
    if (Math.abs(dx) < PAN_STOP_EPS && Math.abs(dy) < PAN_STOP_EPS) {
      smoothCam.value.x = targetCam.value.x;
      smoothCam.value.y = targetCam.value.y;
      const finalClamped = clampCamera(smoothCam.value.x, smoothCam.value.y, store.zoom);
      smoothCam.value.x = finalClamped.x;
      smoothCam.value.y = finalClamped.y;
      store.setViewport(finalClamped.x, finalClamped.y, store.zoom, false);
      panRaf = 0;
      return;
    }
    panRaf = requestAnimationFrame(runPanFrame);
  }

  function ensurePanRaf() {
    if (panRaf) return;
    panRaf = requestAnimationFrame(runPanFrame);
  }

  function getTransformOffsets() {
    const viewport = viewportRef.value;
    const vw = viewport?.clientWidth || 1;
    const vh = viewport?.clientHeight || 1;
    return {
      vw,
      vh,
      tx: vw / 2 - store.camX * store.zoom,
      ty: vh / 2 - store.camY * store.zoom,
    };
  }

  const worldStyle = computed(() => {
    const { tx, ty } = getTransformOffsets();
    return {
      transform: `translate(${tx}px, ${ty}px) scale(${store.zoom})`,
    };
  });

  function fieldCoordsFromClient(clientX, clientY) {
    const viewport = viewportRef.value;
    if (!viewport) return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const { tx, ty } = getTransformOffsets();
    return { x: (mx - tx) / store.zoom, y: (my - ty) / store.zoom };
  }

  function zoomBy(factor) {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, store.zoom * factor));
    const clamped = clampCamera(store.camX, store.camY, next);
    store.setViewport(clamped.x, clamped.y, next);
  }

  function onWheel(ev) {
    ev.preventDefault();
    const viewport = viewportRef.value;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const { vw, vh } = getTransformOffsets();
    const wx = store.camX + (mx - vw / 2) / store.zoom;
    const wy = store.camY + (my - vh / 2) / store.zoom;
    const factor = ev.deltaY < 0 ? 1.09 : 1 / 1.09;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, store.zoom * factor));
    const camX = wx - (mx - vw / 2) / next;
    const camY = wy - (my - vh / 2) / next;
    const clamped = clampCamera(camX, camY, next);
    store.setViewport(clamped.x, clamped.y, next);
  }

  function onPointerDown(ev) {
    if (ev.target.closest(".family-card") || ev.target.closest(".map-zoom-tools")) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ev.preventDefault();
    if (typeof ev.currentTarget?.setPointerCapture === "function") {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    }
    smoothCam.value = { x: store.camX, y: store.camY };
    targetCam.value = { x: store.camX, y: store.camY };
    panState.value = { id: ev.pointerId, lx: ev.clientX, ly: ev.clientY, moved: false };
  }

  function onPointerMove(ev) {
    if (!panState.value || panState.value.id !== ev.pointerId) return;
    ev.preventDefault();
    const dx = ev.clientX - panState.value.lx;
    const dy = ev.clientY - panState.value.ly;
    panState.value.lx = ev.clientX;
    panState.value.ly = ev.clientY;
    if (dx !== 0 || dy !== 0) panState.value.moved = true;
    // Smooth pan: pointer updates target camera, RAF eases toward it.
    const nextTarget = {
      x: targetCam.value.x - dx / store.zoom,
      y: targetCam.value.y - dy / store.zoom,
    };
    targetCam.value = clampCamera(nextTarget.x, nextTarget.y, store.zoom);
    ensurePanRaf();
  }

  function onPointerUp(ev) {
    if (!panState.value || panState.value.id !== ev.pointerId) return;
    if (typeof ev.currentTarget?.releasePointerCapture === "function") {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
    panState.value = null;
  }

  function updateFieldByViewport() {
    const viewport = viewportRef.value;
    if (!viewport) return;
    // Keep a larger world to avoid hitting inactive gray area near edges.
    const w = Math.max(320, viewport.clientWidth) * 8;
    const h = Math.max(240, viewport.clientHeight) * 8;
    store.resizeFieldWithRescale(w, h);
    const clamped = clampCamera(store.camX, store.camY, store.zoom);
    store.setViewport(clamped.x, clamped.y, store.zoom, false);
  }

  let ro;
  onMounted(() => {
    updateFieldByViewport();
    ro = new ResizeObserver(updateFieldByViewport);
    if (viewportRef.value) ro.observe(viewportRef.value);
  });
  onBeforeUnmount(() => ro?.disconnect());
  onBeforeUnmount(() => {
    if (panRaf) cancelAnimationFrame(panRaf);
  });

  return {
    viewportRef,
    worldStyle,
    fieldCoordsFromClient,
    zoomBy,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}

