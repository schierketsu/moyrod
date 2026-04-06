import { computed, ref } from "vue";

export function useCards(store, viewport) {
  const drag = ref(null);
  const editingCard = computed(() => store.cards.find((c) => c.id === store.editingCardId) || null);
  const CARD_W = 232;
  /** Совпадает с визуальной высотой карточки (--card-min-h), без лишнего «запаса». */
  const CARD_H = 204;
  /** Зазор при отпускании — карточки не наезжают друг на друга. */
  const GAP_RELEASE = 14;
  /** Во время перетаскивания — меньше, чтобы не «цеплялось» за соседей. */
  const GAP_DRAG = 6;

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

  function overlaps(ax, ay, bx, by, gap) {
    return (
      ax < bx + CARD_W + gap &&
      ax + CARD_W + gap > bx &&
      ay < by + CARD_H + gap &&
      ay + CARD_H + gap > by
    );
  }

  function resolveNoOverlap(id, x, y, axisHint, gap) {
    let rx = x;
    let ry = y;
    for (let i = 0; i < 20; i += 1) {
      let hit = null;
      for (const other of store.cards) {
        if (other.id === id) continue;
        if (overlaps(rx, ry, other.x, other.y, gap)) {
          hit = other;
          break;
        }
      }
      if (!hit) break;
      if (axisHint === "y") {
        ry = ry < hit.y ? hit.y - CARD_H - gap : hit.y + CARD_H + gap;
      } else {
        rx = rx < hit.x ? hit.x - CARD_W - gap : hit.x + CARD_W + gap;
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
    const el = ev.currentTarget;
    if (el && typeof el.setPointerCapture === "function") {
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    }
    drag.value = {
      id: card.id,
      dx: m.x - card.x,
      dy: m.y - card.y,
      startX: card.x,
      startY: card.y,
      pointerId: ev.pointerId,
    };
  }

  function releasePointerCaptureIfNeeded() {
    const d = drag.value;
    if (!d || d.pointerId == null) return;
    const article = document.getElementById(d.id);
    const handle = article?.querySelector?.(".card-drag");
    if (handle && typeof handle.releasePointerCapture === "function") {
      try {
        handle.releasePointerCapture(d.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function onDragMove(ev) {
    if (!drag.value) return;
    const c = store.cards.find((x) => x.id === drag.value.id);
    if (!c) return;

    const m = viewport.fieldCoordsFromClient(ev.clientX, ev.clientY);
    const desired = clampToField(null, m.x - drag.value.dx, m.y - drag.value.dy);
    const axis = Math.abs(desired.x - c.x) >= Math.abs(desired.y - c.y) ? "x" : "y";
    const safe = resolveNoOverlap(drag.value.id, desired.x, desired.y, axis, GAP_DRAG);

    c.x = safe.x;
    c.y = safe.y;
  }

  function onDragEnd() {
    releasePointerCaptureIfNeeded();
    const d = drag.value;
    if (d) {
      const c = store.cards.find((x) => x.id === d.id);
      if (c) {
        const next = resolveNoOverlap(c.id, c.x, c.y, "x", GAP_RELEASE);
        c.x = next.x;
        c.y = next.y;
        const shifted = c.x !== d.startX || c.y !== d.startY;
        if (shifted) store.markDirty();
      }
    }
    drag.value = null;
  }

  function addCardFromDraft() {
    const d = store.newCardDraft;
    const isUnknown = !d.fio && !d.birth && !d.birthPlace;
    const desired = clampToField(null, store.camX - 116, store.camY - 102);
    const resolved = resolveNoOverlap("", desired.x, desired.y, "x", GAP_RELEASE);
    store.addCard({
      x: resolved.x,
      y: resolved.y,
      fio: d.fio,
      birth: d.birth,
      birthPlace: d.birthPlace,
      gender: d.gender,
      maidenName: d.maidenName,
      uncertainFio: d.uncertainFio === true,
      uncertainBirth: d.uncertainBirth === true,
      uncertainBirthPlace: d.uncertainBirthPlace === true,
      isUnknown,
    });
    store.newCardDraft = {
      fio: "",
      birth: "",
      birthPlace: "",
      gender: "",
      maidenName: "",
      uncertainFio: false,
      uncertainBirth: false,
      uncertainBirthPlace: false,
    };
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
      uncertainFio: c.uncertainFio === true,
      uncertainBirth: c.uncertainBirth === true,
      uncertainBirthPlace: c.uncertainBirthPlace === true,
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
      uncertainFio: empty ? false : d.uncertainFio === true,
      uncertainBirth: empty ? false : d.uncertainBirth === true,
      uncertainBirthPlace: empty ? false : d.uncertainBirthPlace === true,
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
