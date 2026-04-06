<template>
  <div class="field-stage">
    <main
      ref="viewportRef"
      class="viewport"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
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
              'family-card--unknown': card.isUnknown
            }"
            :style="cardStyle(card)"
          >
            <button class="card-port card-port--top" type="button" @pointerdown.stop="portDown(card.id, 'top')" />
            <button class="card-port card-port--left" type="button" @pointerdown.stop="portDown(card.id, 'left')" />
            <button class="card-port card-port--right" type="button" @pointerdown.stop="portDown(card.id, 'right')" />
            <div class="card-drag" :class="{ 'card-drag--labeled': !!card.title }" @pointerdown.prevent.stop="startDrag($event, card)">
              <button type="button" class="card-icon-btn card-pin" @click.stop="store.patchCard(card.id, { pinned: !card.pinned })">
                <img class="card-icon-img" src="/icons/pin.png" width="18" height="18" alt="" />
              </button>
              <span class="card-drag-label">{{ card.title || "" }}</span>
              <div class="card-drag-actions">
                <button type="button" class="card-icon-btn card-edit" @click.stop="openEdit(card.id)">
                  <img class="card-icon-img" src="/icons/edit.png" width="18" height="18" alt="" />
                </button>
                <button type="button" class="card-icon-btn card-remove" @click.stop="store.requestCardDelete(card.id)">
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
                    <div class="card-fio-lines">
                      <span v-for="(line, idx) in splitFioLines(card.fio)" :key="`${card.id}-fio-${idx}`" class="card-fio-line">{{ line }}</span>
                    </div>
                  </div>
                  <div class="card-field">
                    <span class="card-field-label">Дата рождения</span>
                    <div class="card-field-value">{{ card.birth || "" }}</div>
                  </div>
                  <div class="card-field">
                    <span class="card-field-label">Место рождения</span>
                    <div class="card-field-value">{{ card.birthPlace || "" }}</div>
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
      </div>
      <div class="map-zoom-tools" role="group" aria-label="Масштаб карты">
        <button type="button" class="map-zoom-btn" title="Приблизить" aria-label="Приблизить" @click="zoomBy(1.15)">+</button>
        <button type="button" class="map-zoom-btn" title="Отдалить" aria-label="Отдалить" @click="zoomBy(1 / 1.15)">−</button>
      </div>
    </main>
    <button
      type="button"
      class="fab-save"
      aria-label="Сохранить проект"
      :disabled="!store.hasUnsavedChanges || store.isSaving"
      @click="store.saveNow()"
    >
      {{ store.isSaving ? "Сохранение..." : "Сохранить" }}
    </button>
    <button type="button" class="fab-add" aria-label="Добавить карточку" @click="store.showNewCardPanel = true">Добавить</button>
    <div
      class="side-panel-backdrop"
      :class="{ 'is-open': store.showNewCardPanel }"
      @click="closeNewPanel"
    ></div>
    <aside class="side-panel" :class="{ 'is-open': store.showNewCardPanel }" :inert="!store.showNewCardPanel">
      <div class="side-panel-inner">
        <h2 class="side-panel-title">Новая карточка</h2>
        <form class="side-panel-form" @submit.prevent="addCardFromDraft">
          <div class="side-panel-field"><label>ФИО</label><input v-model="store.newCardDraft.fio" type="text" /></div>
          <div class="side-panel-field"><label>Дата рождения</label><input v-model="store.newCardDraft.birth" type="date" /></div>
          <div class="side-panel-field"><label>Место рождения</label><input v-model="store.newCardDraft.birthPlace" type="text" /></div>
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
          <div class="side-panel-field"><label>ФИО</label><input v-model="store.editDraft.fio" type="text" /></div>
          <div class="side-panel-field"><label>Дата рождения</label><input v-model="store.editDraft.birth" type="date" /></div>
          <div class="side-panel-field">
            <label>Место рождения</label>
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
        </form>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useTreeStore } from "../state/treeStore";
import { useViewport } from "../composables/useViewport";
import { useCards } from "../composables/useCards";
import { useGraph } from "../composables/useGraph";
import { projectsApi } from "../../../shared/api/projectsApi";

const store = useTreeStore();
const { viewportRef, worldStyle, zoomBy, onWheel, onPointerDown, onPointerMove, onPointerUp, fieldCoordsFromClient } =
  useViewport(store);
const { linksPath, unionNodes, pendingUnion, portDown, armUnion } = useGraph(store);
const { cardStyle, startDrag, onDragMove, onDragEnd, addCardFromDraft, openEdit, saveEdit, closeNewPanel, closeEditPanel } = useCards(store, {
  fieldCoordsFromClient,
});
const isNewCardEmpty = computed(
  () => !store.newCardDraft.fio && !store.newCardDraft.birth && !store.newCardDraft.birthPlace
);
const editPlaceSuggestions = ref([]);
let editSuggestTimer = null;

function splitFioLines(fio) {
  const parts = String(fio || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return parts;
  if (parts.length === 4) return [parts.slice(0, 2).join(" "), parts[2], parts[3]];
  return [parts[0], parts.slice(1, -1).join(" "), parts[parts.length - 1]];
}

function byGender(gender, male, female, neutral) {
  if (gender === "m") return male;
  if (gender === "f") return female;
  return neutral;
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
  const q = [{ id: selfId, rels: [] }];
  const seen = new Set([selfId]);

  for (let i = 0; i < q.length; i += 1) {
    const cur = q[i];
    if (cur.id === targetId) return cur.rels;
    const edges = graph.get(cur.id) || [];
    for (const e of edges) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      q.push({ id: e.to, rels: [...cur.rels, e.rel] });
    }
  }
  return null;
}

function relationTitleByPath(path, targetGender) {
  if (!path || path.length === 0) return "Это вы";
  const sig = path.join(">");

  if (sig === "parent") return byGender(targetGender, "Отец", "Мать", "Родитель");
  if (sig === "child") return byGender(targetGender, "Сын", "Дочь", "Ребенок");
  if (sig === "spouse") return byGender(targetGender, "Муж", "Жена", "Супруг(а)");

  if (sig === "parent>parent") return byGender(targetGender, "Дедушка", "Бабушка", "Дедушка/бабушка");
  if (sig === "child>child") return byGender(targetGender, "Внук", "Внучка", "Внук/внучка");
  if (sig === "parent>child") return byGender(targetGender, "Брат", "Сестра", "Брат/сестра");
  if (sig === "spouse>parent") return "Родитель супруга/супруги";
  if (sig === "spouse>child") return "Ребенок супруга/супруги";
  if (sig === "parent>spouse") return "Супруг(а) родителя";
  if (sig === "child>parent") return "Второй родитель ребенка";

  if (sig === "parent>parent>child") return byGender(targetGender, "Дядя", "Тетя", "Дядя/тетя");
  if (sig === "parent>child>child") return byGender(targetGender, "Племянник", "Племянница", "Племянник/племянница");
  if (sig === "parent>parent>parent") return byGender(targetGender, "Прадедушка", "Прабабушка", "Прадедушка/прабабушка");
  if (sig === "child>child>child") return byGender(targetGender, "Правнук", "Правнучка", "Правнук/правнучка");

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
  if (editSuggestTimer) clearTimeout(editSuggestTimer);
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", onDragEnd);
});
</script>

