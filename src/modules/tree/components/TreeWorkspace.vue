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
      <div class="map-world" :style="worldStyle">
        <svg class="lines-layer" :width="store.fieldW" :height="store.fieldH" aria-hidden="true">
          <path v-for="line in linksPath" :key="line.key" :d="line.d" class="lines-layer-path" />
        </svg>
        <div class="cards-layer" :style="{ width: `${store.fieldW}px`, height: `${store.fieldH}px` }">
          <article
            v-for="card in store.cards"
            :id="card.id"
            :key="card.id"
            class="family-card"
            :class="{ 'family-card--self': card.id === SELF_CARD_ID, 'family-card--pinned': card.pinned }"
            :style="cardStyle(card)"
          >
            <button class="card-port card-port--top" type="button" @pointerdown.stop="portDown(card.id, 'top')" />
            <button class="card-port card-port--left" type="button" @pointerdown.stop="portDown(card.id, 'left')" />
            <button class="card-port card-port--right" type="button" @pointerdown.stop="portDown(card.id, 'right')" />
            <div class="card-drag" @pointerdown.prevent.stop="startDrag($event, card)">
              <button type="button" class="card-icon-btn card-pin" @click.stop="store.patchCard(card.id, { pinned: !card.pinned })">
                <img class="card-icon-img" src="/icons/pin.svg" width="18" height="18" alt="" />
              </button>
              <span class="card-drag-label"></span>
              <div class="card-drag-actions">
                <button type="button" class="card-icon-btn card-edit" @click.stop="openEdit(card.id)">
                  <img class="card-icon-img" src="/icons/edit.svg" width="18" height="18" alt="" />
                </button>
                <button type="button" class="card-icon-btn card-remove" @click.stop="store.removeCard(card.id)">
                  <img class="card-icon-img" src="/icons/garbage.svg" width="18" height="18" alt="" />
                </button>
              </div>
            </div>
            <div class="card-body">
              <div class="card-body-content">
                <button v-if="card.isUnknown" type="button" class="card-unknown-layer" @click.stop="openEdit(card.id)">
                  <span class="card-unknown-placeholder">Пока неизвестно</span>
                </button>
                <div v-else class="card-standard-fields">
                  <div class="card-field card-field--fio">
                    <span class="card-field-label">ФИО</span>
                    <div class="card-fio-lines">
                      <span class="card-fio-line">{{ card.fio }}</span>
                    </div>
                  </div>
                  <div class="card-field">
                    <span class="card-field-label">Дата рождения</span>
                    <div class="card-field-value">{{ card.birth || "—" }}</div>
                  </div>
                  <div class="card-field">
                    <span class="card-field-label">Место рождения</span>
                    <div class="card-field-value">{{ card.birthPlace || "—" }}</div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
      <div class="map-zoom-tools" role="group" aria-label="Масштаб карты">
        <button type="button" class="map-zoom-btn" title="Приблизить" aria-label="Приблизить" @click="zoomBy(1.15)">+</button>
        <button type="button" class="map-zoom-btn" title="Отдалить" aria-label="Отдалить" @click="zoomBy(1 / 1.15)">−</button>
      </div>
    </main>
    <button type="button" class="fab-add" aria-label="Добавить карточку" @click="store.showNewCardPanel = true">Добавить</button>
  </div>

  <div class="side-panel-backdrop" :aria-hidden="(!store.showNewCardPanel).toString()" @click="store.showNewCardPanel = false"></div>
  <aside class="side-panel" :class="{ 'is-open': store.showNewCardPanel }" :aria-hidden="(!store.showNewCardPanel).toString()">
    <div class="side-panel-inner">
      <h2 class="side-panel-title">Новая карточка</h2>
      <form class="side-panel-form" @submit.prevent="addCardFromDraft">
        <div class="side-panel-field"><label>ФИО</label><input v-model="store.newCardDraft.fio" type="text" /></div>
        <div class="side-panel-field"><label>Дата рождения</label><input v-model="store.newCardDraft.birth" type="text" /></div>
        <div class="side-panel-field"><label>Место рождения</label><input v-model="store.newCardDraft.birthPlace" type="text" /></div>
        <div class="side-panel-actions"><button type="submit" class="btn primary">Создать</button></div>
      </form>
    </div>
  </aside>

  <div class="side-panel-backdrop" :aria-hidden="(!store.showEditCardPanel).toString()" @click="store.showEditCardPanel = false"></div>
  <aside class="side-panel" :class="{ 'is-open': store.showEditCardPanel }" :aria-hidden="(!store.showEditCardPanel).toString()">
    <div class="side-panel-inner">
      <h2 class="side-panel-title">Редактирование карточки</h2>
      <form class="side-panel-form" @submit.prevent="saveEdit">
        <div class="side-panel-field"><label>ФИО</label><input v-model="store.editDraft.fio" type="text" /></div>
        <div class="side-panel-field"><label>Дата рождения</label><input v-model="store.editDraft.birth" type="text" /></div>
        <div class="side-panel-field"><label>Место рождения</label><input v-model="store.editDraft.birthPlace" type="text" /></div>
        <div class="side-panel-actions">
          <button type="button" class="btn" @click="store.showEditCardPanel = false">Отмена</button>
          <button type="submit" class="btn primary">Сохранить</button>
        </div>
      </form>
    </div>
  </aside>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from "vue";
import { useTreeStore } from "../state/treeStore";
import { useViewport } from "../composables/useViewport";
import { useCards } from "../composables/useCards";
import { useGraph } from "../composables/useGraph";

const SELF_CARD_ID = "m_self";
const store = useTreeStore();
const { viewportRef, worldStyle, zoomBy, onWheel, onPointerDown, onPointerMove, onPointerUp, fieldCoordsFromClient } =
  useViewport(store);
const { linksPath, portDown } = useGraph(store);
const { cardStyle, startDrag, onDragMove, onDragEnd, addCardFromDraft, openEdit, saveEdit } = useCards(store, {
  fieldCoordsFromClient,
});

onMounted(() => {
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragEnd);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", onDragEnd);
});
</script>

