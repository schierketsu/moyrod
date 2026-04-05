(function () {
  "use strict";

  const viewport = document.getElementById("viewport");
  const mapWorld = document.getElementById("map-world");
  const cardsLayer = document.getElementById("cards-layer");
  const linesLayer = document.getElementById("lines-layer");
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomOutBtn = document.getElementById("zoom-out");
  const fabAdd = document.getElementById("fab-add-card");
  const newCardBackdrop = document.getElementById("new-card-backdrop");
  const newCardPanel = document.getElementById("new-card-panel");
  const newCardForm = document.getElementById("new-card-form");
  const editCardBackdrop = document.getElementById("edit-card-backdrop");
  const editCardPanel = document.getElementById("edit-card-panel");
  const editCardForm = document.getElementById("edit-card-form");
  const editCardCancel = document.getElementById("edit-card-cancel");
  const welcomeOverlay = document.getElementById("welcome-overlay");
  const welcomeForm = document.getElementById("welcome-form");
  const toolbarProjectTools = document.getElementById("toolbar-project-tools");
  const projectTitleBtn = document.getElementById("project-title-btn");
  const projectBootstrapOverlay = document.getElementById("project-bootstrap-overlay");
  const projectBootstrapStatus = document.getElementById("project-bootstrap-status");
  const statsOverlay = document.getElementById("stats-overlay");
  const statsPanel = statsOverlay?.querySelector(".stats-panel");
  const statsCardCount = document.getElementById("stats-card-count");
  const statsLinkCount = document.getElementById("stats-link-count");
  const statsUpdatedAt = document.getElementById("stats-updated-at");
  const statsProjectNameInput = document.getElementById("stats-project-name");
  const linkDeleteBanner = document.getElementById("link-delete-banner");
  const linkDeleteBannerText = document.getElementById("link-delete-banner-title");
  const linkDeleteCancel = document.getElementById("link-delete-cancel");
  const linkDeleteConfirm = document.getElementById("link-delete-confirm");

  /** @type {string | null} */
  let editingCardId = null;

  /** @type {{ kind: string, from?: string, to?: string, a?: string, b?: string, child?: string } | null} */
  let pendingLinkDeletePayload = null;

  const PROFILE_KEY = "svoi_korni_profile_v1";
  /** Стабильный id карточки пользователя (одна на сессию и после перезагрузки). */
  const SELF_CARD_ID = "m_self";

  /** Компактное поле (~2.4× экрана); камера + zoom переносят вид. */
  let fieldW = 0;
  let fieldH = 0;
  /** Мировая точка в центре экрана (в пикселях поля). */
  let camX = 0;
  let camY = 0;
  let zoom = 1;
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2.5;

  /** @type {{ pointerId: number, lx: number, ly: number } | null} */
  let panPointer = null;
  /** Совпадает с --card-w / высотой вёрстки для начального позиционирования */
  const CARD_W_EST = 232;
  /** Минимум и запасной размер, если на поле ещё нет обычной карточки для замера */
  const CARD_H_EST = 204;

  /** @type {{ id: string, el: HTMLElement, x: number, y: number, fio: string, birth: string, birthPlace: string, title: string, pinned: boolean, isUnknown?: boolean }[]} */
  let cards = [];
  /**
   * lineage: родитель → ребёнок (сверху/снизу).
   * spouse: пара (боковые порты).
   * childOfUnion: ребёнок от пары (узел под линией пары → верх карточки).
   * @type {(
   *   | { kind?: "lineage"; from: string; to: string }
   *   | { kind: "spouse"; a: string; b: string }
   *   | { kind: "childOfUnion"; a: string; b: string; child: string }
   * )[]}
   */
  let links = [];

  /**
   * @type {{
   *   cardId?: string;
   *   port?: "top" | "bottom" | "left" | "right";
   *   union?: { a: string; b: string };
   * } | null}
   */
  let pendingLink = null;

  let dragState = null;

  const LS_LAST_PROJECT = "svoi_korni_last_project_id";
  /** @type {number | null} */
  let currentProjectId = null;
  let apiAvailable = false;
  let currentProjectName = "Мой проект";
  /** @type {number | null} */
  let lastProjectUpdatedAt = null;

  let loadingProject = false;
  let saveProjectTimer = null;
  const SAVE_DEBOUNCE_MS = 650;

  function applyViewTransform() {
    const vx = viewport.clientWidth;
    const vy = viewport.clientHeight;
    const tx = vx / 2 - camX * zoom;
    const ty = vy / 2 - camY * zoom;
    mapWorld.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
  }

  function updateFieldSize() {
    const vx = Math.max(320, viewport.clientWidth);
    const vy = Math.max(240, viewport.clientHeight);
    const nw = Math.round(vx * 2.4);
    const nh = Math.round(vy * 2.4);
    if (nw === fieldW && nh === fieldH) return;

    const oldW = fieldW;
    const oldH = fieldH;
    const rescale = cards.length > 0 && oldW > 0 && oldH > 0;

    if (rescale) {
      for (const c of cards) {
        const w = c.el.offsetWidth;
        const h = c.el.offsetHeight;
        const cx = c.x + w / 2;
        const cy = c.y + h / 2;
        c.x = Math.round((cx / oldW) * nw - w / 2);
        c.y = Math.round((cy / oldH) * nh - h / 2);
        c.x = Math.max(0, Math.min(nw - w, c.x));
        c.y = Math.max(0, Math.min(nh - h, c.y));
        c.el.style.left = `${c.x}px`;
        c.el.style.top = `${c.y}px`;
      }
    }

    fieldW = nw;
    fieldH = nh;
    cardsLayer.style.width = `${nw}px`;
    cardsLayer.style.height = `${nh}px`;
    linesLayer.style.width = `${nw}px`;
    linesLayer.style.height = `${nh}px`;

    if (rescale) {
      const self = getCardById(SELF_CARD_ID);
      if (self) {
        const cw = self.el.offsetWidth;
        const ch = self.el.offsetHeight;
        camX = self.x + cw / 2;
        camY = self.y + ch / 2;
      }
    }

    applyViewTransform();
    redrawLines();
    scheduleSaveProject();
  }

  function zoomBy(factor) {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
    zoom = next;
    applyViewTransform();
    redrawLines();
    scheduleSaveProject();
  }

  function zoomWheelAtClient(clientX, clientY, deltaY) {
    const vr = viewport.getBoundingClientRect();
    const mx = clientX - vr.left;
    const my = clientY - vr.top;
    const vx = viewport.clientWidth;
    const vy = viewport.clientHeight;
    const wx = camX + (mx - vx / 2) / zoom;
    const wy = camY + (my - vy / 2) / zoom;
    const factor = deltaY < 0 ? 1.09 : 1 / 1.09;
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
    camX = wx - (mx - vx / 2) / newZoom;
    camY = wy - (my - vy / 2) / newZoom;
    zoom = newZoom;
    applyViewTransform();
    redrawLines();
    scheduleSaveProject();
  }

  function uid() {
    return "c_" + Math.random().toString(36).slice(2, 11);
  }

  function getCardById(id) {
    return cards.find((c) => c.id === id);
  }

  /** Координаты курсора в системе поля (мировые пиксели карты). */
  function fieldCoordsFromClient(clientX, clientY) {
    const vr = viewport.getBoundingClientRect();
    const mx = clientX - vr.left;
    const my = clientY - vr.top;
    const vx = viewport.clientWidth;
    const vy = viewport.clientHeight;
    const tx = vx / 2 - camX * zoom;
    const ty = vy / 2 - camY * zoom;
    return {
      x: (mx - tx) / zoom,
      y: (my - ty) / zoom,
    };
  }

  function formatBirthDisplay(iso) {
    if (!iso) return "—";
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function formatPlaceDisplay(s) {
    const t = (s || "").trim();
    return t ? t : "—";
  }

  /**
   * Подсказки «место рождения»: сервер — Photon / Open-Meteo, формат «Страна - Область - Населённый пункт».
   * Нужен запущенный npm start — иначе список будет пустым.
   */
  function attachBirthPlaceSuggestions() {
    const layer = document.createElement("div");
    layer.className = "birth-place-suggestions";
    layer.id = "birth-place-suggestions";
    layer.hidden = true;
    layer.setAttribute("role", "listbox");
    document.body.appendChild(layer);

    let activeInput = null;
    let hideT = null;
    let debounceT = null;
    let suggestReq = 0;

    function hide() {
      clearTimeout(hideT);
      clearTimeout(debounceT);
      layer.hidden = true;
      layer.innerHTML = "";
      activeInput = null;
    }

    function position(input) {
      const r = input.getBoundingClientRect();
      const w = Math.max(r.width, 180);
      let left = r.left;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
      layer.style.left = `${left}px`;
      layer.style.top = `${r.bottom + 4}px`;
      layer.style.width = `${w}px`;
    }

    function renderItems(input, items) {
      layer.innerHTML = "";
      if (!items.length) {
        layer.hidden = true;
        if (activeInput === input) activeInput = null;
        return;
      }
      activeInput = input;
      for (const row of items) {
        const val = row && typeof row.value === "string" ? row.value : "";
        if (!val) continue;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "birth-place-suggestions-item";
        btn.setAttribute("role", "option");
        btn.textContent = val;
        btn.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          input.value = val;
          hide();
          input.focus();
        });
        layer.appendChild(btn);
      }
      position(input);
      layer.hidden = false;
    }

    function scheduleFetch(input) {
      clearTimeout(debounceT);
      clearTimeout(hideT);
      const q = input.value.trim();
      if (q.length < 2) {
        hide();
        return;
      }
      const myReq = ++suggestReq;
      debounceT = setTimeout(async () => {
        try {
          const r = await fetch(`/api/places/suggest?q=${encodeURIComponent(q)}`);
          if (myReq !== suggestReq) return;
          if (!r.ok) {
            hide();
            return;
          }
          const data = await r.json();
          if (myReq !== suggestReq) return;
          if (document.activeElement !== input) return;
          renderItems(input, Array.isArray(data) ? data : []);
        } catch {
          if (myReq === suggestReq) hide();
        }
      }, 380);
    }

    function onReposition() {
      if (!layer.hidden && activeInput) position(activeInput);
    }

    const inputs = [
      document.getElementById("welcome-birth-place"),
      document.getElementById("panel-birth-place"),
      document.getElementById("edit-panel-birth-place"),
    ].filter(Boolean);

    for (const inp of inputs) {
      inp.setAttribute("autocomplete", "off");
      inp.setAttribute("aria-autocomplete", "list");
      inp.addEventListener("focus", () => scheduleFetch(inp));
      inp.addEventListener("input", () => scheduleFetch(inp));
      inp.addEventListener("blur", () => {
        hideT = setTimeout(hide, 200);
      });
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && !layer.hidden) {
          ev.preventDefault();
          hide();
        }
      });
    }

    document.addEventListener("pointerdown", (ev) => {
      if (layer.hidden) return;
      const t = ev.target;
      if (t === activeInput || layer.contains(t)) return;
      hide();
    });

    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
  }

  /** Фамилия, имя, отчество — по одной строке (лишние слова сцепляются в третьей). */
  function splitFioLines(fio) {
    const parts = (fio || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return ["—", "—", "—"];
    if (parts.length === 1) return [parts[0], "—", "—"];
    if (parts.length === 2) return [parts[0], parts[1], "—"];
    return [parts[0], parts[1], parts.slice(2).join(" ")];
  }

  function setCardDisplayFields(cardEl, fio, birth, birthPlace) {
    const lines = splitFioLines(fio);
    cardEl.querySelectorAll("[data-fio-line]").forEach((el, i) => {
      el.textContent = lines[i] ?? "—";
    });
    const birthEl = cardEl.querySelector("[data-display-birth]");
    if (birthEl) birthEl.textContent = formatBirthDisplay(birth);
    const placeEl = cardEl.querySelector("[data-display-birth-place]");
    if (placeEl) placeEl.textContent = formatPlaceDisplay(birthPlace);
  }

  let unknownCardHeightRaf = null;

  /** Высота любой не-пустой карточки на поле (предпочтительно родственник, не «Я»). */
  function measureTypicalCardHeightPx() {
    let ref = cardsLayer.querySelector(
      ".family-card:not(.family-card--unknown):not(.family-card--self)",
    );
    if (!ref) ref = cardsLayer.querySelector(".family-card.family-card--self");
    if (!ref) ref = cardsLayer.querySelector(".family-card:not(.family-card--unknown)");
    if (ref && ref.offsetHeight > 0) return ref.offsetHeight;
    return CARD_H_EST;
  }

  function syncUnknownCardsMinHeight() {
    const h = measureTypicalCardHeightPx();
    const target = Math.max(h, CARD_H_EST);
    for (const c of cards) {
      if (!c.isUnknown || !c.el) continue;
      c.el.style.minHeight = `${target}px`;
    }
  }

  function scheduleSyncUnknownCardsMinHeight() {
    if (unknownCardHeightRaf != null) return;
    unknownCardHeightRaf = requestAnimationFrame(() => {
      unknownCardHeightRaf = null;
      syncUnknownCardsMinHeight();
    });
  }

  function applyCardVisualUnknown(el, isUnknown) {
    if (!el) return;
    el.classList.toggle("family-card--unknown", isUnknown);
    const unk = el.querySelector(".card-unknown-layer");
    const std = el.querySelector(".card-standard-fields");
    if (unk) unk.hidden = !isUnknown;
    if (std) std.hidden = !!isUnknown;
    if (!isUnknown) el.style.minHeight = "";
    scheduleSyncUnknownCardsMinHeight();
  }

  function syncNewCardSubmitLabel() {
    const btn = document.getElementById("new-card-submit");
    if (!btn) return;
    const fio = document.getElementById("panel-fio")?.value?.trim() ?? "";
    const birth = document.getElementById("panel-birth")?.value ?? "";
    const bp = document.getElementById("panel-birth-place")?.value?.trim() ?? "";
    const allEmpty = !fio && !birth && !bp;
    btn.textContent = allEmpty ? "Создать пустую карточку" : "Создать карточку";
  }

  function blurIfFocusedInside(el) {
    const ae = document.activeElement;
    if (ae && el && typeof el.contains === "function" && el.contains(ae)) ae.blur();
  }

  function closeEditCardPanel() {
    blurIfFocusedInside(editCardPanel);
    editCardBackdrop.classList.remove("is-open");
    editCardPanel.classList.remove("is-open");
    editCardBackdrop.setAttribute("aria-hidden", "true");
    editCardPanel.setAttribute("aria-hidden", "true");
    editingCardId = null;
  }

  function openEditCardPanel(cardId) {
    const c = getCardById(cardId);
    if (!c) return;
    closeNewCardPanel();
    editingCardId = cardId;
    const fioEl = document.getElementById("edit-panel-fio");
    const birthEl = document.getElementById("edit-panel-birth");
    const birthPlaceEl = document.getElementById("edit-panel-birth-place");
    if (fioEl) fioEl.value = c.fio;
    if (birthEl) birthEl.value = c.birth;
    if (birthPlaceEl) birthPlaceEl.value = c.birthPlace ?? "";
    editCardBackdrop.classList.add("is-open");
    editCardPanel.classList.add("is-open");
    editCardBackdrop.setAttribute("aria-hidden", "false");
    editCardPanel.setAttribute("aria-hidden", "false");
    fioEl?.focus();
  }

  function openNewCardPanel() {
    closeEditCardPanel();
    newCardBackdrop.classList.add("is-open");
    newCardPanel.classList.add("is-open");
    newCardBackdrop.setAttribute("aria-hidden", "false");
    newCardPanel.setAttribute("aria-hidden", "false");
    newCardForm.reset();
    syncNewCardSubmitLabel();
    document.getElementById("panel-fio")?.focus();
  }

  function closeNewCardPanel() {
    blurIfFocusedInside(newCardPanel);
    newCardBackdrop.classList.remove("is-open");
    newCardPanel.classList.remove("is-open");
    newCardBackdrop.setAttribute("aria-hidden", "true");
    newCardPanel.setAttribute("aria-hidden", "true");
  }

  function centerViewportForNewCard() {
    updateFieldSize();
    const x = Math.round(camX - CARD_W_EST / 2);
    const y = Math.round(camY - CARD_H_EST / 2);
    return {
      x: Math.max(0, Math.min(fieldW - CARD_W_EST, x)),
      y: Math.max(0, Math.min(fieldH - CARD_H_EST, y)),
    };
  }

  /**
   * Сдвигает позицию карточки так, чтобы она не пересекалась с остальными (допускается только касание рёбер).
   */
  function resolveCardCollisions(movingId, x, y, w, h) {
    let cx = x;
    let cy = y;
    const maxIter = 32;
    for (let iter = 0; iter < maxIter; iter++) {
      cx = Math.max(0, Math.min(fieldW - w, cx));
      cy = Math.max(0, Math.min(fieldH - h, cy));
      let changed = false;
      for (const other of cards) {
        if (other.id === movingId) continue;
        const ow = other.el.offsetWidth;
        const oh = other.el.offsetHeight;
        const ox = other.x;
        const oy = other.y;
        const penX = Math.min(cx + w, ox + ow) - Math.max(cx, ox);
        const penY = Math.min(cy + h, oy + oh) - Math.max(cy, oy);
        if (penX <= 0 || penY <= 0) continue;
        changed = true;
        if (penX <= penY) {
          if (cx + w / 2 <= ox + ow / 2) cx = ox - w;
          else cx = ox + ow;
        } else {
          if (cy + h / 2 <= oy + oh / 2) cy = oy - h;
          else cy = oy + oh;
        }
      }
      if (!changed) break;
    }
    return { x: Math.round(cx), y: Math.round(cy) };
  }

  /**
   * Плавное скольжение вдоль препятствий: сначала одна ось, потом вторая (как у стен в платформерах).
   * Вместе с малым шагом по pointermove убирает рывки на углах.
   */
  function resolveDragSlide(movingId, cx, cy, targetX, targetY, w, h) {
    const adx = Math.abs(targetX - cx);
    const ady = Math.abs(targetY - cy);
    if (adx >= ady) {
      const s1 = resolveCardCollisions(movingId, targetX, cy, w, h);
      return resolveCardCollisions(movingId, s1.x, targetY, w, h);
    }
    const s1 = resolveCardCollisions(movingId, cx, targetY, w, h);
    return resolveCardCollisions(movingId, targetX, s1.y, w, h);
  }

  /** Координаты точки связи на карточке (мировые пиксели поля). */
  function portPoint(el, port) {
    const r = el.getBoundingClientRect();
    if (port === "top") return fieldCoordsFromClient(r.left + r.width / 2, r.top);
    if (port === "bottom") return fieldCoordsFromClient(r.left + r.width / 2, r.bottom);
    if (port === "left") return fieldCoordsFromClient(r.left, r.top + r.height / 2);
    if (port === "right") return fieldCoordsFromClient(r.right, r.top + r.height / 2);
    return fieldCoordsFromClient(r.left + r.width / 2, r.top + r.height / 2);
  }

  /** Упорядоченная пара id для супругов / узла. */
  function sortPair(a, b) {
    return a < b ? { a, b } : { a: b, b: a };
  }

  /**
   * Точка на пунктирной линии пары — середина кривой (t = 0.5 у того же кубика, что и spouse-path).
   * От неё рисуем линии ко всем детям пары.
   */
  function spouseUnionAnchorField(cA, cB) {
    const ax = cA.x + cA.el.offsetWidth / 2;
    const bx = cB.x + cB.el.offsetWidth / 2;
    const leftC = ax <= bx ? cA : cB;
    const rightC = leftC === cA ? cB : cA;
    const pL = portPoint(leftC.el, "right");
    const pR = portPoint(rightC.el, "left");
    return { x: (pL.x + pR.x) / 2, y: (pL.y + pR.y) / 2 };
  }

  function cardCenterY(cardId) {
    const c = getCardById(cardId);
    if (!c) return 0;
    return c.y + c.el.offsetHeight / 2;
  }

  function redrawLines() {
    const ns = "http://www.w3.org/2000/svg";
    linesLayer.innerHTML = "";
    for (const L of links) {
      const kind = L.kind || "lineage";
      if (kind === "lineage") {
        const a = getCardById(L.from);
        const b = getCardById(L.to);
        if (!a || !b) continue;
        const p1 = portPoint(a.el, "bottom");
        const p2 = portPoint(b.el, "top");
        const path = document.createElementNS(ns, "path");
        const midX = (p1.x + p2.x) / 2;
        const d = `M ${p1.x} ${p1.y} C ${midX} ${p1.y}, ${midX} ${p2.y}, ${p2.x} ${p2.y}`;
        path.setAttribute("d", d);
        path.setAttribute("class", "lines-layer-path lines-layer-path--lineage");
        linesLayer.appendChild(path);
        appendLinkHitPath(d, { kind: "lineage", from: L.from, to: L.to });
        continue;
      }
      if (kind === "spouse") {
        const cA = getCardById(L.a);
        const cB = getCardById(L.b);
        if (!cA || !cB) continue;
        const ax = cA.x + cA.el.offsetWidth / 2;
        const bx = cB.x + cB.el.offsetWidth / 2;
        const leftC = ax <= bx ? cA : cB;
        const rightC = leftC === cA ? cB : cA;
        const p1 = portPoint(leftC.el, "right");
        const p2 = portPoint(rightC.el, "left");
        const path = document.createElementNS(ns, "path");
        const midY = (p1.y + p2.y) / 2;
        const d = `M ${p1.x} ${p1.y} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y}`;
        path.setAttribute("d", d);
        path.setAttribute("class", "lines-layer-path lines-layer-path--spouse");
        linesLayer.appendChild(path);
        appendLinkHitPath(d, { kind: "spouse", a: L.a, b: L.b });
        continue;
      }
      if (kind === "childOfUnion") {
        const cA = getCardById(L.a);
        const cB = getCardById(L.b);
        const child = getCardById(L.child);
        if (!cA || !cB || !child) continue;
        const anchor = spouseUnionAnchorField(cA, cB);
        const pTop = portPoint(child.el, "top");
        const path = document.createElementNS(ns, "path");
        const midX = (anchor.x + pTop.x) / 2;
        const d = `M ${anchor.x} ${anchor.y} C ${midX} ${anchor.y}, ${midX} ${pTop.y}, ${pTop.x} ${pTop.y}`;
        path.setAttribute("d", d);
        path.setAttribute("class", "lines-layer-path lines-layer-path--lineage");
        linesLayer.appendChild(path);
        appendLinkHitPath(d, { kind: "childOfUnion", a: L.a, b: L.b, child: L.child });
      }
    }
    syncUnionNodes();
  }

  function syncUnionNodes() {
    cardsLayer.querySelectorAll(".union-node").forEach((n) => n.remove());
    for (const L of links) {
      if (L.kind !== "spouse") continue;
      const cA = getCardById(L.a);
      const cB = getCardById(L.b);
      if (!cA || !cB) continue;
      const anchor = spouseUnionAnchorField(cA, cB);
      const wrap = document.createElement("div");
      wrap.className = "union-node";
      wrap.style.left = `${anchor.x}px`;
      wrap.style.top = `${anchor.y}px`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "union-port card-port";
      btn.setAttribute(
        "aria-label",
        "Дети от пары: нажмите и ведите к верхней точке карточки ребёнка; можно привязать несколько карточек подряд"
      );
      btn.dataset.unionA = L.a;
      btn.dataset.unionB = L.b;
      wrap.appendChild(btn);
      cardsLayer.appendChild(wrap);
      btn.addEventListener("pointerdown", (ev) => onUnionPortPointerDown(ev, L.a, L.b));
    }
  }

  function updatePendingClass() {
    document.querySelectorAll(".card-port.is-armed, .union-port.is-armed").forEach((p) => {
      p.classList.remove("is-armed");
    });
    if (!pendingLink) return;
    if (pendingLink.union) {
      const { a, b } = pendingLink.union;
      const btn = cardsLayer.querySelector(`.union-port[data-union-a="${a}"][data-union-b="${b}"]`);
      btn?.classList.add("is-armed");
      return;
    }
    if (!pendingLink.cardId || !pendingLink.port) return;
    const card = getCardById(pendingLink.cardId);
    const sel = `.card-port--${pendingLink.port}`;
    card?.el.querySelector(sel)?.classList.add("is-armed");
  }

  function setPending(next) {
    pendingLink = next;
    updatePendingClass();
  }

  function addLineageLink(fromId, toId) {
    if (fromId === toId) return;
    const dup = links.some((l) => (l.kind || "lineage") === "lineage" && l.from === fromId && l.to === toId);
    if (!dup) links.push({ kind: "lineage", from: fromId, to: toId });
    redrawLines();
    if (!dup) scheduleSaveProject();
  }

  function addSpouseLink(idA, idB) {
    if (idA === idB) return;
    const { a, b } = sortPair(idA, idB);
    const dup = links.some((l) => l.kind === "spouse" && l.a === a && l.b === b);
    if (!dup) links.push({ kind: "spouse", a, b });
    redrawLines();
    if (!dup) scheduleSaveProject();
  }

  function addChildOfUnionLink(idA, idB, childId) {
    const { a, b } = sortPair(idA, idB);
    const dup = links.some((l) => l.kind === "childOfUnion" && l.a === a && l.b === b && l.child === childId);
    if (!dup) links.push({ kind: "childOfUnion", a, b, child: childId });
    redrawLines();
    if (!dup) scheduleSaveProject();
  }

  function hideLinkDeleteBanner() {
    pendingLinkDeletePayload = null;
    if (linkDeleteBanner) {
      linkDeleteBanner.hidden = true;
      linkDeleteBanner.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * @param {{ kind: string, from?: string, to?: string, a?: string, b?: string, child?: string }} payload
   */
  function showLinkDeleteBanner(payload) {
    if (!linkDeleteBanner || !linkDeleteBannerText) return;
    setPending(null);
    pendingLinkDeletePayload = payload;
    let msg = "Удалить эту связь?";
    if (payload.kind === "lineage") msg = "Удалить родственную связь (родитель — ребёнок)?";
    else if (payload.kind === "spouse") msg = "Удалить связь супружества?";
    else if (payload.kind === "childOfUnion") msg = "Удалить связь ребёнка с парой родителей?";
    linkDeleteBannerText.textContent = msg;
    linkDeleteBanner.hidden = false;
    linkDeleteBanner.setAttribute("aria-hidden", "false");
  }

  /**
   * @param {{ kind: string, from?: string, to?: string, a?: string, b?: string, child?: string }} payload
   */
  function removeLink(payload) {
    const k = payload.kind;
    if (k === "lineage") {
      links = links.filter(
        (l) => !((l.kind || "lineage") === "lineage" && l.from === payload.from && l.to === payload.to),
      );
    } else if (k === "spouse") {
      links = links.filter((l) => !(l.kind === "spouse" && l.a === payload.a && l.b === payload.b));
    } else if (k === "childOfUnion") {
      links = links.filter(
        (l) =>
          !(
            l.kind === "childOfUnion" &&
            l.a === payload.a &&
            l.b === payload.b &&
            l.child === payload.child
          ),
      );
    }
    hideLinkDeleteBanner();
    redrawLines();
    scheduleSaveProject();
  }

  function appendLinkHitPath(d, payload) {
    const ns = "http://www.w3.org/2000/svg";
    const hit = document.createElementNS(ns, "path");
    hit.setAttribute("d", d);
    hit.setAttribute("fill", "none");
    hit.setAttribute("class", "lines-layer-hit");
    hit.dataset.link = JSON.stringify(payload);
    linesLayer.appendChild(hit);
  }

  function onUnionPortPointerDown(ev, idA, idB) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const { a, b } = sortPair(idA, idB);

    if (!pendingLink) {
      setPending({ union: { a, b } });
      return;
    }

    if (pendingLink.union && pendingLink.union.a === a && pendingLink.union.b === b) {
      setPending(null);
      return;
    }

    if (pendingLink.cardId && pendingLink.port === "top" && !pendingLink.union) {
      addChildOfUnionLink(a, b, pendingLink.cardId);
      setPending({ union: { a, b } });
      return;
    }

    setPending({ union: { a, b } });
  }

  /** Второй клик по точке: завершить или сменить ожидание. */
  function onPortPointerDown(ev, cardId, port) {
    if (ev.button !== 0) return;
    const c = getCardById(cardId);
    if (c?.el.classList.contains("family-card--pinned")) return;
    ev.preventDefault();
    ev.stopPropagation();

    if (pendingLink?.union) {
      if (port === "top") {
        addChildOfUnionLink(pendingLink.union.a, pendingLink.union.b, cardId);
        setPending({ union: { a: pendingLink.union.a, b: pendingLink.union.b } });
        return;
      }
      setPending({ cardId, port });
      return;
    }

    if (!pendingLink) {
      setPending({ cardId, port });
      return;
    }

    if (pendingLink.cardId === cardId && pendingLink.port === port) {
      setPending(null);
      return;
    }

    const a = pendingLink.cardId;
    const b = cardId;
    const pa = pendingLink.port;
    const pb = port;

    const spousePair =
      (pa === "right" && pb === "left") ||
      (pa === "left" && pb === "right") ||
      (pa === "right" && pb === "right") ||
      (pa === "left" && pb === "left");
    if (spousePair && (pa === "right" || pa === "left") && (pb === "right" || pb === "left")) {
      if ((pa === "right" && pb === "left") || (pa === "left" && pb === "right")) {
        addSpouseLink(a, b);
        setPending(null);
        return;
      }
      setPending({ cardId, port });
      return;
    }

    let fromId;
    let toId;
    if (pa === "bottom" && pb === "top") {
      fromId = a;
      toId = b;
    } else if (pa === "top" && pb === "bottom") {
      fromId = b;
      toId = a;
    } else {
      const yA = cardCenterY(a);
      const yB = cardCenterY(b);
      if (yA < yB) {
        fromId = a;
        toId = b;
      } else {
        fromId = b;
        toId = a;
      }
    }

    addLineageLink(fromId, toId);
    setPending(null);
  }

  function removeCard(id) {
    if (editingCardId === id) closeEditCardPanel();
    cards = cards.filter((c) => c.id !== id);
    links = links.filter((l) => {
      const kind = l.kind || "lineage";
      if (kind === "lineage") return l.from !== id && l.to !== id;
      if (kind === "spouse") return l.a !== id && l.b !== id;
      if (kind === "childOfUnion") return l.a !== id && l.b !== id && l.child !== id;
      return true;
    });
    const el = document.getElementById(id);
    el?.remove();
    if (pendingLink?.cardId === id) setPending(null);
    if (pendingLink?.union && (pendingLink.union.a === id || pendingLink.union.b === id)) setPending(null);
    redrawLines();
    scheduleSyncUnknownCardsMinHeight();
    scheduleSaveProject();
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || !o.completed || typeof o.fio !== "string" || !String(o.fio).trim()) return null;
      return {
        ...o,
        fio: String(o.fio).trim(),
        birth: typeof o.birth === "string" ? o.birth : "",
        birthPlace: typeof o.birthPlace === "string" ? o.birthPlace : "",
      };
    } catch {
      return null;
    }
  }

  function saveProfile(data) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
  }

  function formatProjectSavedAt(ts) {
    if (ts == null || Number.isNaN(+ts)) return "—";
    return new Date(+ts).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function updateProjectTitleUI() {
    if (projectTitleBtn) projectTitleBtn.textContent = currentProjectName || "Проект";
  }

  function updateToolbarProjectVisibility() {
    if (toolbarProjectTools) {
      toolbarProjectTools.hidden = !apiAvailable || currentProjectId == null;
    }
  }

  function applyProjectDisplayMeta(data) {
    if (!data) return;
    if (data.name != null && String(data.name).trim() !== "") {
      currentProjectName = String(data.name).trim();
    }
    if (data.updated_at != null) lastProjectUpdatedAt = +data.updated_at;
    updateProjectTitleUI();
  }

  function closeStatsPanel() {
    if (statsOverlay) statsOverlay.hidden = true;
  }

  function openStatsPanel() {
    if (!statsOverlay) return;
    statsOverlay.hidden = false;
    if (statsCardCount) statsCardCount.textContent = String(cards.length);
    if (statsLinkCount) statsLinkCount.textContent = String(links.length);
    if (statsUpdatedAt) statsUpdatedAt.textContent = formatProjectSavedAt(lastProjectUpdatedAt);
    if (statsProjectNameInput) statsProjectNameInput.value = currentProjectName;
  }

  /** Обновить цифры в открытой статистике без сброса поля названия, если пользователь в нём печатает. */
  function syncStatsPanelIfOpen() {
    if (!statsOverlay || statsOverlay.hidden) return;
    if (statsCardCount) statsCardCount.textContent = String(cards.length);
    if (statsLinkCount) statsLinkCount.textContent = String(links.length);
    if (statsUpdatedAt) statsUpdatedAt.textContent = formatProjectSavedAt(lastProjectUpdatedAt);
    if (statsProjectNameInput && document.activeElement !== statsProjectNameInput) {
      statsProjectNameInput.value = currentProjectName;
    }
  }

  function clearProjectDom() {
    closeStatsPanel();
    closeNewCardPanel();
    closeEditCardPanel();
    setPending(null);
    cardsLayer.querySelectorAll(".family-card").forEach((el) => el.remove());
    cardsLayer.querySelectorAll(".union-node").forEach((n) => n.remove());
    cards = [];
    links = [];
    linesLayer.innerHTML = "";
  }

  function serializeProject() {
    return {
      name: currentProjectName.trim() || "Без названия",
      fieldW,
      fieldH,
      camX,
      camY,
      zoom,
      profile: loadProfile(),
      cards: cards.map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        fio: c.fio,
        birth: c.birth,
        birthPlace: c.birthPlace ?? "",
        title: c.title ?? "",
        pinned: !!c.pinned,
        ...(c.isUnknown ? { unknown: true } : {}),
      })),
      links: links.map((l) => JSON.parse(JSON.stringify(l))),
    };
  }

  function loadProjectState(data) {
    loadingProject = true;
    try {
      clearProjectDom();
      const fw = Math.round(+data.fieldW);
      const fh = Math.round(+data.fieldH);
      if (fw > 0 && fh > 0) {
        fieldW = Math.max(320, fw);
        fieldH = Math.max(240, fh);
      } else {
        updateFieldSize();
      }
      cardsLayer.style.width = `${fieldW}px`;
      cardsLayer.style.height = `${fieldH}px`;
      linesLayer.style.width = `${fieldW}px`;
      linesLayer.style.height = `${fieldH}px`;

      camX = +data.camX || 0;
      camY = +data.camY || 0;
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +data.zoom || 1));

      if (data.profile) {
        saveProfile(data.profile);
      }

      links = Array.isArray(data.links) ? data.links : [];
      const list = Array.isArray(data.cards) ? data.cards : [];
      for (const c of list) {
        addCard(c.x ?? 0, c.y ?? 0, {
          id: c.id,
          fio: c.fio || "",
          birth: c.birth || "",
          birthPlace: c.birthPlace ?? "",
          title: c.title ?? "",
          pinned: !!c.pinned,
          isUnknown: !!(c.unknown || c.isUnknown),
        });
      }

      if (data.id != null) currentProjectId = +data.id;
      applyProjectDisplayMeta(data);

      applyViewTransform();
      redrawLines();
      requestAnimationFrame(() => scheduleSyncUnknownCardsMinHeight());
      welcomeOverlay.hidden = true;
      fabAdd.hidden = false;
      updateToolbarProjectVisibility();
    } finally {
      loadingProject = false;
    }
  }

  async function ensureFirstProjectCreated() {
    if (projectBootstrapOverlay) projectBootstrapOverlay.hidden = false;
    if (projectBootstrapStatus) projectBootstrapStatus.textContent = "Создаём проект…";
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Мой проект" }),
      });
      if (!r.ok) throw new Error("post");
      const j = await r.json();
      currentProjectId = j.id;
      currentProjectName = j.name || "Мой проект";
      lastProjectUpdatedAt = j.updated_at != null ? +j.updated_at : Date.now();
      localStorage.setItem(LS_LAST_PROJECT, String(currentProjectId));
      updateProjectTitleUI();
    } catch {
      alert("Не удалось создать проект. Проверьте, что сервер запущен (npm start).");
      currentProjectId = null;
    } finally {
      if (projectBootstrapOverlay) projectBootstrapOverlay.hidden = true;
    }
  }

  async function openProjectById(id) {
    if (!apiAvailable || !id) return;
    try {
      const r = await fetch(`/api/projects/${id}`);
      if (!r.ok) return;
      const data = await r.json();
      currentProjectId = id;
      localStorage.setItem(LS_LAST_PROJECT, String(id));
      loadProjectState(data);
    } catch {
      /* ignore */
    }
    updateToolbarProjectVisibility();
  }

  async function saveProjectToServer() {
    clearTimeout(saveProjectTimer);
    saveProjectTimer = null;
    if (!apiAvailable) return;
    let id = currentProjectId;
    const body = serializeProject();
    if (!id) {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: body.name }),
      });
      if (!r.ok) {
        alert("Не удалось создать проект на сервере.");
        return;
      }
      const j = await r.json();
      id = j.id;
      currentProjectId = id;
      localStorage.setItem(LS_LAST_PROJECT, String(id));
      if (j.updated_at != null) lastProjectUpdatedAt = +j.updated_at;
      updateProjectTitleUI();
      updateToolbarProjectVisibility();
    }
    const put = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!put.ok) {
      alert("Не удалось сохранить проект.");
      return;
    }
    try {
      const putJson = await put.json();
      if (putJson.updated_at != null) lastProjectUpdatedAt = +putJson.updated_at;
    } catch {
      /* ignore */
    }
    syncStatsPanelIfOpen();
  }

  function scheduleSaveProject() {
    if (!apiAvailable || currentProjectId == null || loadingProject) return;
    clearTimeout(saveProjectTimer);
    saveProjectTimer = window.setTimeout(() => {
      saveProjectTimer = null;
      if (!apiAvailable || currentProjectId == null || loadingProject) return;
      void saveProjectToServer();
    }, SAVE_DEBOUNCE_MS);
  }

  async function initApp() {
    projectTitleBtn?.addEventListener("click", () => {
      if (!apiAvailable || currentProjectId == null) return;
      openStatsPanel();
    });

    statsOverlay?.addEventListener("click", (ev) => {
      if (ev.target === statsOverlay) closeStatsPanel();
    });

    statsPanel?.addEventListener("click", (ev) => ev.stopPropagation());

    statsProjectNameInput?.addEventListener("input", () => {
      if (!apiAvailable || currentProjectId == null || loadingProject) return;
      const name = (statsProjectNameInput.value ?? "").trim();
      currentProjectName = name || "Без названия";
      updateProjectTitleUI();
      scheduleSaveProject();
    });

    try {
      const h = await fetch("/api/health");
      apiAvailable = !!h.ok;
    } catch {
      apiAvailable = false;
    }

    updateToolbarProjectVisibility();

    if (apiAvailable) {
      try {
        const res = await fetch("/api/projects");
        const list = await res.json();
        if (list.length > 0) {
          const want = localStorage.getItem(LS_LAST_PROJECT);
          const pick =
            want && list.some((p) => String(p.id) === want) ? +want : list[0].id;
          await openProjectById(pick);
          return;
        }
        await ensureFirstProjectCreated();
      } catch {
        apiAvailable = false;
      }
    }

    updateToolbarProjectVisibility();
    initWelcome();
  }

  /** Карточка «Я» в центре поля; камера смотрит на неё (центр экрана). */
  function placeSelfCardCenter(fio, birth, birthPlace) {
    updateFieldSize();
    zoom = 1;
    camX = fieldW / 2;
    camY = fieldH / 2;
    applyViewTransform();
    let x = Math.round(fieldW / 2 - CARD_W_EST / 2);
    let y = Math.round(fieldH / 2 - CARD_H_EST / 2);
    x = Math.max(0, Math.min(fieldW - CARD_W_EST, x));
    y = Math.max(0, Math.min(fieldH - CARD_H_EST, y));
    const id = addCard(x, y, { id: SELF_CARD_ID, fio, birth, birthPlace: birthPlace ?? "" });
    requestAnimationFrame(() => {
      const c = getCardById(id);
      if (!c) return;
      const cw = c.el.offsetWidth;
      const ch = c.el.offsetHeight;
      c.x = Math.round(fieldW / 2 - cw / 2);
      c.y = Math.round(fieldH / 2 - ch / 2);
      c.x = Math.max(0, Math.min(fieldW - cw, c.x));
      c.y = Math.max(0, Math.min(fieldH - ch, c.y));
      c.el.style.left = `${c.x}px`;
      c.el.style.top = `${c.y}px`;
      camX = c.x + cw / 2;
      camY = c.y + ch / 2;
      applyViewTransform();
      redrawLines();
      scheduleSyncUnknownCardsMinHeight();
      scheduleSaveProject();
    });
    return id;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {{ title?: string, fio?: string, birth?: string, birthPlace?: string, id?: string, pinned?: boolean, isUnknown?: boolean }} [opts]
   */
  function addCard(x, y, opts) {
    opts = opts || {};
    const id = opts.id || uid();
    const title = opts.title != null ? opts.title : "";
    const fio = opts.fio != null ? opts.fio : "";
    const birth = opts.birth != null ? opts.birth : "";
    const birthPlace = opts.birthPlace != null ? opts.birthPlace : "";
    const pinnedInit = !!opts.pinned;
    const isUnknown = !!opts.isUnknown && id !== SELF_CARD_ID;

    const el = document.createElement("article");
    el.className = "family-card" + (id === SELF_CARD_ID ? " family-card--self" : "");
    el.id = id;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    el.innerHTML = `
      <button type="button" class="card-port card-port--top" data-port="top" aria-label="Точка связи сверху"></button>
      <button type="button" class="card-port card-port--left" data-port="left" aria-label="Точка связи слева (пара)"></button>
      <button type="button" class="card-port card-port--right" data-port="right" aria-label="Точка связи справа (пара)"></button>
      <div class="card-drag" data-drag-handle>
        <button type="button" class="card-icon-btn card-pin" aria-pressed="false" title="Закрепить">
          <img class="card-icon-img" src="public/icons/pin.png" width="18" height="18" alt="" />
        </button>
        <span class="card-drag-label"></span>
        <div class="card-drag-actions">
          <button type="button" class="card-icon-btn card-edit" title="Редактировать карточку" aria-label="Редактировать карточку">
            <img class="card-icon-img" src="public/icons/edit.png" width="18" height="18" alt="" />
          </button>
          <button type="button" class="card-icon-btn card-remove" title="Удалить карточку">
            <img class="card-icon-img" src="public/icons/garbage.png" width="18" height="18" alt="" />
          </button>
        </div>
      </div>
      <div class="card-body">
        <button type="button" class="card-unknown-layer" hidden aria-label="Указать данные человека">
          <span class="card-unknown-placeholder">Пока неизвестно</span>
        </button>
        <div class="card-standard-fields">
          <div class="card-field card-field--fio">
            <span class="card-field-label">ФИО</span>
            <div class="card-fio-lines" data-fio-lines>
              <span class="card-fio-line" data-fio-line></span>
              <span class="card-fio-line" data-fio-line></span>
              <span class="card-fio-line" data-fio-line></span>
            </div>
          </div>
          <div class="card-field">
            <span class="card-field-label">Дата рождения</span>
            <div class="card-field-value" data-display-birth></div>
          </div>
          <div class="card-field">
            <span class="card-field-label">Место рождения</span>
            <div class="card-field-value" data-display-birth-place></div>
          </div>
        </div>
      </div>
    `;

    const handle = el.querySelector("[data-drag-handle]");
    const labelEl = el.querySelector(".card-drag-label");
    if (labelEl) {
      labelEl.textContent = title;
      if (title) handle.classList.add("card-drag--labeled");
    }

    const btnPin = el.querySelector(".card-pin");
    const btnRemove = el.querySelector(".card-remove");
    const btnEdit = el.querySelector(".card-edit");
    const portTop = el.querySelector(".card-port--top");
    const portLeft = el.querySelector(".card-port--left");
    const portRight = el.querySelector(".card-port--right");

    function setCardPinned(on) {
      el.classList.toggle("family-card--pinned", on);
      btnPin?.setAttribute("aria-pressed", on ? "true" : "false");
      btnPin?.classList.toggle("is-active", on);
      if (btnPin) btnPin.title = on ? "Снять закрепление" : "Закрепить";
      const rec = getCardById(id);
      if (rec) rec.pinned = on;
    }

    btnPin.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    btnPin.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setCardPinned(!el.classList.contains("family-card--pinned"));
      scheduleSaveProject();
    });

    btnRemove.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    btnRemove.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!confirm("Удалить эту карточку?")) return;
      removeCard(id);
    });

    btnEdit?.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    btnEdit?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openEditCardPanel(id);
    });

    const unknownLayer = el.querySelector(".card-unknown-layer");
    unknownLayer?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openEditCardPanel(id);
    });

    portTop.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      onPortPointerDown(ev, id, "top");
    });
    portLeft.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      onPortPointerDown(ev, id, "left");
    });
    portRight.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      onPortPointerDown(ev, id, "right");
    });

    handle.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      if (el.classList.contains("family-card--pinned")) return;
      if (ev.target.closest(".card-icon-btn")) return;
      ev.preventDefault();
      ev.stopPropagation();
      const card = getCardById(id);
      if (!card) return;
      el.classList.add("dragging");
      const m0 = fieldCoordsFromClient(ev.clientX, ev.clientY);
      const grabOffsetX = m0.x - card.x;
      const grabOffsetY = m0.y - card.y;
      dragState = { id, grabOffsetX, grabOffsetY };

      const onMove = (e2) => {
        if (!dragState || dragState.id !== id) return;
        const m = fieldCoordsFromClient(e2.clientX, e2.clientY);
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const targetX = m.x - dragState.grabOffsetX;
        const targetY = m.y - dragState.grabOffsetY;
        const resolved = resolveDragSlide(id, card.x, card.y, targetX, targetY, w, h);
        card.x = resolved.x;
        card.y = resolved.y;
        el.style.left = `${card.x}px`;
        el.style.top = `${card.y}px`;
        redrawLines();
      };

      const onUp = () => {
        el.classList.remove("dragging");
        dragState = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        scheduleSaveProject();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });

    cardsLayer.appendChild(el);
    cards.push({ id, el, x, y, fio, birth, birthPlace, title, pinned: pinnedInit, isUnknown });
    applyCardVisualUnknown(el, isUnknown);
    setCardDisplayFields(el, fio, birth, birthPlace);
    if (pinnedInit) setCardPinned(true);

    redrawLines();
    scheduleSaveProject();
    return id;
  }

  function initWelcome() {
    const profile = loadProfile();
    if (profile) {
      welcomeOverlay.hidden = true;
      fabAdd.hidden = false;
      placeSelfCardCenter(profile.fio, profile.birth, profile.birthPlace);
    } else {
      welcomeOverlay.hidden = false;
      fabAdd.hidden = true;
      welcomeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const fioEl = document.getElementById("welcome-fio");
        const birthEl = document.getElementById("welcome-birth");
        const birthPlaceEl = document.getElementById("welcome-birth-place");
        const fio = fioEl.value.trim();
        const birth = birthEl ? birthEl.value : "";
        const birthPlace = birthPlaceEl ? birthPlaceEl.value.trim() : "";
        if (!fio) return;
        saveProfile({ completed: true, fio, birth, birthPlace });
        welcomeOverlay.hidden = true;
        fabAdd.hidden = false;
        placeSelfCardCenter(fio, birth, birthPlace);
      });
      setTimeout(() => document.getElementById("welcome-fio")?.focus(), 0);
    }
  }

  fabAdd.addEventListener("click", () => openNewCardPanel());
  newCardBackdrop.addEventListener("click", () => closeNewCardPanel());
  for (const fid of ["panel-fio", "panel-birth", "panel-birth-place"]) {
    const inp = document.getElementById(fid);
    inp?.addEventListener("input", syncNewCardSubmitLabel);
    inp?.addEventListener("change", syncNewCardSubmitLabel);
  }
  newCardForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fio = document.getElementById("panel-fio").value.trim();
    const birth = document.getElementById("panel-birth")?.value ?? "";
    const birthPlace = document.getElementById("panel-birth-place")?.value?.trim() ?? "";
    const allEmpty = !fio && !birth && !birthPlace;
    if (!allEmpty && !fio) return;
    const pos = centerViewportForNewCard();
    const id = allEmpty
      ? addCard(pos.x, pos.y, { isUnknown: true })
      : addCard(pos.x, pos.y, { fio, birth, birthPlace });
    closeNewCardPanel();
    requestAnimationFrame(() => {
      const c = getCardById(id);
      if (!c) return;
      const cw = c.el.offsetWidth;
      const ch = c.el.offsetHeight;
      let nx = Math.round(camX - cw / 2);
      let ny = Math.round(camY - ch / 2);
      const resolved = resolveCardCollisions(id, nx, ny, cw, ch);
      c.x = resolved.x;
      c.y = resolved.y;
      c.el.style.left = `${c.x}px`;
      c.el.style.top = `${c.y}px`;
      redrawLines();
      scheduleSaveProject();
    });
  });

  editCardCancel?.addEventListener("click", () => closeEditCardPanel());
  editCardBackdrop?.addEventListener("click", () => closeEditCardPanel());
  editCardForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!editingCardId) return;
    const fio = document.getElementById("edit-panel-fio")?.value.trim() ?? "";
    const birth = document.getElementById("edit-panel-birth")?.value ?? "";
    const birthPlace = document.getElementById("edit-panel-birth-place")?.value?.trim() ?? "";
    const c = getCardById(editingCardId);
    if (!c) {
      closeEditCardPanel();
      return;
    }
    if (editingCardId === SELF_CARD_ID && !fio) return;
    const empty = !fio && !birth && !birthPlace;
    if (empty) {
      if (editingCardId === SELF_CARD_ID) return;
      c.isUnknown = true;
      c.fio = "";
      c.birth = "";
      c.birthPlace = "";
      applyCardVisualUnknown(c.el, true);
    } else {
      if (!fio) return;
      c.isUnknown = false;
      c.fio = fio;
      c.birth = birth;
      c.birthPlace = birthPlace;
      applyCardVisualUnknown(c.el, false);
      setCardDisplayFields(c.el, fio, birth, birthPlace);
    }
    if (editingCardId === SELF_CARD_ID) {
      saveProfile({ completed: true, fio: c.fio, birth: c.birth, birthPlace: c.birthPlace });
    }
    closeEditCardPanel();
    requestAnimationFrame(() => {
      redrawLines();
      scheduleSaveProject();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (linkDeleteBanner && !linkDeleteBanner.hidden) {
      hideLinkDeleteBanner();
      return;
    }
    if (statsOverlay && !statsOverlay.hidden) {
      closeStatsPanel();
      return;
    }
    if (editCardPanel.classList.contains("is-open")) {
      closeEditCardPanel();
      return;
    }
    if (newCardPanel.classList.contains("is-open")) {
      closeNewCardPanel();
    }
  });

  viewport.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      zoomWheelAtClient(ev.clientX, ev.clientY, ev.deltaY);
    },
    { passive: false }
  );

  linesLayer.addEventListener("pointerdown", (ev) => {
    const rawTarget = ev.target;
    const hit =
      rawTarget && typeof rawTarget.closest === "function"
        ? rawTarget.closest(".lines-layer-hit")
        : null;
    if (!hit) return;
    ev.preventDefault();
    ev.stopPropagation();
    const rawJson = hit.getAttribute("data-link") || hit.dataset?.link || "{}";
    let payload;
    try {
      payload = JSON.parse(rawJson);
    } catch {
      return;
    }
    if (!payload.kind) return;
    showLinkDeleteBanner(payload);
  });

  linkDeleteCancel?.addEventListener("click", () => hideLinkDeleteBanner());
  linkDeleteConfirm?.addEventListener("click", () => {
    if (!pendingLinkDeletePayload) return;
    removeLink(pendingLinkDeletePayload);
  });

  viewport.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (ev.target.closest(".family-card")) return;
    if (ev.target.closest(".map-zoom-tools")) return;
    if (ev.target.closest(".lines-layer-hit")) return;
    panPointer = { pointerId: ev.pointerId, lx: ev.clientX, ly: ev.clientY };
    try {
      viewport.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  });

  viewport.addEventListener("pointermove", (ev) => {
    if (!panPointer || ev.pointerId !== panPointer.pointerId) return;
    const dx = ev.clientX - panPointer.lx;
    const dy = ev.clientY - panPointer.ly;
    panPointer.lx = ev.clientX;
    panPointer.ly = ev.clientY;
    camX -= dx / zoom;
    camY -= dy / zoom;
    applyViewTransform();
    redrawLines();
  });

  function endPan(ev) {
    if (!panPointer || ev.pointerId !== panPointer.pointerId) return;
    panPointer = null;
    try {
      viewport.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    scheduleSaveProject();
  }

  viewport.addEventListener("pointerup", endPan);
  viewport.addEventListener("pointercancel", endPan);

  zoomInBtn?.addEventListener("click", () => zoomBy(1.15));
  zoomOutBtn?.addEventListener("click", () => zoomBy(1 / 1.15));

  const roViewport = new ResizeObserver(() => updateFieldSize());
  roViewport.observe(viewport);

  const ro = new ResizeObserver(() => redrawLines());
  ro.observe(cardsLayer);

  attachBirthPlaceSuggestions();
  initApp();
})();
