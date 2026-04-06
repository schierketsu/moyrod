import { computed, onBeforeUnmount, onMounted, ref } from "vue";

export function useViewport(store) {
  const viewportRef = ref(null);
  const panState = ref(null);
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2.5;

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
    store.setViewport(store.camX, store.camY, next);
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
    store.setViewport(camX, camY, next);
  }

  function onPointerDown(ev) {
    if (ev.target.closest(".family-card") || ev.target.closest(".map-zoom-tools")) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    panState.value = { id: ev.pointerId, lx: ev.clientX, ly: ev.clientY };
  }

  function onPointerMove(ev) {
    if (!panState.value || panState.value.id !== ev.pointerId) return;
    const dx = ev.clientX - panState.value.lx;
    const dy = ev.clientY - panState.value.ly;
    panState.value.lx = ev.clientX;
    panState.value.ly = ev.clientY;
    store.setViewport(store.camX - dx / store.zoom, store.camY - dy / store.zoom, store.zoom);
  }

  function onPointerUp(ev) {
    if (!panState.value || panState.value.id !== ev.pointerId) return;
    panState.value = null;
  }

  function updateFieldByViewport() {
    const viewport = viewportRef.value;
    if (!viewport) return;
    const w = Math.max(320, viewport.clientWidth) * 2.4;
    const h = Math.max(240, viewport.clientHeight) * 2.4;
    store.resizeFieldWithRescale(w, h);
  }

  let ro;
  onMounted(() => {
    updateFieldByViewport();
    ro = new ResizeObserver(updateFieldByViewport);
    if (viewportRef.value) ro.observe(viewportRef.value);
  });
  onBeforeUnmount(() => ro?.disconnect());

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

