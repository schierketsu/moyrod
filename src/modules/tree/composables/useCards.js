import { computed, ref } from "vue";

export function useCards(store, viewport) {
  const drag = ref(null);
  let dragRaf = 0;
  const editingCard = computed(() => store.cards.find((c) => c.id === store.editingCardId) || null);
  const CARD_W = 232;
  const CARD_H = 204;
  const GAP = 14;

  function blurActiveIfInside(selector) {
    const active = document.activeElement;
    if (active && typeof active.closest === "function" && active.closest(selector)) {
      active.blur();
    }
  }

  function cardStyle(card) {
    return { left: `${card.x}px`, top: `${card.y}px` };
  }

  function clampToField(_card, nx, ny) {
    return {
      x: Math.max(0, Math.min(store.fieldW - CARD_W, nx)),
      y: Math.max(0, Math.min(store.fieldH - CARD_H, ny)),
    };
  }

  function overlaps(ax, ay, bx, by) {
    return (
      ax < bx + CARD_W + GAP &&
      ax + CARD_W + GAP > bx &&
      ay < by + CARD_H + GAP &&
      ay + CARD_H + GAP > by
    );
  }

  function resolveNoOverlap(id, x, y, axisHint = "x") {
    let rx = x;
    let ry = y;
    for (let i = 0; i < 16; i += 1) {
      let hit = null;
      for (const other of store.cards) {
        if (other.id === id) continue;
        if (overlaps(rx, ry, other.x, other.y)) {
          hit = other;
          break;
        }
      }
      if (!hit) break;
      if (axisHint === "y") {
        ry = ry < hit.y ? hit.y - CARD_H - GAP : hit.y + CARD_H + GAP;
      } else {
        rx = rx < hit.x ? hit.x - CARD_W - GAP : hit.x + CARD_W + GAP;
      }
      const clamped = clampToField(null, rx, ry);
      rx = clamped.x;
      ry = clamped.y;
      axisHint = axisHint === "x" ? "y" : "x";
    }
    return { x: rx, y: ry };
  }

  function startDrag(ev, card) {
    if (card.pinned) return;
    if (ev.button !== 0) return;
    if (ev.target.closest(".card-icon-btn")) return;
    const m = viewport.fieldCoordsFromClient(ev.clientX, ev.clientY);
    drag.value = {
      id: card.id,
      dx: m.x - card.x,
      dy: m.y - card.y,
      moved: false,
      targetX: card.x,
      targetY: card.y,
    };
  }

  function runDragFrame() {
    if (!drag.value) {
      dragRaf = 0;
      return;
    }
    const c = store.cards.find((x) => x.id === drag.value.id);
    if (!c) {
      dragRaf = 0;
      return;
    }
    const tx = drag.value.targetX;
    const ty = drag.value.targetY;
    // Frame-synced interpolation removes micro-jitter from irregular pointermove frequency.
    c.x += (tx - c.x) * 0.55;
    c.y += (ty - c.y) * 0.55;
    if (Math.abs(tx - c.x) < 0.1) c.x = tx;
    if (Math.abs(ty - c.y) < 0.1) c.y = ty;
    dragRaf = requestAnimationFrame(runDragFrame);
  }

  function ensureDragRaf() {
    if (dragRaf) return;
    dragRaf = requestAnimationFrame(runDragFrame);
  }

  function onDragMove(ev) {
    if (!drag.value) return;
    const m = viewport.fieldCoordsFromClient(ev.clientX, ev.clientY);
    const desired = clampToField(null, m.x - drag.value.dx, m.y - drag.value.dy);
    // Keep dragging smooth: defer anti-overlap correction to drag end.
    if (desired.x !== drag.value.targetX || desired.y !== drag.value.targetY) {
      drag.value.targetX = desired.x;
      drag.value.targetY = desired.y;
      drag.value.moved = true;
      ensureDragRaf();
    }
  }

  function onDragEnd() {
    if (drag.value?.moved) {
      const c = store.cards.find((x) => x.id === drag.value.id);
      if (c) {
        const next = resolveNoOverlap(c.id, c.x, c.y, "x");
        c.x = next.x;
        c.y = next.y;
      }
      store.markDirty();
    }
    if (dragRaf) {
      cancelAnimationFrame(dragRaf);
      dragRaf = 0;
    }
    drag.value = null;
  }

  function addCardFromDraft() {
    const d = store.newCardDraft;
    const isUnknown = !d.fio && !d.birth && !d.birthPlace;
    const desired = clampToField(null, store.camX - 116, store.camY - 102);
    const resolved = resolveNoOverlap("", desired.x, desired.y, "x");
    store.addCard({
      x: resolved.x,
      y: resolved.y,
      fio: d.fio,
      birth: d.birth,
      birthPlace: d.birthPlace,
      gender: d.gender,
      maidenName: d.maidenName,
      isUnknown,
    });
    store.newCardDraft = { fio: "", birth: "", birthPlace: "", gender: "", maidenName: "" };
    store.showNewCardPanel = false;
  }

  function closeNewPanel() {
    blurActiveIfInside(".side-panel");
    store.showNewCardPanel = false;
  }

  function openEdit(cardId) {
    const c = store.cards.find((x) => x.id === cardId);
    if (!c) return;
    store.editingCardId = cardId;
    store.editDraft = {
      fio: c.fio || "",
      birth: c.birth || "",
      birthPlace: c.birthPlace || "",
      gender: c.gender || "",
      maidenName: c.maidenName || "",
    };
    store.showEditCardPanel = true;
  }

  function saveEdit() {
    if (!store.editingCardId) return;
    const d = store.editDraft;
    const empty = !d.fio && !d.birth && !d.birthPlace;
    store.patchCard(store.editingCardId, {
      fio: empty ? "" : d.fio,
      birth: empty ? "" : d.birth,
      birthPlace: empty ? "" : d.birthPlace,
      gender: empty ? "" : d.gender,
      maidenName: empty ? "" : d.maidenName,
      isUnknown: empty,
    });
    store.showEditCardPanel = false;
    store.editingCardId = null;
  }

  function closeEditPanel() {
    blurActiveIfInside(".side-panel");
    store.showEditCardPanel = false;
    store.editingCardId = null;
  }

  return {
    editingCard,
    cardStyle,
    startDrag,
    onDragMove,
    onDragEnd,
    addCardFromDraft,
    openEdit,
    saveEdit,
    closeNewPanel,
    closeEditPanel,
  };
}

