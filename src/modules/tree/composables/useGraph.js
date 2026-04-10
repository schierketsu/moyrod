import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const CARD_W = 232;
const CARD_H = 204;

function cardBorderWidth(card) {
  return card?.id === "m_self" ? 3 : 1;
}

function cardLayout(card) {
  const border = cardBorderWidth(card);
  const el = typeof document !== "undefined" ? document.getElementById(card.id) : null;
  const contentH = el?.clientHeight || CARD_H;
  return {
    border,
    contentH,
  };
}

/** Центр верхнего / нижнего порта (ребёнок у союза или вертикальная линия родства). */
function verticalPortPoint(card, edge) {
  const m = cardLayout(card);
  const x = card.x + m.border + CARD_W / 2;
  if (edge === "bottom") return { x, y: card.y + m.border + m.contentH };
  return { x, y: card.y + m.border };
}

/** Центр бокового порта (связь пары супругов). */
function sidePortPoint(card, side) {
  const m = cardLayout(card);
  const y = card.y + m.border + m.contentH / 2;
  if (side === "right") return { x: card.x + m.border + CARD_W, y };
  return { x: card.x + m.border, y };
}

function spouseCurvePath(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const dir = dx >= 0 ? 1 : -1;
  const bend = Math.max(28, Math.min(120, dist * 0.28));
  const c1x = from.x + dir * bend;
  const c2x = to.x - dir * bend;
  const yShift = Math.max(-34, Math.min(34, dy * 0.22));
  const c1y = from.y + yShift;
  const c2y = to.y - yShift;
  return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
}

/** Карточки почти в одной колонне (центры портов по X близко). */
const VERTICAL_STACK_EPS_X = 34;

function isBottomTopPortPair(fromPort, toPort) {
  const f = String(fromPort);
  const t = String(toPort);
  return (f === "bottom" && t === "top") || (f === "top" && t === "bottom");
}

/** Нижний↔верхний порт и «столбик» — прямая вертикаль вместо S-образной кривой. */
function pathBetweenPortEndpoints(fromPt, toPt, fromPort, toPort) {
  if (
    fromPort != null &&
    toPort != null &&
    isBottomTopPortPair(fromPort, toPort) &&
    Math.abs(fromPt.x - toPt.x) <= VERTICAL_STACK_EPS_X
  ) {
    const x = (fromPt.x + toPt.x) / 2;
    return `M ${x} ${fromPt.y} L ${x} ${toPt.y}`;
  }
  return spouseCurvePath(fromPt, toPt);
}

/** Линия родства между боковыми портами. */
function sideLineagePath(a, b) {
  const midX = a.x + (b.x - a.x) * 0.5;
  const c1y = a.y + (b.y - a.y) * 0.35;
  const c2y = b.y - (b.y - a.y) * 0.35;
  return `M ${a.x} ${a.y} C ${midX} ${c1y}, ${midX} ${c2y}, ${b.x} ${b.y}`;
}

/** Старая геометрия пары (бок ↔ бок), если в данных нет anchor. */
function sideCenterSpousePoints(a, b) {
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

function cardCenter(card) {
  const m = cardLayout(card);
  return { x: card.x + m.border + CARD_W / 2, y: card.y + m.border + m.contentH / 2 };
}

/** Старые проекты: родство сверху вниз (низ верхней карточки → верх нижней). */
function legacyLineageVerticalPath(from, to) {
  const mf = cardLayout(from);
  const mt = cardLayout(to);
  const a = { x: from.x + mf.border + CARD_W / 2, y: from.y + mf.border + mf.contentH };
  const b = { x: to.x + mt.border + CARD_W / 2, y: to.y + mt.border };
  if (Math.abs(a.x - b.x) <= VERTICAL_STACK_EPS_X) {
    const x = (a.x + b.x) / 2;
    return `M ${x} ${a.y} L ${x} ${b.y}`;
  }
  const cy = a.y + (b.y - a.y) * 0.48;
  return `M ${a.x} ${a.y} C ${a.x} ${cy}, ${b.x} ${cy}, ${b.x} ${b.y}`;
}

function normalizeSide(s) {
  return s === "right" ? "right" : "left";
}

function normalizeAnchor(a) {
  return a === "bottom" ? "bottom" : "top";
}

function portPoint(card, portName) {
  const p = String(portName || "left");
  if (p === "top" || p === "bottom") return verticalPortPoint(card, normalizeAnchor(p));
  return sidePortPoint(card, normalizeSide(p));
}

/** Кривая обычной связи: явные порты, старые боковые fromSide/toSide или вертикаль legacy. */
function lineageCurvePath(link, fromCard, toCard) {
  if (link.fromPort && link.toPort) {
    return pathBetweenPortEndpoints(
      portPoint(fromCard, link.fromPort),
      portPoint(toCard, link.toPort),
      link.fromPort,
      link.toPort
    );
  }
  const hasSides = link.fromSide != null && link.toSide != null;
  if (hasSides) {
    return sideLineagePath(
      sidePortPoint(fromCard, normalizeSide(link.fromSide)),
      sidePortPoint(toCard, normalizeSide(link.toSide))
    );
  }
  return legacyLineageVerticalPath(fromCard, toCard);
}

/** Концы линии пары по вертикальным портам: у карты a — link.anchor, у b — anchorPartner или тот же anchor. */
function spouseVerticalEndpoints(link, cardA, cardB) {
  const anchorA = normalizeAnchor(link.anchor);
  const anchorB = link.anchorPartner != null ? normalizeAnchor(link.anchorPartner) : anchorA;
  return {
    from: verticalPortPoint(cardA, anchorA),
    to: verticalPortPoint(cardB, anchorB),
  };
}

/** Геометрия пары: явные fromPort/toPort у карт a и b, иначе legacy anchor или бок по центру. */
function spouseCurveEndpoints(link, cardA, cardB) {
  if (link.fromPort && link.toPort) {
    return {
      from: portPoint(cardA, link.fromPort),
      to: portPoint(cardB, link.toPort),
    };
  }
  if (link.anchor === "top" || link.anchor === "bottom") {
    return spouseVerticalEndpoints(link, cardA, cardB);
  }
  const s = sideCenterSpousePoints(cardA, cardB);
  return { from: s.from, to: s.to };
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
      const key = [link.a, link.b].sort().join("|");
      const { from: pa, to: pb } = spouseCurveEndpoints(link, a, b);
      const x = (pa.x + pb.x) / 2;
      const y = (pa.y + pb.y) / 2;
      unions.push({
        key,
        a: link.a,
        b: link.b,
        x,
        y,
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
        const d = lineageCurvePath(link, from, to);
        out.push({
          key: `${kind}:${link.from}:${link.to}`,
          d,
          className: "lines-layer-path",
          payload: { kind: "lineage", from: link.from, to: link.to },
        });
      } else if (kind === "spouse") {
        const a = byId.get(link.a);
        const b = byId.get(link.b);
        if (!a || !b) continue;
        const { from, to } = spouseCurveEndpoints(link, a, b);
        const d =
          link.fromPort && link.toPort
            ? pathBetweenPortEndpoints(from, to, link.fromPort, link.toPort)
            : spouseCurvePath(from, to);
        out.push({
          key: `${kind}:${link.a}:${link.b}`,
          d,
          className: "lines-layer-path lines-layer-path--spouse",
          payload: { kind: "spouse", a: link.a, b: link.b },
        });
      } else if (kind === "childOfUnion") {
        const a = byId.get(link.a);
        const b = byId.get(link.b);
        const child = byId.get(link.child);
        if (!a || !b || !child) continue;
        const spouseL = store.links.find(
          (l) => l.kind === "spouse" && ((l.a === link.a && l.b === link.b) || (l.a === link.b && l.b === link.a))
        );
        let union;
        if (spouseL) {
          const { from: pa, to: pb } = spouseCurveEndpoints(spouseL, a, b);
          union = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        } else {
          const ca = cardCenter(a);
          const cb = cardCenter(b);
          union = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
        }
        let childPt;
        if (link.childSide === "left" || link.childSide === "right") {
          childPt = sidePortPoint(child, normalizeSide(link.childSide));
        } else if (link.childSide === "top" || link.childSide === "bottom") {
          childPt = verticalPortPoint(child, normalizeAnchor(link.childSide));
        } else {
          const mc = cardLayout(child);
          childPt = { x: child.x + mc.border + CARD_W / 2, y: child.y + mc.border };
        }
        const cy = union.y + (childPt.y - union.y) * 0.52;
        out.push({
          key: `${kind}:${link.a}:${link.b}:${link.child}`,
          d: `M ${union.x} ${union.y} C ${union.x} ${cy}, ${childPt.x} ${cy}, ${childPt.x} ${childPt.y}`,
          className: "lines-layer-path",
          payload: { kind: "childOfUnion", a: link.a, b: link.b, child: link.child },
        });
      }
    }
    return out;
  });

  function isVerticalPort(p) {
    return p === "top" || p === "bottom";
  }

  function isSidePort(p) {
    return p === "left" || p === "right";
  }

  function portDown(cardId, port) {
    if (store.currentProjectReadOnly) return;
    if (pendingUnion.value) {
      const u = pendingUnion.value;
      pendingUnion.value = null;
      if (cardId !== u.a && cardId !== u.b && (isVerticalPort(port) || isSidePort(port))) {
        store.addChildOfUnionLink(u.a, u.b, cardId, port);
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

    store.addEdgeLink(first.cardId, cardId, first.port, port);
  }

  function clearPendingConnections() {
    pendingPort.value = null;
    pendingUnion.value = null;
  }

  function armUnion(a, b) {
    if (store.currentProjectReadOnly) return;
    const same = pendingUnion.value && pendingUnion.value.a === a && pendingUnion.value.b === b;
    pendingUnion.value = same ? null : { a, b };
    pendingPort.value = null;
  }

  return { linksPath, unionNodes, pendingPort, pendingUnion, portDown, armUnion, clearPendingConnections };
}
