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
            <button type="button" class="btn" @click="openMyProfile">Мой профиль</button>
            <button type="button" class="btn" @click="logout">Выйти</button>
          </div>
        </div>
        <h1 class="logo"><span class="logo-line">свои</span><span class="logo-line">корни</span></h1>
        <div v-if="route.path !== '/myprofile'" class="toolbar-side toolbar-side--right">
          <div class="toolbar-project-tools">
            <button
              v-if="tree.currentProjectId"
              type="button"
              class="btn toolbar-project-title"
              @click="tree.showStats = true"
            >
              {{ tree.currentProjectName }}
            </button>
            <span v-else class="toolbar-no-project">Нет проекта</span>
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

    <template v-if="route.path !== '/myprofile'">
      <TreeWorkspace class="app-tree" />
    </template>

    <section v-else class="profile-page">
      <div class="profile-page-main">
        <div class="profile-page-head profile-section-head">
          <h2 class="profile-page-title">Мой профиль</h2>
          <div class="profile-create-row">
            <input
              v-if="showCreateInput"
              ref="createInputRef"
              v-model="newProjectName"
              type="text"
              maxlength="200"
              placeholder="Название нового проекта"
            />
            <button
              type="button"
              class="btn primary profile-create-btn"
              :class="{ 'is-ready': !!newProjectName.trim() }"
              @click="createProject"
            >
              Создать
            </button>
          </div>
        </div>
        <div class="profile-side-card profile-recommendations-block">
          <div class="profile-side-head">
            <h3 class="profile-side-title">Рекомендации родственников</h3>
            <button type="button" class="btn" @click="loadMatching">Обновить</button>
          </div>
          <div v-if="matching.length" class="profile-matching-list">
            <div v-for="(item, idx) in matching" :key="idx" class="profile-matching-item">
              <strong>score {{ item.score }}</strong>
              <span>{{ item.mine?.fio || "—" }} ↔ {{ item.other?.fio || "—" }}</span>
              <small>UID {{ item.other?.ownerUserId }}</small>
            </div>
          </div>
          <p v-else class="welcome-text">Пока нет рекомендаций.</p>
        </div>
        <div class="profile-projects-grid" role="list">
          <article
            v-for="project in tree.projects"
            :key="project.id"
            class="profile-project-card"
            :class="{ 'is-active': tree.currentProjectId === project.id }"
            role="listitem"
            tabindex="0"
            @click="openProject(project.id)"
            @keydown.enter.prevent="openProject(project.id)"
            @keydown.space.prevent="openProject(project.id)"
          >
            <button
              type="button"
              class="profile-project-delete"
              aria-label="Удалить проект"
              title="Удалить проект"
              @click.stop="deleteProject(project.id)"
            >
              <img class="profile-project-delete-icon" src="/icons/garbage.png" width="18" height="18" alt="" />
            </button>
            <header class="profile-project-top">
              <h3 class="profile-project-name">{{ project.name || "Без названия" }}</h3>
              <p class="profile-project-meta">ID {{ project.id }}</p>
            </header>
          </article>
        </div>
          <p v-if="!tree.projects.length" class="profile-empty-state">У вас пока нет проектов. Создайте первый проект.</p>
      </div>
    </section>

    <div v-if="tree.showStats && tree.currentProjectId" class="stats-overlay" @click.self="tree.showStats = false">
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
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TreeWorkspace from "./modules/tree/components/TreeWorkspace.vue";
import { useTreeStore } from "./modules/tree/state/treeStore";
import { useAuthStore } from "./modules/auth/state/authStore";
import { projectsApi } from "./shared/api/projectsApi";
import { authApi } from "./shared/api/authApi";

const tree = useTreeStore();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const welcome = reactive({ fio: "", birth: "", birthPlace: "" });
const authMode = ref("login");
const authError = ref("");
const showUserMenu = ref(false);
const newProjectName = ref("");
const matching = ref([]);
const showCreateInput = ref(false);
const createInputRef = ref(null);
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
      if (route.path === "/myprofile") {
        await refreshProfileData();
      }
    } else {
      tree.ready = true;
      if (route.path === "/myprofile") router.replace("/");
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

watch(
  () => route.path,
  async (path) => {
    if (path === "/myprofile" && auth.isAuthenticated) {
      await refreshProfileData();
    }
  }
);

async function refreshProfileData() {
  matching.value = [];
  await tree.refreshProjects();
}

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
  if (route.path === "/myprofile") router.replace("/");
}

async function openMyProfile() {
  showUserMenu.value = false;
  await router.push("/myprofile");
}

async function createProject() {
  if (!showCreateInput.value) {
    showCreateInput.value = true;
    await nextTick();
    createInputRef.value?.focus?.();
    return;
  }
  const name = newProjectName.value.trim();
  if (!name) return;
  await tree.createProject(name);
  newProjectName.value = "";
  showCreateInput.value = false;
}

async function openProject(id) {
  await tree.openProject(id);
  if (route.path === "/myprofile") await router.push("/");
}

async function deleteProject(id) {
  await tree.deleteProject(id);
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
