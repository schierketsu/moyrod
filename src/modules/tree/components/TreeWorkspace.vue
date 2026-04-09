<template>
  <div class="field-stage">
    <div v-if="store.apiAvailable && store.currentProjectId == null" class="no-project-overlay">
      <div class="no-project-panel">
        <h2 class="no-project-title">Нет проектов</h2>
        <p class="no-project-text">Создайте проект в разделе «Мой профиль».</p>
        <button type="button" class="btn primary" @click="goMyProfile">Мой профиль</button>
      </div>
    </div>
    <main
      ref="viewportRef"
      class="viewport"
      @wheel="onWheel"
      @pointerdown="onViewportPointerDown"
      @pointermove="onViewportPointerMove"
      @pointerup="onViewportPointerUp"
      @pointercancel="onViewportPointerUp"
    >
      <div ref="mapWorldRef" class="map-world" :style="{ ...worldStyle, width: `${store.fieldW}px`, height: `${store.fieldH}px` }">
        <svg class="surname-clouds-layer" :width="store.fieldW" :height="store.fieldH" aria-hidden="true">
          <path
            v-for="cloud in surnameClouds"
            :key="cloud.key"
            class="surname-cloud-path"
            :d="cloud.d"
            :fill="cloud.color"
            fill-rule="evenodd"
          />
        </svg>
        <svg class="lines-layer" :width="store.fieldW" :height="store.fieldH" aria-hidden="true">
          <g v-for="line in linksPath" :key="line.key">
            <!-- Атрибуты stroke/fill (не только CSS): в снимке foreignObject так стабильнее, чем таблица стилей -->
            <path
              :d="line.d"
              fill="none"
              stroke="#5b3a29"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              pointer-events="none"
              :stroke-opacity="linkLineStrokeOpacity(line)"
              :stroke-dasharray="linkLineStrokeDasharray(line)"
              :class="line.className || 'lines-layer-path'"
            />
            <path
              :d="line.d"
              fill="none"
              stroke="transparent"
              stroke-width="22"
              stroke-linecap="round"
              pointer-events="visibleStroke"
              class="lines-layer-hit"
              style="cursor: pointer"
              @pointerdown.stop.prevent="store.requestLinkDelete(line.payload)"
            />
          </g>
        </svg>
        <div class="cards-layer" :style="{ width: `${store.fieldW}px`, height: `${store.fieldH}px` }">
          <article
            v-for="card in store.cards"
            :id="card.id"
            :key="card.id"
            class="family-card"
            :class="{
              'family-card--self': isSelfCard(card.id),
              'family-card--pinned': card.pinned,
              'family-card--unknown': card.isUnknown,
              'family-card--selected': isCardSelected(card.id)
            }"
            :style="cardStyle(card)"
            @pointerdown="onCardPointerDown($event, card.id)"
          >
            <button
              v-if="!store.currentProjectReadOnly"
              class="card-port card-port--top"
              type="button"
              @pointerdown.stop="portDown(card.id, 'top')"
            />
            <button
              v-if="!store.currentProjectReadOnly"
              class="card-port card-port--left"
              type="button"
              @pointerdown.stop="portDown(card.id, 'left')"
            />
            <button
              v-if="!store.currentProjectReadOnly"
              class="card-port card-port--right"
              type="button"
              @pointerdown.stop="portDown(card.id, 'right')"
            />
            <div class="card-drag" :class="{ 'card-drag--labeled': !!card.title }" @pointerdown.prevent.stop="startDrag($event, card)">
              <button
                v-if="!store.currentProjectReadOnly"
                type="button"
                class="card-icon-btn card-pin"
                @click.stop="store.patchCard(card.id, { pinned: !card.pinned })"
              >
                <img class="card-icon-img" src="/icons/pin.png" width="18" height="18" alt="" />
              </button>
              <span class="card-drag-label">{{ card.title || "" }}</span>
              <div class="card-drag-actions">
                <button
                  v-if="!store.currentProjectReadOnly"
                  type="button"
                  class="card-icon-btn card-edit"
                  @click.stop="openEdit(card.id)"
                >
                  <img class="card-icon-img" src="/icons/edit.png" width="18" height="18" alt="" />
                </button>
                <button
                  v-if="!store.currentProjectReadOnly"
                  type="button"
                  class="card-icon-btn card-remove"
                  @click.stop="store.requestCardDelete(card.id)"
                >
                  <img class="card-icon-img" src="/icons/garbage.png" width="18" height="18" alt="" />
                </button>
              </div>
            </div>
            <div class="card-body">
              <div class="card-body-content">
                <button type="button" class="card-unknown-layer" :hidden="!card.isUnknown" @click.stop="openEdit(card.id)">
                  <span class="card-unknown-placeholder">Пока неизвестно</span>
                </button>
                <div class="card-standard-fields" :hidden="card.isUnknown">
                  <div class="card-field card-field--fio">
                    <span class="card-field-label">ФИО</span>
                    <div class="card-fio-lines" :class="{ 'card-field-value--uncertain': card.uncertainFio }">
                      <span
                        v-for="(line, idx) in splitFioLines(withMaidenName(card))"
                        :key="`${card.id}-fio-${idx}`"
                        class="card-fio-line"
                      >{{ line }}</span>
                    </div>
                  </div>
                  <div class="card-field">
                    <span class="card-field-label">Дата рождения</span>
                    <div class="card-field-value" :class="{ 'card-field-value--uncertain': card.uncertainBirth }">
                      {{ formatBirthDateRu(card.birth) || "—" }}
                    </div>
                  </div>
                  <div class="card-field">
                    <span class="card-field-label">Место рождения</span>
                    <div class="card-field-value" :class="{ 'card-field-value--uncertain': card.uncertainBirthPlace }">
                      {{ (card.birthPlace && String(card.birthPlace).trim()) || "—" }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="card-body-rail" aria-hidden="true">
                <span
                  v-if="card.gender === 'f' || card.gender === 'm'"
                  class="card-gender-marker"
                  :class="card.gender === 'f' ? 'card-gender-marker--f' : 'card-gender-marker--m'"
                ></span>
              </div>
              <button
                type="button"
                class="card-body-help"
                :aria-label="kinshipHelpTitle(card.id)"
                :title="kinshipHelpTitle(card.id)"
                @pointerdown.stop
                @click.stop
              >
                <img class="card-help-img" src="/icons/iconhelp.png" width="18" height="18" alt="" />
              </button>
            </div>
          </article>
        </div>
        <div
          v-if="!store.currentProjectReadOnly"
          v-for="u in unionNodes"
          :key="u.key"
          class="union-node"
          :style="{ left: `${u.x}px`, top: `${u.y}px` }"
        >
          <button
            type="button"
            class="union-port"
            :class="{ 'is-armed': pendingUnion && pendingUnion.a === u.a && pendingUnion.b === u.b }"
            @pointerdown.stop.prevent="armUnion(u.a, u.b)"
          ></button>
        </div>
        <div
          v-if="selectionBox.active"
          class="selection-box"
          :style="{
            left: `${selectionBox.left}px`,
            top: `${selectionBox.top}px`,
            width: `${selectionBox.width}px`,
            height: `${selectionBox.height}px`
          }"
        ></div>
      </div>
      <div class="map-zoom-tools" role="group" aria-label="Масштаб карты">
        <button type="button" class="map-zoom-btn" title="Приблизить" aria-label="Приблизить" @click="zoomBy(1.15)">+</button>
        <button type="button" class="map-zoom-btn" title="Отдалить" aria-label="Отдалить" @click="zoomBy(1 / 1.15)">−</button>
      </div>
    </main>
    <button
      v-if="store.currentProjectId && !store.currentProjectReadOnly"
      type="button"
      class="fab-save"
      aria-label="Сохранить проект"
      :disabled="!store.hasUnsavedChanges || store.isSaving"
      @click="store.saveNow()"
    >
      {{ store.isSaving ? "Сохранение..." : "Сохранить" }}
    </button>
    <button
      v-if="store.currentProjectId"
      v-show="!store.currentProjectReadOnly"
      type="button"
      class="fab-add"
      aria-label="Добавить карточку"
      @click="store.showNewCardPanel = true"
    >
      Добавить
    </button>
    <div
      class="side-panel-backdrop"
      :class="{ 'is-open': store.showNewCardPanel }"
      @click="closeNewPanel"
    ></div>
    <aside class="side-panel" :class="{ 'is-open': store.showNewCardPanel }" :inert="!store.showNewCardPanel">
      <div class="side-panel-inner">
        <h2 class="side-panel-title">Новая карточка</h2>
        <form class="side-panel-form" @submit.prevent="addCardFromDraft">
          <div class="side-panel-field">
            <label class="side-panel-field-row">
              <span>ФИО</span>
              <span class="field-uncertain-toggle"><input v-model="store.newCardDraft.uncertainFio" type="checkbox" aria-label="ФИО требует проверки" /></span>
            </label>
            <input v-model="store.newCardDraft.fio" type="text" />
          </div>
          <div class="side-panel-field">
            <label class="side-panel-field-row">
              <span>Дата рождения</span>
              <span class="field-uncertain-toggle"><input v-model="store.newCardDraft.uncertainBirth" type="checkbox" aria-label="Дата рождения требует проверки" /></span>
            </label>
            <div class="side-panel-birth-parts">
              <input
                v-model="newBirth.day"
                class="side-panel-birth-day"
                type="number"
                inputmode="numeric"
                min="1"
                max="31"
                placeholder="День"
              />
              <select v-model="newBirth.month" class="side-panel-birth-month">
                <option v-for="(opt, idx) in birthMonthOptions" :key="`nb-m-${idx}`" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <input
                v-model="newBirth.year"
                class="side-panel-birth-year"
                type="number"
                inputmode="numeric"
                min="1000"
                max="3000"
                placeholder="Год"
              />
            </div>
          </div>
          <div class="side-panel-field">
            <label class="side-panel-field-row">
              <span>Место рождения</span>
              <span class="field-uncertain-toggle"><input v-model="store.newCardDraft.uncertainBirthPlace" type="checkbox" aria-label="Место рождения требует проверки" /></span>
            </label>
            <input v-model="store.newCardDraft.birthPlace" type="text" @input="onNewBirthPlaceInput" />
            <div v-if="newPlaceSuggestions.length" class="autocomplete-dropdown">
              <button
                v-for="item in newPlaceSuggestions"
                :key="item.value"
                type="button"
                class="autocomplete-item"
                @click="pickNewBirthPlace(item.value)"
              >
                {{ item.value }}
              </button>
            </div>
          </div>
          <div class="side-panel-field side-panel-field--gender">
            <span class="side-panel-field-legend">Пол</span>
            <div class="gender-pick">
              <label class="gender-swatch-label">
                <input v-model="store.newCardDraft.gender" type="radio" name="new-gender" value="f" class="gender-swatch-input" />
                <span class="gender-swatch gender-swatch--f" aria-hidden="true"></span>
                <span class="gender-swatch-sr">Женский</span>
              </label>
              <label class="gender-swatch-label">
                <input v-model="store.newCardDraft.gender" type="radio" name="new-gender" value="m" class="gender-swatch-input" />
                <span class="gender-swatch gender-swatch--m" aria-hidden="true"></span>
                <span class="gender-swatch-sr">Мужской</span>
              </label>
            </div>
          </div>
          <div v-if="store.newCardDraft.gender === 'f'" class="side-panel-field">
            <label>Девичья фамилия</label>
            <input v-model="store.newCardDraft.maidenName" type="text" maxlength="80" />
          </div>
          <div class="side-panel-actions side-panel-actions--new-card-submit">
            <button type="submit" class="btn primary">{{ isNewCardEmpty ? "Создать пустую карточку" : "Создать карточку" }}</button>
          </div>
          <p class="field-uncertain-hint">Отметьте квадрат у поля, если информация требует проверки.</p>
        </form>
      </div>
    </aside>

    <div
      class="side-panel-backdrop"
      :class="{ 'is-open': store.showEditCardPanel }"
      @click="closeEditPanel"
    ></div>
    <aside class="side-panel" :class="{ 'is-open': store.showEditCardPanel }" :inert="!store.showEditCardPanel">
      <div class="side-panel-inner">
        <h2 class="side-panel-title">Редактирование карточки</h2>
        <form class="side-panel-form" @submit.prevent="saveEdit">
          <div class="side-panel-field">
            <label class="side-panel-field-row">
              <span>ФИО</span>
              <span class="field-uncertain-toggle"><input v-model="store.editDraft.uncertainFio" type="checkbox" aria-label="ФИО требует проверки" /></span>
            </label>
            <input v-model="store.editDraft.fio" type="text" />
          </div>
          <div class="side-panel-field">
            <label class="side-panel-field-row">
              <span>Дата рождения</span>
              <span class="field-uncertain-toggle"><input v-model="store.editDraft.uncertainBirth" type="checkbox" aria-label="Дата рождения требует проверки" /></span>
            </label>
            <div class="side-panel-birth-parts">
              <input
                v-model="editBirth.day"
                class="side-panel-birth-day"
                type="number"
                inputmode="numeric"
                min="1"
                max="31"
                placeholder="День"
              />
              <select v-model="editBirth.month" class="side-panel-birth-month">
                <option v-for="(opt, idx) in birthMonthOptions" :key="`eb-m-${idx}`" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <input
                v-model="editBirth.year"
                class="side-panel-birth-year"
                type="number"
                inputmode="numeric"
                min="1000"
                max="3000"
                placeholder="Год"
              />
            </div>
          </div>
          <div class="side-panel-field">
            <label class="side-panel-field-row">
              <span>Место рождения</span>
              <span class="field-uncertain-toggle"><input v-model="store.editDraft.uncertainBirthPlace" type="checkbox" aria-label="Место рождения требует проверки" /></span>
            </label>
            <input v-model="store.editDraft.birthPlace" type="text" @input="onEditBirthPlaceInput" />
            <div v-if="editPlaceSuggestions.length" class="autocomplete-dropdown">
              <button
                v-for="item in editPlaceSuggestions"
                :key="item.value"
                type="button"
                class="autocomplete-item"
                @click="pickEditBirthPlace(item.value)"
              >
                {{ item.value }}
              </button>
            </div>
          </div>
          <div class="side-panel-field side-panel-field--gender">
            <span class="side-panel-field-legend">Пол</span>
            <div class="gender-pick">
              <label class="gender-swatch-label">
                <input v-model="store.editDraft.gender" type="radio" name="edit-gender" value="f" class="gender-swatch-input" />
                <span class="gender-swatch gender-swatch--f" aria-hidden="true"></span>
                <span class="gender-swatch-sr">Женский</span>
              </label>
              <label class="gender-swatch-label">
                <input v-model="store.editDraft.gender" type="radio" name="edit-gender" value="m" class="gender-swatch-input" />
                <span class="gender-swatch gender-swatch--m" aria-hidden="true"></span>
                <span class="gender-swatch-sr">Мужской</span>
              </label>
            </div>
          </div>
          <div v-if="store.editDraft.gender === 'f'" class="side-panel-field">
            <label>Девичья фамилия</label>
            <input v-model="store.editDraft.maidenName" type="text" maxlength="80" />
          </div>
          <div class="side-panel-actions">
            <button type="button" class="btn" @click="store.showEditCardPanel = false">Отмена</button>
            <button type="submit" class="btn primary">Сохранить</button>
          </div>
          <p class="field-uncertain-hint">Отметьте квадрат у поля, если информация требует проверки.</p>
        </form>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { computed, defineExpose, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useTreeStore } from "../state/treeStore";
import { useViewport } from "../composables/useViewport";
import { useCards } from "../composables/useCards";
import { useGraph } from "../composables/useGraph";
import { projectsApi } from "../../../shared/api/projectsApi";
import { formatBirthDateRu } from "../../../shared/formatBirthRu";
import { BIRTH_MONTH_OPTIONS, buildBirthFromParts, parseBirthParts } from "../../../shared/birthParts";

const store = useTreeStore();
const router = useRouter();

function goMyProfile() {
  router.push("/myprofile");
}
const {
  viewportRef,
  worldStyle,
  zoomBy,
  onWheel,
  onPointerDown: onViewportPanPointerDown,
  onPointerMove: onViewportPanPointerMove,
  onPointerUp: onViewportPanPointerUp,
  fieldCoordsFromClient,
} =
  useViewport(store);
const mapWorldRef = ref(null);
const selectedCardIds = ref([]);
const selectionBox = reactive({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
});
const viewportClickState = reactive({
  active: false,
  pointerId: null,
  moved: false,
  startClientX: 0,
  startClientY: 0,
});
const { linksPath, unionNodes, pendingUnion, portDown, armUnion } = useGraph(store);
const { cardStyle, startDrag, onDragMove, onDragEnd, addCardFromDraft, openEdit, saveEdit, closeNewPanel, closeEditPanel } = useCards(store, {
  fieldCoordsFromClient,
  getSelectedCardIds: () => [...selectedCardIds.value],
  isSelected: (id) => selectedCardIds.value.includes(id),
  selectOnly: (id) => {
    selectedCardIds.value = id ? [id] : [];
  },
});
const isNewCardEmpty = computed(
  () => !store.newCardDraft.fio && !store.newCardDraft.birth && !store.newCardDraft.birthPlace
);
const CARD_W = 232;
const CARD_H = 204;
const newPlaceSuggestions = ref([]);
const editPlaceSuggestions = ref([]);
let newSuggestTimer = null;
let editSuggestTimer = null;

const birthMonthOptions = BIRTH_MONTH_OPTIONS;
const newBirth = reactive({ day: "", month: "", year: "" });
const editBirth = reactive({ day: "", month: "", year: "" });
const cloudPalette = [
  "rgba(80, 170, 255, 0.24)",   // blue
  "rgba(142, 112, 255, 0.24)",  // violet
  "rgba(255, 176, 46, 0.24)",   // amber
  "rgba(255, 122, 168, 0.24)",  // pink
  "rgba(70, 206, 191, 0.24)",   // turquoise
  "rgba(124, 214, 82, 0.23)",   // lime
  "rgba(255, 147, 98, 0.23)",   // coral
  "rgba(88, 199, 255, 0.23)",   // cyan
  "rgba(185, 122, 255, 0.23)",  // purple
  "rgba(255, 196, 74, 0.23)",   // yellow
  "rgba(255, 106, 147, 0.22)",  // rose
  "rgba(94, 180, 255, 0.23)",   // sky
  "rgba(74, 219, 166, 0.22)",   // mint
  "rgba(255, 136, 84, 0.22)",   // orange
  "rgba(115, 149, 255, 0.23)",  // indigo
  "rgba(57, 205, 228, 0.22)",   // aqua
];

function convexHull(points) {
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length <= 2) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function cloudPathFromHull(hull) {
  if (!hull || hull.length === 0) return "";
  if (hull.length === 1) {
    const p = hull[0];
    const r = 120;
    return `M ${p.x - r} ${p.y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
  }
  if (hull.length === 2) {
    const a = hull[0];
    const b = hull[1];
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.max(140, Math.abs(a.x - b.x) / 2 + 90);
    const ry = Math.max(110, Math.abs(a.y - b.y) / 2 + 80);
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
  }
  const pts = [...hull];
  const n = pts.length;
  const smooth = 0.22;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * smooth * 6;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * smooth * 6;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * smooth * 6;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * smooth * 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  d += " Z";
  return d;
}

function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const x = point.x;
  const y = point.y;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonBbox(poly) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly || []) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function rectIntersectsBBox(rect, bbox) {
  return !(
    rect.right < bbox.minX ||
    rect.left > bbox.maxX ||
    rect.bottom < bbox.minY ||
    rect.top > bbox.maxY
  );
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p1, p2, p3) => (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const onSeg = (p1, p2, p) =>
    Math.min(p1.x, p2.x) <= p.x &&
    p.x <= Math.max(p1.x, p2.x) &&
    Math.min(p1.y, p2.y) <= p.y &&
    p.y <= Math.max(p1.y, p2.y);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSeg(a, b, c)) return true;
  if (d2 === 0 && onSeg(a, b, d)) return true;
  if (d3 === 0 && onSeg(c, d, a)) return true;
  if (d4 === 0 && onSeg(c, d, b)) return true;
  return false;
}

function polygonIntersectsRect(polygon, rect) {
  if (!polygon || polygon.length < 2) return false;
  // 1) Вершина полигона в прямоугольнике
  const polyVertexInsideRect = polygon.some(
    (p) => p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom
  );
  if (polyVertexInsideRect) return true;
  // 2) Угол прямоугольника внутри полигона
  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.left, y: rect.bottom },
    { x: rect.right, y: rect.bottom },
  ];
  if (corners.some((p) => pointInPolygon(p, polygon))) return true;
  // 3) Пересечение рёбер
  const rectEdges = [
    [corners[0], corners[1]],
    [corners[1], corners[3]],
    [corners[3], corners[2]],
    [corners[2], corners[0]],
  ];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    for (const [c, d] of rectEdges) {
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function cardVisualSize(card) {
  const base = { w: CARD_W, h: CARD_H };
  if (!card?.id || typeof document === "undefined") return base;
  const el = document.getElementById(card.id);
  if (!el) return base;
  return {
    w: Math.max(base.w, el.offsetWidth || base.w),
    h: Math.max(base.h, el.offsetHeight || base.h),
  };
}

function roundedRectPath(left, top, width, height, radius = 14) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  const x = left;
  const y = top;
  return [
    `M ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `L ${x + r} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    "Z",
  ].join(" ");
}


function surnameFromFio(fio) {
  const parts = String(fio || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts[0].toLowerCase();
}

function canonicalSurname(surnameRaw) {
  let s = String(surnameRaw || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}-]+/gu, "");
  if (!s) return "";
  if (s.endsWith("ская")) s = `${s.slice(0, -4)}ий`;
  else if (s.endsWith("цкая")) s = `${s.slice(0, -4)}ий`;
  else if (s.endsWith("ова") || s.endsWith("ева") || s.endsWith("ина") || s.endsWith("ына")) s = s.slice(0, -1);
  else if (s.endsWith("ая") && s.length > 4) s = `${s.slice(0, -2)}ий`;
  return s;
}

function surnameKeysFromCard(card) {
  const keys = new Set();
  const fioSurname = canonicalSurname(surnameFromFio(card?.fio));
  if (fioSurname) keys.add(fioSurname);
  const maidenSurname = maidenSurnameKeyFromCard(card);
  if (maidenSurname) keys.add(maidenSurname);
  return [...keys];
}

function maidenSurnameKeyFromCard(card) {
  const maidenRaw = String(card?.maidenName || "").trim().toLowerCase();
  return canonicalSurname(maidenRaw.split(/\s+/).filter(Boolean)[0] || "");
}

function ownerSurnameKeyFromCard(card) {
  const fioSurname = canonicalSurname(surnameFromFio(card?.fio));
  if (fioSurname) return fioSurname;
  const maidenSurname = maidenSurnameKeyFromCard(card);
  return maidenSurname || "";
}

function cloudColorBySurname(surname) {
  let h = 0;
  for (let i = 0; i < surname.length; i += 1) h = (h * 31 + surname.charCodeAt(i)) >>> 0;
  return cloudPalette[h % cloudPalette.length];
}

const surnameClouds = computed(() => {
  const visualSizeCache = new Map();
  const getVisualSize = (card) => {
    if (!card?.id) return cardVisualSize(card);
    if (!visualSizeCache.has(card.id)) visualSizeCache.set(card.id, cardVisualSize(card));
    return visualSizeCache.get(card.id);
  };
  const byCanon = new Map();
  const ownerCanonById = new Map();
  const maidenCanonById = new Map();
  const cardsById = new Map((store.cards || []).map((c) => [c.id, c]));
  for (const c of store.cards || []) {
    ownerCanonById.set(c.id, ownerSurnameKeyFromCard(c));
    maidenCanonById.set(c.id, maidenSurnameKeyFromCard(c));
    const keys = surnameKeysFromCard(c);
    for (const canon of keys) {
      if (!canon) continue;
      if (!byCanon.has(canon)) byCanon.set(canon, []);
      byCanon.get(canon).push(c);
    }
  }

  // Кровные связи: только родитель-ребенок (lineage, childOfUnion), без spouse.
  const bloodAdj = new Map();
  const addBloodEdge = (a, b) => {
    if (!a || !b) return;
    if (!bloodAdj.has(a)) bloodAdj.set(a, new Set());
    if (!bloodAdj.has(b)) bloodAdj.set(b, new Set());
    bloodAdj.get(a).add(b);
    bloodAdj.get(b).add(a);
  };
  for (const l of store.links || []) {
    const kind = l.kind || "lineage";
    if (kind === "lineage" && l.from && l.to) addBloodEdge(l.from, l.to);
    if (kind === "childOfUnion" && l.child) {
      if (l.a) addBloodEdge(l.a, l.child);
      if (l.b) addBloodEdge(l.b, l.child);
    }
  }
  const hasBloodPathToAny = (fromId, targetIds) => {
    if (!fromId || !targetIds || targetIds.size === 0) return false;
    if (targetIds.has(fromId)) return true;
    const q = [fromId];
    const seen = new Set([fromId]);
    while (q.length) {
      const cur = q.shift();
      const next = bloodAdj.get(cur);
      if (!next) continue;
      for (const n of next) {
        if (seen.has(n)) continue;
        if (targetIds.has(n)) return true;
        seen.add(n);
        q.push(n);
      }
    }
    return false;
  };

  const pairKey = (a, b) => (String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`);
  const linkedPairs = new Set();
  for (const l of store.links || []) {
    const kind = l.kind || "lineage";
    if (kind === "lineage" && l.from && l.to) linkedPairs.add(pairKey(l.from, l.to));
    if (kind === "spouse" && l.a && l.b) linkedPairs.add(pairKey(l.a, l.b));
    if (kind === "childOfUnion" && l.a && l.child) linkedPairs.add(pairKey(l.a, l.child));
    if (kind === "childOfUnion" && l.b && l.child) linkedPairs.add(pairKey(l.b, l.child));
  }

  const isNear = (a, b) => {
    const ax = (Number(a.x) || 0) + CARD_W / 2;
    const ay = (Number(a.y) || 0) + CARD_H / 2;
    const bx = (Number(b.x) || 0) + CARD_W / 2;
    const by = (Number(b.y) || 0) + CARD_H / 2;
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy <= 460 * 460;
  };

  const out = [];
  const cardCenter = (c) => ({
    x: (Number(c?.x) || 0) + CARD_W / 2,
    y: (Number(c?.y) || 0) + CARD_H / 2,
  });
  const buildPts = (items, pad, links) => {
    const pts = [];
    for (const c of items) {
      const x = Number(c.x) || 0;
      const y = Number(c.y) || 0;
      pts.push({ x: x - pad, y: y - pad });
      pts.push({ x: x + CARD_W + pad, y: y - pad });
      pts.push({ x: x + CARD_W + pad, y: y + CARD_H + pad });
      pts.push({ x: x - pad, y: y + CARD_H + pad });
      const cc = cardCenter(c);
      pts.push(cc);
    }
    const sameIds = new Set(items.map((x) => x.id));
    for (const l of links || []) {
      const kind = l.kind || "lineage";
      if (kind === "lineage" && sameIds.has(l.from) && sameIds.has(l.to)) {
        const a = items.find((x) => x.id === l.from);
        const b = items.find((x) => x.id === l.to);
        if (a && b) {
          const ca = cardCenter(a);
          const cb = cardCenter(b);
          pts.push({ x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 });
        }
      }
      if (kind === "spouse" && sameIds.has(l.a) && sameIds.has(l.b)) {
        const a = items.find((x) => x.id === l.a);
        const b = items.find((x) => x.id === l.b);
        if (a && b) {
          const ca = cardCenter(a);
          const cb = cardCenter(b);
          pts.push({ x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 });
        }
      }
    }
    return pts;
  };
  for (const [canonSurnameKey, cards] of byCanon.entries()) {
    if (!cards || cards.length < 2) continue;
    // Если однофамильцы далеко и не связаны, делим на отдельные группы-компоненты.
    const parent = new Map(cards.map((c) => [c.id, c.id]));
    const find = (x) => {
      let p = parent.get(x);
      while (p !== parent.get(p)) p = parent.get(p);
      return p;
    };
    const unite = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i];
        const b = cards[j];
        if (linkedPairs.has(pairKey(a.id, b.id)) || isNear(a, b)) {
          unite(a.id, b.id);
        }
      }
    }
    const components = new Map();
    for (const c of cards) {
      const r = find(c.id);
      if (!components.has(r)) components.set(r, []);
      components.get(r).push(c);
    }

    const groups = [...components.values()].filter((arr) => arr.length >= 2);
    for (let gi = 0; gi < groups.length; gi += 1) {
      const items = groups[gi];
      const memberIds = new Set(items.map((x) => x.id));
      const bloodCoreIds = new Set(
        items
          .filter((x) => (ownerCanonById.get(x.id) || "") === canonSurnameKey)
          .map((x) => x.id)
      );
      if (bloodCoreIds.size === 0) {
        for (const x of items) bloodCoreIds.add(x.id);
      }
      // Приоритет "родного" облака:
      // если карточка входит в текущую группу только как вторичная (например, девичья фамилия),
      // а ее родная фамилия другая, для этого облака она считается "чужой" и получает карман.
      const allOthers = (store.cards || []).filter((c) => {
        if (!memberIds.has(c.id)) return true;
        const ownerCanon = ownerCanonById.get(c.id) || "";
        if (!ownerCanon || ownerCanon === canonSurnameKey) return false;

        const gender = String(cardsById.get(c.id)?.gender || "");
        const maidenCanon = maidenCanonById.get(c.id) || "";
        const hasBloodToCore = hasBloodPathToAny(c.id, bloodCoreIds);

        // Женщина с девичьей фамилией этой семьи может принадлежать двум облакам.
        if (gender === "f" && maidenCanon === canonSurnameKey) return false;
        // Мужчина без кровной связи с этой семьей должен получать карман.
        if (gender === "m" && !hasBloodToCore) return true;
        // Для остальных вторичных участников оставляем строгий режим (карман).
        return true;
      });
      const pad = 56;
      const hull = convexHull(buildPts(items, pad, store.links || []));
      const outer = cloudPathFromHull(hull);
      if (!outer) continue;

      // Локальная коррекция формы: вырезы только там, где чужая карточка
      // пересекает облако хотя бы частично.
      const holePad = 22;
      const holes = [];
      const hullBox = polygonBbox(hull);
      for (const c of allOthers) {
        const sz = getVisualSize(c);
        const x = Number(c.x) || 0;
        const y = Number(c.y) || 0;
        const rect = { left: x, top: y, right: x + sz.w, bottom: y + sz.h };
        if (!rectIntersectsBBox(rect, hullBox)) continue;
        const center = { x: x + sz.w / 2, y: y + sz.h / 2 };
        const centerInside = pointInPolygon(center, hull);
        const intersects = polygonIntersectsRect(hull, rect);
        if (!centerInside && !intersects) continue;
        holes.push(roundedRectPath(x - holePad, y - holePad, sz.w + holePad * 2, sz.h + holePad * 2, 24));
      }
      const d = holes.length ? `${outer} ${holes.join(" ")}` : outer;
      out.push({ key: `cloud:${canonSurnameKey}:${gi}`, color: cloudColorBySurname(canonSurnameKey), d });
    }
  }
  return out;
});

watch(
  () => store.showNewCardPanel,
  (open) => {
    if (open) {
      const p = parseBirthParts(store.newCardDraft.birth);
      newBirth.day = p.day;
      newBirth.month = p.month;
      newBirth.year = p.year;
    }
  }
);

watch(
  () => store.showEditCardPanel,
  (open) => {
    if (open) {
      const p = parseBirthParts(store.editDraft.birth);
      editBirth.day = p.day;
      editBirth.month = p.month;
      editBirth.year = p.year;
    }
  }
);

watch(
  newBirth,
  () => {
    if (!store.showNewCardPanel) return;
    store.newCardDraft.birth = buildBirthFromParts(newBirth);
  },
  { deep: true }
);

watch(
  editBirth,
  () => {
    if (!store.showEditCardPanel) return;
    store.editDraft.birth = buildBirthFromParts(editBirth);
  },
  { deep: true }
);

function splitFioLines(fio) {
  const parts = String(fio || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return parts;
  if (parts.length === 4) return [parts.slice(0, 2).join(" "), parts[2], parts[3]];
  return [parts[0], parts.slice(1, -1).join(" "), parts[parts.length - 1]];
}

function withMaidenName(card) {
  const fioRaw = String(card?.fio || "").trim();
  const maiden = String(card?.maidenName || "").trim();
  if (!fioRaw || !maiden) return fioRaw;
  const parts = fioRaw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fioRaw;
  // Показываем девичью фамилию рядом с основной фамилией.
  parts[0] = `${parts[0]} (${maiden})`;
  return parts.join(" ");
}

function isCardSelected(cardId) {
  return selectedCardIds.value.includes(cardId);
}

function onCardPointerDown(ev, cardId) {
  if (ev.button !== 0) return;
  const toggle = ev.ctrlKey || ev.metaKey;
  if (toggle) {
    if (selectedCardIds.value.includes(cardId)) {
      selectedCardIds.value = selectedCardIds.value.filter((id) => id !== cardId);
    } else {
      selectedCardIds.value = [...selectedCardIds.value, cardId];
    }
    return;
  }
  if (!selectedCardIds.value.includes(cardId) || selectedCardIds.value.length !== 1) {
    selectedCardIds.value = [cardId];
  }
}

function clearSelectionBox() {
  selectionBox.active = false;
  selectionBox.pointerId = null;
  selectionBox.width = 0;
  selectionBox.height = 0;
}

function onViewportPointerDown(ev) {
  const onCard = ev.target.closest(".family-card");
  if (onCard) return;
  if (ev.target.closest(".map-zoom-tools")) return;
  viewportClickState.active = true;
  viewportClickState.pointerId = ev.pointerId;
  viewportClickState.moved = false;
  viewportClickState.startClientX = ev.clientX;
  viewportClickState.startClientY = ev.clientY;
  // Обычный drag по пустому месту — панорама карты.
  // Shift + drag — рамка выделения карточек.
  const wantsSelectionBox = ev.shiftKey === true;
  if (!wantsSelectionBox) {
    onViewportPanPointerDown(ev);
    return;
  }
  if (ev.pointerType === "mouse" && ev.button !== 0) return;
  const p = fieldCoordsFromClient(ev.clientX, ev.clientY);
  selectionBox.active = true;
  selectionBox.pointerId = ev.pointerId;
  selectionBox.startX = p.x;
  selectionBox.startY = p.y;
  selectionBox.left = p.x;
  selectionBox.top = p.y;
  selectionBox.width = 0;
  selectionBox.height = 0;
}

function onViewportPointerMove(ev) {
  if (viewportClickState.active && viewportClickState.pointerId === ev.pointerId) {
    const dx = Math.abs(ev.clientX - viewportClickState.startClientX);
    const dy = Math.abs(ev.clientY - viewportClickState.startClientY);
    if (dx > 3 || dy > 3) viewportClickState.moved = true;
  }
  if (selectionBox.active && selectionBox.pointerId === ev.pointerId) {
    const p = fieldCoordsFromClient(ev.clientX, ev.clientY);
    const left = Math.min(selectionBox.startX, p.x);
    const right = Math.max(selectionBox.startX, p.x);
    const top = Math.min(selectionBox.startY, p.y);
    const bottom = Math.max(selectionBox.startY, p.y);
    selectionBox.left = left;
    selectionBox.top = top;
    selectionBox.width = right - left;
    selectionBox.height = bottom - top;
    return;
  }
  onViewportPanPointerMove(ev);
}

function onViewportPointerUp(ev) {
  if (selectionBox.active && selectionBox.pointerId === ev.pointerId) {
    const left = selectionBox.left;
    const top = selectionBox.top;
    const right = left + selectionBox.width;
    const bottom = top + selectionBox.height;
    const minW = 6;
    const minH = 6;
    if (selectionBox.width >= minW && selectionBox.height >= minH) {
      const CARD_W = 232;
      const CARD_H = 204;
      const hits = store.cards
        .filter((c) => c.x < right && c.x + CARD_W > left && c.y < bottom && c.y + CARD_H > top)
        .map((c) => c.id);
      selectedCardIds.value = hits;
    } else if (!ev.ctrlKey && !ev.metaKey) {
      selectedCardIds.value = [];
    }
    clearSelectionBox();
    viewportClickState.active = false;
    viewportClickState.pointerId = null;
    return;
  }
  if (viewportClickState.active && viewportClickState.pointerId === ev.pointerId) {
    if (!viewportClickState.moved && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
      selectedCardIds.value = [];
    }
    viewportClickState.active = false;
    viewportClickState.pointerId = null;
  }
  onViewportPanPointerUp(ev);
}

function byGender(gender, male, female, neutral) {
  if (gender === "m") return male;
  if (gender === "f") return female;
  return neutral;
}

function capitalizeFirst(text) {
  const s = String(text || "");
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ancestorTitle(gender, up) {
  if (up <= 0) return "Родственник";
  if (up === 1) return byGender(gender, "Отец", "Мать", "Родитель");
  if (up === 2) return byGender(gender, "Дедушка", "Бабушка", "Дедушка/бабушка");
  const pra = "пра".repeat(Math.max(1, up - 2));
  return capitalizeFirst(byGender(gender, `${pra}дедушка`, `${pra}бабушка`, `${pra}дедушка/бабушка`));
}

function descendantTitle(gender, down) {
  if (down <= 0) return "Родственник";
  if (down === 1) return byGender(gender, "Сын", "Дочь", "Ребенок");
  if (down === 2) return byGender(gender, "Внук", "Внучка", "Внук/внучка");
  const pra = "пра".repeat(Math.max(1, down - 2));
  return capitalizeFirst(byGender(gender, `${pra}внук`, `${pra}внучка`, `${pra}внук/внучка`));
}

function siblingTitle(gender) {
  return byGender(gender, "Брат", "Сестра", "Брат/сестра");
}

function ancestorGenitiveRef(up, ancestorGender = "") {
  if (up <= 0) return "родственника";
  if (up === 1) return byGender(ancestorGender, "отца", "матери", "родителя");
  if (up === 2) return byGender(ancestorGender, "дедушки", "бабушки", "бабушки/дедушки");
  const pra = "пра".repeat(Math.max(1, up - 2));
  return byGender(ancestorGender, `${pra}дедушки`, `${pra}бабушки`, `${pra}бабушки/${pra}дедушки`);
}

function buildRelationGraph() {
  const graph = new Map();
  const add = (from, to, rel) => {
    if (!from || !to || from === to) return;
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push({ to, rel });
  };

  for (const l of store.links) {
    const kind = l.kind || "lineage";
    if (kind === "lineage") {
      add(l.from, l.to, "child");
      add(l.to, l.from, "parent");
    } else if (kind === "spouse") {
      add(l.a, l.b, "spouse");
      add(l.b, l.a, "spouse");
    } else if (kind === "childOfUnion") {
      add(l.a, l.child, "child");
      add(l.b, l.child, "child");
      add(l.child, l.a, "parent");
      add(l.child, l.b, "parent");
    }
  }
  return graph;
}

function shortestRelationPath(selfId, targetId) {
  const graph = buildRelationGraph();
  const q = [{ id: selfId, rels: [], nodes: [selfId] }];
  const seen = new Set([selfId]);

  for (let i = 0; i < q.length; i += 1) {
    const cur = q[i];
    if (cur.id === targetId) return { rels: cur.rels, nodes: cur.nodes };
    const edges = graph.get(cur.id) || [];
    for (const e of edges) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      q.push({ id: e.to, rels: [...cur.rels, e.rel], nodes: [...cur.nodes, e.to] });
    }
  }
  return null;
}

function relationTitleByPath(pathInfo, targetGender) {
  if (!pathInfo || !Array.isArray(pathInfo.rels) || pathInfo.rels.length === 0) return "Это вы";
  const path = pathInfo.rels;
  const sig = path.join(">");

  if (sig === "parent") return ancestorTitle(targetGender, 1);
  if (sig === "child") return descendantTitle(targetGender, 1);
  if (sig === "spouse") return byGender(targetGender, "Муж", "Жена", "Супруг(а)");

  if (sig === "parent>parent") return ancestorTitle(targetGender, 2);
  if (sig === "child>child") return descendantTitle(targetGender, 2);
  if (sig === "parent>child") return byGender(targetGender, "Брат", "Сестра", "Брат/сестра");
  if (sig === "spouse>parent") return "Родитель супруга/супруги";
  if (sig === "spouse>child") return "Ребенок супруга/супруги";
  if (sig === "parent>spouse") return "Супруг(а) родителя";
  if (sig === "child>parent") return "Второй родитель ребенка";

  if (sig === "parent>parent>child") return byGender(targetGender, "Дядя", "Тетя", "Дядя/тетя");
  if (sig === "parent>child>child") return byGender(targetGender, "Племянник", "Племянница", "Племянник/племянница");
  if (sig === "parent>parent>parent") return ancestorTitle(targetGender, 3);
  if (sig === "child>child>child") return descendantTitle(targetGender, 3);

  const onlyVertical = path.every((r) => r === "parent") || path.every((r) => r === "child");
  if (onlyVertical) {
    if (path[0] === "parent") return ancestorTitle(targetGender, path.length);
    return descendantTitle(targetGender, path.length);
  }

  // Боковые кровные ветки: N шагов вверх к общему предку, затем M шагов вниз.
  const up = path.findIndex((r) => r !== "parent");
  if (up > 0) {
    const downPart = path.slice(up);
    const isDownOnly = downPart.length > 0 && downPart.every((r) => r === "child");
    if (isDownOnly) {
      const down = downPart.length;
      if (up === 1 && down === 1) return siblingTitle(targetGender);
      if (up === 2 && down === 1) return byGender(targetGender, "Дядя", "Тетя", "Дядя/тетя");
      if (up === 1 && down === 2) return byGender(targetGender, "Племянник", "Племянница", "Племянник/племянница");
      if (up === 2 && down === 2) return byGender(targetGender, "Двоюродный брат", "Двоюродная сестра", "Двоюродный брат/сестра");
      if (up >= 2 && down >= 2) {
        return `Дальний родственник по боковой линии (${up} вверх, ${down} вниз)`;
      }
      if (up >= 3 && down === 1) {
        const refNodeIdx = up - 1;
        const refId = pathInfo.nodes?.[refNodeIdx];
        const refCard = refId ? store.cards.find((c) => c.id === refId) : null;
        const refGender = String(refCard?.gender || "");
        return `${siblingTitle(targetGender)} ${ancestorGenitiveRef(up - 1, refGender)}`;
      }
    }
  }

  return `Родство: ${path.length} шагов`;
}

function kinshipHelpTitle(cardId) {
  if (isSelfCard(cardId)) return "Это вы";
  const rootId = store.selfCard?.id;
  if (!rootId) return "Родство не определено";
  const path = shortestRelationPath(rootId, cardId);
  if (!path) return "Родство не определено";
  const target = store.cards.find((c) => c.id === cardId);
  return relationTitleByPath(path, target?.gender || "");
}

function isSelfCard(cardId) {
  return !!store.selfCard && cardId === store.selfCard.id;
}

function onEditBirthPlaceInput() {
  if (editSuggestTimer) clearTimeout(editSuggestTimer);
  editSuggestTimer = setTimeout(async () => {
    const q = String(store.editDraft.birthPlace || "").trim();
    if (q.length < 2) {
      editPlaceSuggestions.value = [];
      return;
    }
    editPlaceSuggestions.value = await projectsApi.suggestPlaces(q);
  }, 200);
}

function onNewBirthPlaceInput() {
  if (newSuggestTimer) clearTimeout(newSuggestTimer);
  newSuggestTimer = setTimeout(async () => {
    const q = String(store.newCardDraft.birthPlace || "").trim();
    if (q.length < 2) {
      newPlaceSuggestions.value = [];
      return;
    }
    newPlaceSuggestions.value = await projectsApi.suggestPlaces(q);
  }, 200);
}

function pickNewBirthPlace(value) {
  store.newCardDraft.birthPlace = value;
  newPlaceSuggestions.value = [];
}

function pickEditBirthPlace(value) {
  store.editDraft.birthPlace = value;
  editPlaceSuggestions.value = [];
}

function linkLineStrokeOpacity(line) {
  return (line.className || "").includes("lines-layer-path--spouse") ? 0.92 : 0.88;
}

/** Для сплошной линии не задаём dasharray (undefined — атрибут не рендерится). */
function linkLineStrokeDasharray(line) {
  return (line.className || "").includes("lines-layer-path--spouse") ? "5 6" : undefined;
}

function exportFilterForShare(node) {
  if (!(node instanceof Element)) return true;
  if (node.classList.contains("lines-layer-hit")) return false;
  if (node.classList.contains("card-icon-btn")) return false;
  if (node.classList.contains("card-port")) return false;
  if (node.classList.contains("union-node")) return false;
  if (node.classList.contains("selection-box")) return false;
  if (node.classList.contains("card-body-help")) return false;
  return true;
}

/** Лимит стороны SVG→bitmap: иначе декодер обрезает картинку (видна «часть карты»). */
const EXPORT_BITMAP_MAX_SIDE = 8192;
/** Итоговый canvas (html-to-image) до внутреннего авто-скейла. */
const EXPORT_CANVAS_MAX_SIDE = 16384;

/**
 * В снимке foreignObject клону не видны внешние таблицы стилей — инлайнится computed style.
 * Для path с stroke из var(--line) и облаков с opacity это даёт кривой вид; перед клоном включаем
 * глобальные правила с !important, clone-node снимает уже исправленный getComputedStyle.
 */
const EXPORT_SNAPSHOT_STYLE_ID = "svoi-korni-export-snapshot-css";

const EXPORT_SNAPSHOT_CSS = `
.lines-layer {
  shape-rendering: geometricPrecision !important;
}
/* Запас от заливки; обводка задаётся инлайном на path (linkLineVisualStyle) */
.lines-layer path {
  fill: none !important;
}
.surname-clouds-layer,
.surname-clouds-layer svg {
  overflow: visible !important;
}
.surname-cloud-path {
  mix-blend-mode: normal !important;
  isolation: isolate !important;
  opacity: 0.3 !important;
}
`;

/**
 * PNG всего поля: масштаб под декодер SVG, корень клона — scale (через options.style), линии/облака — см. EXPORT_SNAPSHOT_CSS.
 * @returns {Promise<{ ok: true, blob: Blob } | { ok: false, error: string }>}
 */
async function exportFamilyMapPng(options = {}) {
  const el = mapWorldRef.value;
  if (!el) return { ok: false, error: "no_element" };
  if (!store.currentProjectId) return { ok: false, error: "no_project" };
  if (!store.cards.length) return { ok: false, error: "empty" };

  const fw = Math.max(1, el.offsetWidth || store.fieldW);
  const fh = Math.max(1, el.offsetHeight || store.fieldH);
  const maxSide = Math.max(fw, fh);
  const layoutScale = Math.min(1, EXPORT_BITMAP_MAX_SIDE / maxSide);
  const svgW = Math.max(1, Math.round(fw * layoutScale));
  const svgH = Math.max(1, Math.round(fh * layoutScale));

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const basePr =
    typeof options.pixelRatio === "number" && options.pixelRatio > 0
      ? Math.min(4, options.pixelRatio)
      : Math.min(4, Math.max(2.25, dpr * 2));
  let pixelRatio = Math.min(basePr, EXPORT_CANVAS_MAX_SIDE / svgW, EXPORT_CANVAS_MAX_SIDE / svgH);
  pixelRatio = Math.max(1, pixelRatio);

  let styleTag = null;
  try {
    styleTag = document.createElement("style");
    styleTag.id = EXPORT_SNAPSHOT_STYLE_ID;
    styleTag.textContent = EXPORT_SNAPSHOT_CSS;
    document.head.appendChild(styleTag);
    await nextTick();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const { toCanvas } = await import("html-to-image");
    const canvas = await toCanvas(el, {
      width: svgW,
      height: svgH,
      pixelRatio,
      backgroundColor: "#ecefed",
      filter: exportFilterForShare,
      cacheBust: true,
      /** Иначе чтение cssRules с fonts.googleapis.com даёт SecurityError и портит растеризацию. */
      skipFonts: true,
      style: {
        boxSizing: "border-box",
        overflow: "visible",
        willChange: "auto",
        width: `${fw}px`,
        height: `${fh}px`,
        transformOrigin: "0 0",
        transform: `scale(${layoutScale})`,
      },
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return { ok: false, error: "blob" };
    return { ok: true, blob };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    styleTag?.remove?.();
  }
}

defineExpose({ exportFamilyMapPng });

onMounted(() => {
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragEnd);
});

onBeforeUnmount(() => {
  clearSelectionBox();
  viewportClickState.active = false;
  viewportClickState.pointerId = null;
  if (newSuggestTimer) clearTimeout(newSuggestTimer);
  if (editSuggestTimer) clearTimeout(editSuggestTimer);
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", onDragEnd);
});
</script>

