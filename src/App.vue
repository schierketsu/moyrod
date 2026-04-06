<template>
  <div v-if="!tree.ready" class="project-bootstrap-overlay">
    <div class="project-bootstrap-panel">
      <h2 class="project-bootstrap-title">Пора приступить</h2>
      <p class="project-bootstrap-status">Загружаем проект…</p>
    </div>
  </div>

  <template v-else>
    <div class="app-main">
    <div v-if="tree.showWelcome" class="welcome-overlay">
      <div class="welcome-panel">
        <h2 class="welcome-title">Добро пожаловать в «Свои корни»</h2>
        <p class="welcome-text">
          Здесь можно собирать родословную на поле: карточки людей и связи между ними. Начните с себя — укажите ваши данные.
        </p>
        <form class="welcome-form" @submit.prevent="tree.submitWelcome(welcome)">
          <div class="welcome-field">
            <label>ФИО</label>
            <input v-model="welcome.fio" required type="text" placeholder="Фамилия имя отчество" />
          </div>
          <div class="welcome-field">
            <label>Дата рождения</label>
            <input v-model="welcome.birth" type="text" />
          </div>
          <div class="welcome-field">
            <label>Место рождения</label>
            <input v-model="welcome.birthPlace" type="text" />
          </div>
          <button type="submit" class="btn primary welcome-submit">Продолжить</button>
        </form>
      </div>
    </div>

    <header class="toolbar">
      <div class="toolbar-inner toolbar-inner--tripart">
        <div class="toolbar-side toolbar-side--left" aria-hidden="true"></div>
        <h1 class="logo"><span class="logo-line">свои</span><span class="logo-line">корни</span></h1>
        <div class="toolbar-side toolbar-side--right">
          <div class="toolbar-project-tools">
            <button type="button" class="btn toolbar-project-title" @click="tree.showStats = true">
              {{ tree.currentProjectName }}
            </button>
          </div>
        </div>
      </div>
      <div
        v-if="tree.pendingLinkDeletePayload"
        class="link-delete-banner"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-delete-banner-title"
      >
        <div class="link-delete-banner-inner">
          <p id="link-delete-banner-title" class="link-delete-banner-text">
            {{ linkDeleteBannerText }}
          </p>
          <div class="link-delete-banner-actions">
            <button type="button" class="btn link-delete-banner-cancel" @click="tree.cancelLinkDelete()">Отмена</button>
            <button type="button" class="btn primary link-delete-banner-confirm" @click="tree.confirmLinkDelete()">Удалить связь</button>
          </div>
        </div>
      </div>
    </header>

    <TreeWorkspace class="app-tree" />

    <div v-if="tree.showStats" class="stats-overlay" @click.self="tree.showStats = false">
      <div class="stats-panel" role="dialog" aria-modal="true">
        <h2 class="stats-title">Статистика проекта</h2>
        <dl class="stats-dl">
          <div class="stats-dl-row"><dt>Карточек</dt><dd>{{ tree.cardCount }}</dd></div>
          <div class="stats-dl-row"><dt>Связей</dt><dd>{{ tree.linkCount }}</dd></div>
          <div class="stats-dl-row"><dt>Сохранён</dt><dd>{{ formattedSavedAt }}</dd></div>
        </dl>
        <div class="side-panel-field">
          <label>Название проекта</label>
          <input v-model="tree.currentProjectName" type="text" maxlength="200" />
        </div>
      </div>
    </div>
    </div>
  </template>
</template>

<script setup>
import { computed, reactive, watch } from "vue";
import TreeWorkspace from "./modules/tree/components/TreeWorkspace.vue";
import { useTreeStore } from "./modules/tree/state/treeStore";

const tree = useTreeStore();
const welcome = reactive({ fio: "", birth: "", birthPlace: "" });
void tree.bootstrap();

const formattedSavedAt = computed(() =>
  tree.lastProjectUpdatedAt ? new Date(tree.lastProjectUpdatedAt).toLocaleString("ru-RU") : "—"
);
const linkDeleteBannerText = computed(() => {
  const p = tree.pendingLinkDeletePayload;
  if (!p) return "";
  if (p.kind === "spouse") return "Удалить связь пары?";
  if (p.kind === "childOfUnion") return "Удалить связь ребенка с союзом?";
  return "Удалить родительскую связь?";
});

watch(
  () => tree.currentProjectName,
  () => tree.scheduleSave()
);
</script>

<style>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-tree {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
