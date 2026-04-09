import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const CARD_W = 232;
const CARD_H = 204;

function cardBorderWidth(card) {
  return card?.id === "m_self" ? 3 : 1;
}

function cardLayout(card) {
  const border = cardBorderWidth(card);
  const el = typeof document !== "undefined" ? document.getElementById(card.id) : null;
  // clientHeight excludes border and matches port positioning context (padding box).
  const contentH = el?.clientHeight || CARD_H;
  return {
    border,
    contentH,
  };
}

function center(card) {
  const m = cardLayout(card);
  return { x: card.x + m.border + CARD_W / 2, y: card.y + m.border + m.contentH / 2 };
}

function sideCenterPoints(a, b) {
  const ma = cardLayout(a);
  const mb = cardLayout(b);
  const ay = a.y + ma.border + ma.contentH / 2;
  const by = b.y + mb.border + mb.contentH / 2;
  if (a.x <= b.x) {
    return {
      from: { x: a.x + ma.border + CARD_W, y: ay },
      to: { x: b.x + mb.border, y: by },
    };
  }
  return {
    from: { x: a.x + ma.border, y: ay },
    to: { x: b.x + mb.border + CARD_W, y: by },
  };
}

export function useGraph(store) {
  const pendingPort = ref(null);
  const pendingUnion = ref(null);
  const layoutVersion = ref(0);
  let rafA = 0;
  let rafB = 0;

  function bumpLayoutVersion() {
    layoutVersion.value += 1;
  }

  function scheduleInitialLayoutRecalc() {
    if (rafA) cancelAnimationFrame(rafA);
    if (rafB) cancelAnimationFrame(rafB);
    // Двойной RAF: даём браузеру завершить layout/paint карточек после гидрации проекта.
    rafA = requestAnimationFrame(() => {
      bumpLayoutVersion();
      rafB = requestAnimationFrame(() => {
        bumpLayoutVersion();
      });
    });
  }

  onMounted(() => {
    scheduleInitialLayoutRecalc();
  });

  onBeforeUnmount(() => {
    if (rafA) cancelAnimationFrame(rafA);
    if (rafB) cancelAnimationFrame(rafB);
  });

  const unionNodes = computed(() => {
    const _layout = layoutVersion.value;
    void _layout;
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
    const _layout = layoutVersion.value;
    void _layout;
    const byId = new Map(store.cards.map((c) => [c.id, c]));
    const out = [];
    for (const link of store.links) {
      const kind = link.kind || "lineage";
      if (kind === "lineage") {
        const from = byId.get(link.from);
        const to = byId.get(link.to);
        if (!from || !to) continue;
        const mf = cardLayout(from);
        const mt = cardLayout(to);
        const a = { x: from.x + mf.border + CARD_W / 2, y: from.y + mf.border + mf.contentH };
        const b = { x: to.x + mt.border + CARD_W / 2, y: to.y + mt.border };
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
        const p = sideCenterPoints(a, b);
        out.push({
          key: `${kind}:${link.a}:${link.b}`,
          d: `M ${p.from.x} ${p.from.y} L ${p.to.x} ${p.to.y}`,
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
        const mc = cardLayout(child);
        const top = { x: child.x + mc.border + CARD_W / 2, y: child.y + mc.border };
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
    if (store.currentProjectReadOnly) return;
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
    if (store.currentProjectReadOnly) return;
    const same = pendingUnion.value && pendingUnion.value.a === a && pendingUnion.value.b === b;
    pendingUnion.value = same ? null : { a, b };
    pendingPort.value = null;
  }

  return { linksPath, unionNodes, pendingPort, pendingUnion, portDown, armUnion };
}

