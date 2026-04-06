import { computed, ref } from "vue";

function center(card) {
  return { x: card.x + 116, y: card.y + 102 };
}

export function useGraph(store) {
  const pendingPort = ref(null);
  const pendingUnion = ref(null);

  const unionNodes = computed(() => {
    const byId = new Map(store.cards.map((c) => [c.id, c]));
    const unions = [];
    for (const link of store.links) {
      if (link.kind !== "spouse") continue;
      const a = byId.get(link.a);
      const b = byId.get(link.b);
      if (!a || !b) continue;
      const ca = center(a);
      const cb = center(b);
      const key = [link.a, link.b].sort().join("|");
      unions.push({
        key,
        a: link.a,
        b: link.b,
        x: (ca.x + cb.x) / 2,
        y: (ca.y + cb.y) / 2,
      });
    }
    return unions;
  });

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
        const cy = a.y + (b.y - a.y) * 0.48;
        out.push({
          key: `${kind}:${link.from}:${link.to}`,
          d: `M ${a.x} ${a.y} C ${a.x} ${cy}, ${b.x} ${cy}, ${b.x} ${b.y}`,
          className: "lines-layer-path",
          payload: { kind: "lineage", from: link.from, to: link.to },
        });
      } else if (kind === "spouse") {
        const a = byId.get(link.a);
        const b = byId.get(link.b);
        if (!a || !b) continue;
        const ca = center(a);
        const cb = center(b);
        out.push({
          key: `${kind}:${link.a}:${link.b}`,
          d: `M ${ca.x} ${ca.y} L ${cb.x} ${cb.y}`,
          className: "lines-layer-path lines-layer-path--spouse",
          payload: { kind: "spouse", a: link.a, b: link.b },
        });
      } else if (kind === "childOfUnion") {
        const a = byId.get(link.a);
        const b = byId.get(link.b);
        const child = byId.get(link.child);
        if (!a || !b || !child) continue;
        const ca = center(a);
        const cb = center(b);
        const union = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
        const top = { x: child.x + 116, y: child.y };
        const cy = union.y + (top.y - union.y) * 0.52;
        out.push({
          key: `${kind}:${link.a}:${link.b}:${link.child}`,
          d: `M ${union.x} ${union.y} C ${union.x} ${cy}, ${top.x} ${cy}, ${top.x} ${top.y}`,
          className: "lines-layer-path",
          payload: { kind: "childOfUnion", a: link.a, b: link.b, child: link.child },
        });
      }
    }
    return out;
  });

  function portDown(cardId, port) {
    if (pendingUnion.value) {
      const u = pendingUnion.value;
      pendingUnion.value = null;
      if (port === "top" && cardId !== u.a && cardId !== u.b) {
        store.addChildOfUnionLink(u.a, u.b, cardId);
      }
      return;
    }
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
    if (first.port === "top" && port === "top") {
      store.addLineageLink(first.cardId, cardId);
      return;
    }
  }

  function armUnion(a, b) {
    const same = pendingUnion.value && pendingUnion.value.a === a && pendingUnion.value.b === b;
    pendingUnion.value = same ? null : { a, b };
    pendingPort.value = null;
  }

  return { linksPath, unionNodes, pendingPort, pendingUnion, portDown, armUnion };
}

