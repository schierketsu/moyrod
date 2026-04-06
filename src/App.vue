<template>
  <div v-if="!auth.ready || (auth.isAuthenticated && !tree.ready)" class="project-bootstrap-overlay">
    <div class="project-bootstrap-panel">
      <h2 class="project-bootstrap-title">Пора приступить</h2>
      <p class="project-bootstrap-status">Загружаем проект…</p>
    </div>
  </div>

  <div v-else-if="!auth.isAuthenticated" class="welcome-overlay">
    <div class="welcome-panel">
      <h2 class="welcome-title">{{ authMode === "login" ? "Вход" : "Регистрация" }}</h2>
      <form v-if="authMode === 'login'" class="welcome-form" @submit.prevent="submitLogin">
        <div class="welcome-field">
          <label>UID</label>
          <input v-model="loginForm.uid" required type="number" min="10000" />
        </div>
        <div class="welcome-field">
          <label>Пароль</label>
          <input v-model="loginForm.password" required type="password" minlength="6" />
        </div>
        <button type="submit" class="btn primary welcome-submit">Войти</button>
      </form>
      <form v-else class="welcome-form" @submit.prevent="submitRegister">
        <div class="welcome-field">
          <label>ФИО</label>
          <input v-model="registerForm.fullName" required type="text" />
        </div>
        <div class="welcome-field">
          <label>Дата рождения</label>
          <input v-model="registerForm.birthDate" required type="date" />
        </div>
        <div class="welcome-field">
          <label>Место рождения</label>
          <input
            v-model="registerForm.birthPlace"
            required
            type="text"
            @input="onBirthPlaceInput"
            placeholder="Начните вводить населенный пункт"
          />
          <div v-if="placeSuggestions.length" class="autocomplete-dropdown">
            <button
              v-for="item in placeSuggestions"
              :key="item.value"
              type="button"
              class="autocomplete-item"
              @click="pickBirthPlace(item.value)"
            >
              {{ item.value }}
            </button>
          </div>
        </div>
        <div class="welcome-field">
          <label>Пароль</label>
          <input v-model="registerForm.password" required type="password" minlength="6" />
        </div>
        <button type="submit" class="btn primary welcome-submit">Зарегистрироваться</button>
      </form>
      <p v-if="authError" class="welcome-text">{{ authError }}</p>
      <div class="stats-actions">
        <button type="button" class="btn" @click="authMode = authMode === 'login' ? 'register' : 'login'">
          {{ authMode === "login" ? "Нет аккаунта? Регистрация" : "Уже есть аккаунт? Войти" }}
        </button>
      </div>
    </div>
  </div>

  <template v-else>
    <div class="app-main">
    <div v-if="tree.showWelcome && !auth.isAuthenticated" class="welcome-overlay">
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
            <input v-model="welcome.birth" type="date" />
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
        <div class="toolbar-side toolbar-side--left">
          <button type="button" class="btn toolbar-project-title" @click="showUserMenu = !showUserMenu">
            UID {{ auth.user?.uid }}
          </button>
          <div v-if="showUserMenu" class="auth-menu">
            <button type="button" class="btn" @click="openMyProjects">Мои проекты</button>
            <button type="button" class="btn" @click="logout">Выйти</button>
          </div>
        </div>
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
        v-if="tree.pendingLinkDeletePayload || tree.pendingCardDeleteId"
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
            <button type="button" class="btn link-delete-banner-cancel" @click="cancelDelete">Отмена</button>
            <button type="button" class="btn primary link-delete-banner-confirm" @click="confirmDelete">Удалить</button>
          </div>
        </div>
      </div>
    </header>

    <TreeWorkspace class="app-tree" />

    <div v-if="showProjectsPanel" class="stats-overlay" @click.self="showProjectsPanel = false">
      <div class="stats-panel" role="dialog" aria-modal="true">
        <h2 class="stats-title">Мои проекты</h2>
        <div class="side-panel-field">
          <label>Новый проект</label>
          <input v-model="newProjectName" type="text" maxlength="200" placeholder="Название проекта" />
        </div>
        <div class="stats-actions">
          <button type="button" class="btn primary" @click="createProject">Создать</button>
          <button type="button" class="btn" @click="loadMatching">Найти похожих родственников</button>
        </div>
        <div class="stats-actions" style="flex-direction: column; align-items: stretch">
          <button
            v-for="project in tree.projects"
            :key="project.id"
            type="button"
            class="btn"
            @click="openProject(project.id)"
          >
            {{ project.name || "Без названия" }} (ID {{ project.id }})
          </button>
          <button
            v-if="tree.currentProjectId"
            type="button"
            class="btn"
            @click="deleteCurrentProject"
          >
            Удалить текущий проект
          </button>
        </div>
        <div v-if="matching.length" class="stats-actions" style="flex-direction: column; align-items: stretch">
          <h3 class="stats-title" style="font-size: 1rem; margin: 0.5rem 0 0">Совпадения</h3>
          <div v-for="(item, idx) in matching" :key="idx" class="welcome-text" style="margin: 0">
            score {{ item.score }}: {{ item.mine?.fio || "—" }} ↔ {{ item.other?.fio || "—" }} (UID {{ item.other?.ownerUserId }})
          </div>
        </div>
      </div>
    </div>

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
        <label class="side-panel-check">
          <input v-model="tree.shareForMatching" type="checkbox" />
          Участвовать в поиске похожих родственников (весь проект)
        </label>
      </div>
    </div>
    </div>
  </template>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";
import TreeWorkspace from "./modules/tree/components/TreeWorkspace.vue";
import { useTreeStore } from "./modules/tree/state/treeStore";
import { useAuthStore } from "./modules/auth/state/authStore";
import { projectsApi } from "./shared/api/projectsApi";
import { authApi } from "./shared/api/authApi";

const tree = useTreeStore();
const auth = useAuthStore();
const welcome = reactive({ fio: "", birth: "", birthPlace: "" });
const authMode = ref("login");
const authError = ref("");
const showUserMenu = ref(false);
const showProjectsPanel = ref(false);
const newProjectName = ref("");
const matching = ref([]);
const loginForm = reactive({ uid: "", password: "" });
const registerForm = reactive({
  fullName: "",
  birthDate: "",
  birthPlace: "",
  birthPlaceConfirmed: false,
  password: "",
});
const placeSuggestions = ref([]);
let suggestTimer = null;
void auth.bootstrap();

const formattedSavedAt = computed(() =>
  tree.lastProjectUpdatedAt ? new Date(tree.lastProjectUpdatedAt).toLocaleString("ru-RU") : "—"
);
const linkDeleteBannerText = computed(() => {
  if (tree.pendingCardDeleteId) return "Удалить карточку?";
  const p = tree.pendingLinkDeletePayload;
  if (!p) return "";
  if (p.kind === "spouse") return "Удалить связь пары?";
  if (p.kind === "childOfUnion") return "Удалить связь?";
  return "Удалить родительскую связь?";
});

watch(
  () => auth.isAuthenticated,
  async (isAuthed) => {
    if (isAuthed) {
      await tree.bootstrap();
      ensureSelfCardFromAuthProfile();
    } else {
      tree.ready = true;
    }
  },
  { immediate: true }
);

watch(
  () => [tree.showWelcome, auth.user?.id],
  () => {
    ensureSelfCardFromAuthProfile();
  }
);

function ensureSelfCardFromAuthProfile() {
  if (!auth.isAuthenticated || !auth.user) return;
  if (!tree.showWelcome) return;
  tree.submitWelcome({
    fio: auth.user.full_name || "",
    birth: auth.user.birth_date || "",
    birthPlace: auth.user.birth_place || "",
  });
}

function onBirthPlaceInput() {
  registerForm.birthPlaceConfirmed = false;
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(async () => {
    const q = registerForm.birthPlace.trim();
    if (q.length < 2) {
      placeSuggestions.value = [];
      return;
    }
    placeSuggestions.value = await projectsApi.suggestPlaces(q);
  }, 200);
}

function pickBirthPlace(value) {
  registerForm.birthPlace = value;
  registerForm.birthPlaceConfirmed = true;
  placeSuggestions.value = [];
}

async function submitRegister() {
  authError.value = "";
  if (!registerForm.fullName || !registerForm.birthDate || !registerForm.birthPlace || !registerForm.password) {
    authError.value = "Заполните все обязательные поля.";
    return;
  }
  if (!registerForm.birthPlaceConfirmed) {
    authError.value = "Место рождения нужно выбрать из подсказки.";
    return;
  }
  try {
    await auth.register({ ...registerForm });
  } catch (e) {
    authError.value = "Не удалось зарегистрироваться.";
  }
}

async function submitLogin() {
  authError.value = "";
  try {
    await auth.login(Number(loginForm.uid), loginForm.password);
  } catch {
    authError.value = "Неверный UID или пароль.";
  }
}

async function logout() {
  await auth.logout();
  showUserMenu.value = false;
}

async function openMyProjects() {
  showUserMenu.value = false;
  showProjectsPanel.value = true;
  matching.value = [];
  await tree.refreshProjects();
}

async function createProject() {
  await tree.createProject(newProjectName.value.trim() || "Мой проект");
  newProjectName.value = "";
}

async function openProject(id) {
  await tree.openProject(id);
  showProjectsPanel.value = false;
}

async function deleteCurrentProject() {
  if (!tree.currentProjectId) return;
  await tree.deleteProject(tree.currentProjectId);
}

async function loadMatching() {
  matching.value = await authApi.matchingSuggestions();
}

function cancelDelete() {
  tree.cancelLinkDelete();
  tree.cancelCardDelete();
}

function confirmDelete() {
  if (tree.pendingCardDeleteId) {
    tree.confirmCardDelete();
    return;
  }
  tree.confirmLinkDelete();
}
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
