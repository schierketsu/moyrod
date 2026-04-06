import { computed, ref } from "vue";

function center(card) {
  return { x: card.x + 116, y: card.y + 102 };
}

export function useGraph(store) {
  const pendingPort = ref(null);

  const linksPath = computed(() => {
    const byId = new Map(store.cards.map((c) => [c.id, c]));
    const out = [];
    for (const link of store.links) {
      const kind = link.kind || "lineage";
      if (kind === "lineage") {
        const from = byId.get(link.from);
        const to = byId.get(link.to);
        if (!from || !to) continue;
        const a = { x: from.x + 116, y: from.y + 204 };
        const b = { x: to.x + 116, y: to.y };
        out.push({ key: `${kind}:${link.from}:${link.to}`, d: `M ${a.x} ${a.y} L ${b.x} ${b.y}` });
      } else if (kind === "spouse") {
        const a = byId.get(link.a);
        const b = byId.get(link.b);
        if (!a || !b) continue;
        const ca = center(a);
        const cb = center(b);
        out.push({ key: `${kind}:${link.a}:${link.b}`, d: `M ${ca.x} ${ca.y} L ${cb.x} ${cb.y}` });
      } else if (kind === "childOfUnion") {
        const a = byId.get(link.a);
        const b = byId.get(link.b);
        const child = byId.get(link.child);
        if (!a || !b || !child) continue;
        const ca = center(a);
        const cb = center(b);
        const union = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
        const top = { x: child.x + 116, y: child.y };
        out.push({ key: `${kind}:${link.a}:${link.b}:${link.child}`, d: `M ${union.x} ${union.y} L ${top.x} ${top.y}` });
      }
    }
    return out;
  });

  function portDown(cardId, port) {
    if (!pendingPort.value) {
      pendingPort.value = { cardId, port };
      return;
    }
    const first = pendingPort.value;
    pendingPort.value = null;
    if (first.cardId === cardId) return;
    if ((first.port === "left" || first.port === "right") && (port === "left" || port === "right")) {
      store.addSpouseLink(first.cardId, cardId);
      return;
    }
    if (first.port === "bottom" && port === "top") {
      store.addLineageLink(first.cardId, cardId);
      return;
    }
    if (first.port === "top" && port === "bottom") {
      store.addLineageLink(cardId, first.cardId);
    }
  }

  return { linksPath, pendingPort, portDown };
}

