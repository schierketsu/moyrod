import { computed, ref } from "vue";

function cloneNotesImages(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => ({
    id: x?.id || `ni_${Math.random().toString(36).slice(2, 11)}`,
    dataUrl: typeof x?.dataUrl === "string" ? x.dataUrl : "",
    name: typeof x?.name === "string" ? x.name : "",
  }));
}

export function useCards(store, viewport) {
  const drag = ref(null);
  const editingCard = computed(() => store.cards.find((c) => c.id === store.editingCardId) || null);
  const CARD_W = 232;
  const CARD_H = 204;
  const GAP_RELEASE = 14;
  const GAP_DRAG = 6;
  const sizeCache = new Map();

  function blurActiveIfInside(selector) {
    const active = document.activeElement;
    if (active && typeof active.closest === "function" && active.closest(selector)) {
      active.blur();
    }
  }

  function cardStyle(card) {
    return { left: `${card.x}px`, top: `${card.y}px` };
  }

  function getCardSize(cardId) {
    if (!cardId) return { w: CARD_W, h: CARD_H };
    const cached = sizeCache.get(cardId);
    if (cached) return cached;
    const el = typeof document !== "undefined" ? document.getElementById(cardId) : null;
    const s = {
      w: Math.max(CARD_W, el?.offsetWidth || CARD_W),
      h: Math.max(CARD_H, el?.offsetHeight || CARD_H),
    };
    sizeCache.set(cardId, s);
    return s;
  }

  function clampToField(nx, ny, w = CARD_W, h = CARD_H) {
    return {
      x: Math.max(0, Math.min(store.fieldW - w, nx)),
      y: Math.max(0, Math.min(store.fieldH - h, ny)),
    };
  }

  function overlaps(ax, ay, aw, ah, bx, by, bw, bh, gap) {
    return (
      ax < bx + bw + gap &&
      ax + aw + gap > bx &&
      ay < by + bh + gap &&
      ay + ah + gap > by
    );
  }

  function resolveNoOverlap(id, x, y, axisHint, gap) {
    const activeSize = getCardSize(id);
    let rx = x;
    let ry = y;
    for (let i = 0; i < 20; i += 1) {
      let hit = null;
      let hitSize = null;
      for (const other of store.cards) {
        if (other.id === id) continue;
        const otherSize = getCardSize(other.id);
        if (overlaps(rx, ry, activeSize.w, activeSize.h, other.x, other.y, otherSize.w, otherSize.h, gap)) {
          hit = other;
          hitSize = otherSize;
          break;
        }
      }
      if (!hit) break;
      if (axisHint === "y") {
        ry = ry < hit.y ? hit.y - activeSize.h - gap : hit.y + hitSize.h + gap;
      } else {
        rx = rx < hit.x ? hit.x - activeSize.w - gap : hit.x + hitSize.w + gap;
      }
      const clamped = clampToField(rx, ry, activeSize.w, activeSize.h);
      rx = clamped.x;
      ry = clamped.y;
      axisHint = axisHint === "x" ? "y" : "x";
    }
    return { x: rx, y: ry };
  }

  function startDrag(ev, card) {
    if (store.currentProjectReadOnly) return;
    if (card.pinned) return;
    if (ev.button !== 0) return;
    if (ev.target.closest(".card-icon-btn")) return;
    if (!viewport.isSelected(card.id)) {
      viewport.selectOnly(card.id);
    }
    const m = viewport.fieldCoordsFromClient(ev.clientX, ev.clientY);
    sizeCache.clear();
    const el = ev.currentTarget;
    if (el && typeof el.setPointerCapture === "function") {
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    }
    const selectedIds = viewport.getSelectedCardIds().filter((id) => {
      const row = store.cards.find((x) => x.id === id);
      return row && !row.pinned;
    });
    const dragIds = selectedIds.includes(card.id) ? selectedIds : [card.id];
    const origins = dragIds
      .map((id) => {
        const row = store.cards.find((x) => x.id === id);
        if (!row) return null;
        const s = getCardSize(id);
        return { id, x: row.x, y: row.y, w: s.w, h: s.h };
      })
      .filter(Boolean);
    drag.value = {
      id: card.id,
      ids: dragIds,
      origins,
      dx: m.x - card.x,
      dy: m.y - card.y,
      startX: card.x,
      startY: card.y,
      startPointerX: m.x,
      startPointerY: m.y,
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
    if ((drag.value.ids || []).length > 1) {
      const wantedDx = m.x - drag.value.startPointerX;
      const wantedDy = m.y - drag.value.startPointerY;
      let minDx = -Infinity;
      let maxDx = Infinity;
      let minDy = -Infinity;
      let maxDy = Infinity;
      for (const o of drag.value.origins || []) {
        minDx = Math.max(minDx, -o.x);
        maxDx = Math.min(maxDx, store.fieldW - o.w - o.x);
        minDy = Math.max(minDy, -o.y);
        maxDy = Math.min(maxDy, store.fieldH - o.h - o.y);
      }
      const clampedDx = Math.max(minDx, Math.min(maxDx, wantedDx));
      const clampedDy = Math.max(minDy, Math.min(maxDy, wantedDy));
      for (const o of drag.value.origins || []) {
        const row = store.cards.find((x) => x.id === o.id);
        if (!row) continue;
        row.x = o.x + clampedDx;
        row.y = o.y + clampedDy;
      }
      return;
    }
    const dragSize = getCardSize(drag.value.id);
    const desired = clampToField(m.x - drag.value.dx, m.y - drag.value.dy, dragSize.w, dragSize.h);
    const axis = Math.abs(desired.x - c.x) >= Math.abs(desired.y - c.y) ? "x" : "y";
    const safe = resolveNoOverlap(drag.value.id, desired.x, desired.y, axis, GAP_DRAG);

    c.x = safe.x;
    c.y = safe.y;
  }

  function onDragEnd() {
    releasePointerCaptureIfNeeded();
    const d = drag.value;
    if (d) {
      if ((d.ids || []).length > 1) {
        let shiftedGroup = false;
        for (const o of d.origins || []) {
          const row = store.cards.find((x) => x.id === o.id);
          if (!row) continue;
          if (row.x !== o.x || row.y !== o.y) shiftedGroup = true;
        }
        if (shiftedGroup) store.markDirty();
      } else {
        const c = store.cards.find((x) => x.id === d.id);
        if (c) {
          const next = resolveNoOverlap(c.id, c.x, c.y, "x", GAP_RELEASE);
          c.x = next.x;
          c.y = next.y;
          const shifted = c.x !== d.startX || c.y !== d.startY;
          if (shifted) store.markDirty();
        }
      }
    }
    sizeCache.clear();
    drag.value = null;
  }

  function addCardFromDraft() {
    if (store.currentProjectReadOnly) return;
    const d = store.newCardDraft;
    const isUnknown = !d.fio && !d.birth && !d.birthPlace;
    const desired = clampToField(store.camX - 116, store.camY - 102);
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
      vovParticipant: d.vovParticipant === true,
      notesText: typeof d.notesText === "string" ? d.notesText : "",
      notesImages: Array.isArray(d.notesImages) ? cloneNotesImages(d.notesImages) : [],
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
      vovParticipant: false,
      notesText: "",
      notesImages: [],
    };
    store.showNewCardPanel = false;
  }

  function closeNewPanel() {
    blurActiveIfInside(".side-panel");
    store.showNewCardPanel = false;
  }

  function openEdit(cardId) {
    if (store.currentProjectReadOnly) return;
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
      vovParticipant: c.vovParticipant === true,
      notesText: typeof c.notesText === "string" ? c.notesText : "",
      notesImages: cloneNotesImages(c.notesImages),
    };
    store.showEditCardPanel = true;
  }

  function toggleEditVovParticipant() {
    if (store.currentProjectReadOnly || !store.editingCardId) return;
    const next = !store.editDraft.vovParticipant;
    store.editDraft.vovParticipant = next;
    store.patchCard(store.editingCardId, { vovParticipant: next });
  }

  function saveEdit() {
    if (store.currentProjectReadOnly) return;
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
      vovParticipant: d.vovParticipant === true,
      notesText: typeof d.notesText === "string" ? d.notesText : "",
      notesImages: Array.isArray(d.notesImages) ? cloneNotesImages(d.notesImages) : [],
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
    toggleEditVovParticipant,
  };
}
