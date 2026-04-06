<template>
  <div v-if="!tree.ready" class="project-bootstrap-overlay">
    <div class="project-bootstrap-panel">
      <h2 class="project-bootstrap-title">Пора приступить</h2>
      <p class="project-bootstrap-status">Загружаем проект…</p>
    </div>
  </div>

  <template v-else>
    <div v-if="tree.showWelcome" class="welcome-overlay">
      <div class="welcome-panel">
        <h2 class="welcome-title">Добро пожаловать в «Свои корни»</h2>
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
    </header>

    <TreeWorkspace />

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

watch(
  () => tree.currentProjectName,
  () => tree.scheduleSave()
);
</script>
