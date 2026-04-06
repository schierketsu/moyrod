import { computed, ref } from "vue";

export function useCards(store, viewport) {
  const drag = ref(null);
  const editingCard = computed(() => store.cards.find((c) => c.id === store.editingCardId) || null);

  function cardStyle(card) {
    return { left: `${card.x}px`, top: `${card.y}px` };
  }

  function clampToField(card, nx, ny) {
    const w = 232;
    const h = 204;
    return {
      x: Math.max(0, Math.min(store.fieldW - w, nx)),
      y: Math.max(0, Math.min(store.fieldH - h, ny)),
    };
  }

  function startDrag(ev, card) {
    if (card.pinned) return;
    if (ev.button !== 0) return;
    if (ev.target.closest(".card-icon-btn")) return;
    const m = viewport.fieldCoordsFromClient(ev.clientX, ev.clientY);
    drag.value = { id: card.id, dx: m.x - card.x, dy: m.y - card.y };
  }

  function onDragMove(ev) {
    if (!drag.value) return;
    const c = store.cards.find((x) => x.id === drag.value.id);
    if (!c) return;
    const m = viewport.fieldCoordsFromClient(ev.clientX, ev.clientY);
    const next = clampToField(c, m.x - drag.value.dx, m.y - drag.value.dy);
    store.patchCard(c.id, next);
  }

  function onDragEnd() {
    drag.value = null;
  }

  function addCardFromDraft() {
    const d = store.newCardDraft;
    const isUnknown = !d.fio && !d.birth && !d.birthPlace;
    store.addCard({
      x: store.camX - 116,
      y: store.camY - 102,
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

  return {
    editingCard,
    cardStyle,
    startDrag,
    onDragMove,
    onDragEnd,
    addCardFromDraft,
    openEdit,
    saveEdit,
  };
}

