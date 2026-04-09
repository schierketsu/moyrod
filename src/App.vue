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
          <div class="auth-birth-parts">
            <input v-model="registerBirth.day" required type="number" min="1" max="31" placeholder="День" />
            <select v-model="registerBirth.month" required>
              <option v-for="(opt, idx) in birthMonthOptions" :key="`rbm-${idx}`" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <input v-model="registerBirth.year" required type="number" min="1000" max="3000" placeholder="Год" />
          </div>
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
        <div ref="userMenuRoot" class="toolbar-side toolbar-side--left">
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
      <div
        v-if="pendingImportRecommendation"
        class="link-delete-banner"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-project-banner-title"
      >
        <div class="link-delete-banner-inner">
          <p id="import-project-banner-title" class="link-delete-banner-text">
            {{ importProjectBannerText }}
          </p>
          <div class="link-delete-banner-actions">
            <button type="button" class="btn link-delete-banner-cancel" @click="cancelImportRecommendation">Отмена</button>
            <button type="button" class="btn primary link-delete-banner-confirm" @click="confirmImportRecommendation">
              Добавить
            </button>
          </div>
        </div>
      </div>
    </header>

    <template v-if="route.path !== '/myprofile'">
      <TreeWorkspace class="app-tree" />
    </template>

    <section v-else class="profile-page">
      <div class="profile-page-main">
        <div class="profile-page-head">
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
            <label
              v-if="!project.importSourceOwnerUid"
              class="profile-project-share-row"
              @click.stop
              @keydown.stop
            >
              <input
                type="checkbox"
                :checked="project.shareForMatching === true"
                @change="toggleProjectShare(project, $event)"
              />
              <span>Участвовать в поиске родственников</span>
            </label>
            <p v-else class="profile-project-import-meta">
              Проект принадлежит пользователю {{ project.importSourceOwnerName || `UID ${project.importSourceOwnerUid}` }}
            </p>
          </article>
        </div>
          <p v-if="!tree.projects.length" class="profile-empty-state">У вас пока нет проектов. Создайте первый проект.</p>
      </div>
      <aside class="profile-page-side">
        <div class="profile-side-card profile-recommendations-block">
          <div class="profile-side-head">
            <h3 class="profile-side-title">Совпадения с другими пользователями</h3>
            <div class="profile-matching-actions">
              <button type="button" class="btn" @click="loadMatching">Поиск</button>
            </div>
          </div>
          <div v-if="matching.length" class="profile-matching-list">
            <div
              v-for="(item, idx) in matching"
              :key="idx"
              class="profile-matching-item"
              :class="{
                'profile-matching-item--high': Number(item.score || 0) >= 76,
                'profile-matching-item--medium': Number(item.score || 0) >= 46 && Number(item.score || 0) < 76
              }"
            >
              <div class="profile-matching-top">
                <div class="profile-matching-fio">
                  <span
                    v-for="(line, lineIdx) in splitFioToLines(item.mine?.fio || item.other?.fio || '')"
                    :key="`m-${idx}-fio-${lineIdx}`"
                    :class="{ 'profile-matching-fio-surname': lineIdx === 0 }"
                  >{{ line }}</span>
                </div>
                <div class="profile-matching-avatar-placeholder" aria-hidden="true"></div>
              </div>
              <div class="profile-matching-card-actions">
                <button
                  type="button"
                  class="profile-matching-action-btn"
                  title="Открыть проект"
                  aria-label="Открыть проект"
                  @click="openRecommendedProject(item)"
                >
                  <img src="/icons/open.png" width="18" height="18" alt="" />
                </button>
                <button
                  type="button"
                  class="profile-matching-action-btn"
                  title="Добавить в коллекцию"
                  aria-label="Добавить в коллекцию"
                  @click="addRecommendedProject(item)"
                >
                  <img src="/icons/add.png" width="18" height="18" alt="" />
                </button>
              </div>
            </div>
          </div>
          <p v-else class="welcome-text">{{ matchingHint || "Пока нет рекомендаций." }}</p>
        </div>
      </aside>
    </section>

    <div v-if="tree.showStats && tree.currentProjectId" class="stats-overlay" @click.self="tree.showStats = false">
      <div class="stats-panel" role="dialog" aria-modal="true">
        <h2 class="stats-title">Статистика проекта</h2>
        <dl class="stats-dl">
          <div class="stats-dl-row"><dt>Карточек</dt><dd>{{ tree.cardCount }}</dd></div>
          <div class="stats-dl-row"><dt>Связей</dt><dd>{{ tree.linkCount }}</dd></div>
          <div class="stats-dl-row"><dt>Сохранён</dt><dd>{{ formattedSavedAt }}</dd></div>
        </dl>
      </div>
    </div>
    </div>
  </template>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TreeWorkspace from "./modules/tree/components/TreeWorkspace.vue";
import { useTreeStore } from "./modules/tree/state/treeStore";
import { useAuthStore } from "./modules/auth/state/authStore";
import { projectsApi } from "./shared/api/projectsApi";
import { authApi } from "./shared/api/authApi";
import { BIRTH_MONTH_OPTIONS, buildBirthFromParts } from "./shared/birthParts";

const tree = useTreeStore();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const welcome = reactive({ fio: "", birth: "", birthPlace: "" });
const authMode = ref("login");
const authError = ref("");
const showUserMenu = ref(false);
const userMenuRoot = ref(null);
const newProjectName = ref("");
const matching = ref([]);
const matchingHint = ref("");
const pendingImportRecommendation = ref(null);
const showCreateInput = ref(false);
const createInputRef = ref(null);
const loginForm = reactive({ uid: "", password: "" });
const birthMonthOptions = BIRTH_MONTH_OPTIONS.filter((opt) => opt.value);
const registerBirth = reactive({ day: "", month: "", year: "" });
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

function closeUserMenuOnOutsidePointer(ev) {
  if (!showUserMenu.value) return;
  const root = userMenuRoot.value;
  if (root && typeof root.contains === "function" && !root.contains(ev.target)) {
    showUserMenu.value = false;
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", closeUserMenuOnOutsidePointer, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeUserMenuOnOutsidePointer, true);
});

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
const importProjectBannerText = computed(() => {
  const item = pendingImportRecommendation.value;
  const fio = String(item?.other?.fio || item?.mine?.fio || "этот проект").trim() || "этот проект";
  return `Добавить проект с совпадением «${fio}» в вашу коллекцию?`;
});

watch(
  () => auth.user?.uid,
  (uid) => {
    tree.setShareFlagUserScope(uid);
  },
  { immediate: true }
);

watch(
  () => auth.isAuthenticated,
  async (isAuthed) => {
    if (isAuthed) {
      tree.setShareFlagUserScope(auth.user?.uid);
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
  await tree.refreshProjects();
  await loadMatching();
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
  registerForm.birthDate = buildBirthFromParts(registerBirth);
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

function blockingReasonLabel(code) {
  const map = {
    only_one_user_in_db: "в базе только один пользователь — нужен второй аккаунт",
    no_others_in_pool: "другие есть, но их карточки не в пуле (выключено участие или пустые поля)",
    no_sharing_projects: "ни один ваш проект не отмечен для участия в подборе",
    no_own_cards_in_pool: "в пуле нет ваших карточек с ФИО/датой/местом",
    no_comparable_pairs: "нет пар с полями ФИО/дата/место для сравнения",
    below_threshold: "совпадения слишком слабые по баллу",
    ok: "",
  };
  return map[code] || code;
}

function matchingChanceLabel(score) {
  const s = Number(score || 0);
  if (s >= 76) return "ВЫСОКИЙ ШАНС";
  return "СРЕДНИЙ ШАНС";
}

function splitFioToLines(fio) {
  const parts = String(fio || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["—"];
  return parts;
}

async function loadMatching() {
  try {
    const { suggestions, meta } = await authApi.matchingSuggestions();
    const filtered = (Array.isArray(suggestions) ? suggestions : []).filter((x) => Number(x?.score || 0) >= 46);
    matching.value = filtered;
    matchingHint.value = filtered.length === 0 ? String(meta?.hint || "").trim() : "";
  } catch (e) {
    matching.value = [];
    matchingHint.value = e?.message
      ? `Не удалось загрузить совпадения: ${e.message}`
      : "Не удалось загрузить совпадения. Проверьте, что сервер запущен и вы вошли в аккаунт.";
  }
}

async function toggleProjectShare(project, event) {
  event?.stopPropagation?.();
  const next = !(project.shareForMatching === true);
  try {
    await projectsApi.updateProjectShareForMatching(project.id, next);
    await tree.refreshProjects();
    if (tree.currentProjectId === project.id) {
      tree.shareForMatching = next;
    }
    await loadMatching();
  } catch (e) {
    matchingHint.value = `Не удалось сохранить участие в подборе: ${e?.message || String(e)}`.trim();
  }
}

async function importRecommendedProject(item) {
  const sourceProjectId = Number(item?.other?.projectId);
  if (!Number.isFinite(sourceProjectId) || sourceProjectId <= 0) return;
  pendingImportRecommendation.value = item;
}

function addRecommendedProject(item) {
  importRecommendedProject(item);
}

async function openRecommendedProject(item) {
  const sourceProjectId = Number(item?.other?.projectId);
  const sourceOwnerUid = Number(item?.other?.ownerUid || 0) || null;
  if (!Number.isFinite(sourceProjectId) || sourceProjectId <= 0) return;
  try {
    await tree.openSharedProject(sourceProjectId, sourceOwnerUid);
    if (route.path === "/myprofile") await router.push("/");
  } catch (e) {
    matchingHint.value = `Не удалось открыть проект: ${e?.message || String(e)}`.trim();
  }
}

function cancelImportRecommendation() {
  pendingImportRecommendation.value = null;
}

async function confirmImportRecommendation() {
  const item = pendingImportRecommendation.value;
  if (!item) return;
  const sourceProjectId = Number(item?.other?.projectId);
  const sourceOwnerUid = Number(item?.other?.ownerUid || 0) || null;
  pendingImportRecommendation.value = null;
  try {
    await projectsApi.importMatchingProject(sourceProjectId, sourceOwnerUid);
    await tree.refreshProjects();
    matchingHint.value = "Проект добавлен в вашу коллекцию.";
  } catch (e) {
    matchingHint.value = `Не удалось добавить проект: ${e?.message || String(e)}`.trim();
  }
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
