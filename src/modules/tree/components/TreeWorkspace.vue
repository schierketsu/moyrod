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
      <div class="map-world" :style="{ ...worldStyle, width: `${store.fieldW}px`, height: `${store.fieldH}px` }">
        <svg class="lines-layer" :width="store.fieldW" :height="store.fieldH" aria-hidden="true">
          <g v-for="line in linksPath" :key="line.key">
            <path :d="line.d" :class="line.className || 'lines-layer-path'" />
            <path :d="line.d" class="lines-layer-hit" @pointerdown.stop.prevent="store.requestLinkDelete(line.payload)" />
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
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
const newPlaceSuggestions = ref([]);
const editPlaceSuggestions = ref([]);
let newSuggestTimer = null;
let editSuggestTimer = null;

const birthMonthOptions = BIRTH_MONTH_OPTIONS;
const newBirth = reactive({ day: "", month: "", year: "" });
const editBirth = reactive({ day: "", month: "", year: "" });

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

