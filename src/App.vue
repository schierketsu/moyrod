<template>
  <div v-if="!auth.ready || (auth.isAuthenticated && !tree.ready)" class="project-bootstrap-overlay">
    <div class="project-bootstrap-panel">
      <h2 class="project-bootstrap-title">Пора приступить</h2>
      <p class="project-bootstrap-status">Загружаем проект…</p>
    </div>
  </div>

  <div v-else-if="!auth.isAuthenticated" class="welcome-overlay">
    <div class="welcome-panel">
      <div v-if="inviteRouteToken" class="invite-login-callout">
        <p v-if="inviteLoginLoading" class="welcome-text">Проверка приглашения…</p>
        <template v-else-if="inviteLoginPreview">
          <p class="invite-login-callout-title">Приглашение в проект</p>
          <p class="welcome-text">
            Вас пригласили в проект «{{ inviteLoginPreview.projectName }}». Войдите или зарегистрируйтесь, чтобы добавить его в свою коллекцию.
          </p>
          <p v-if="inviteLoginPreview.ownerName || inviteLoginPreview.ownerUid" class="welcome-text invite-login-callout-owner">
            <template v-if="inviteLoginPreview.ownerName">{{ inviteLoginPreview.ownerName }}</template>
            <template v-if="inviteLoginPreview.ownerUid">
              <template v-if="inviteLoginPreview.ownerName"> · </template>
              UID {{ inviteLoginPreview.ownerUid }}
            </template>
          </p>
        </template>
        <p v-else-if="inviteLoginError" class="welcome-text">{{ inviteLoginError }}</p>
      </div>
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
    <div v-if="shareGraphicBusy" class="export-graphic-overlay" aria-live="polite">
      <p class="export-graphic-overlay-text">Готовим изображение дерева…</p>
    </div>
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
        <div v-if="route.path !== '/myprofile' && !isInviteRoute" class="toolbar-side toolbar-side--right">
          <div class="toolbar-project-tools">
            <button
              v-if="tree.currentProjectId"
              type="button"
              class="btn toolbar-project-title"
              @click="onProjectToolbarClick"
            >
              {{ route.path === "/project-stats" ? "К дереву" : tree.currentProjectName }}
            </button>
            <span v-else class="toolbar-no-project">Нет проекта</span>
          </div>
        </div>
      </div>
      <div
        v-if="tree.pendingLinkDeletePayload || tree.pendingCardDeleteId || pendingProfileProjectDeleteId != null"
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

    <section v-if="route.path === '/myprofile'" class="profile-page">
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
            <div class="profile-project-menu-root">
              <button
                type="button"
                class="profile-project-menu-trigger"
                aria-label="Меню проекта"
                title="Меню проекта"
                aria-haspopup="menu"
                :aria-expanded="profileProjectMenuOpenId === project.id"
                @click.stop="toggleProfileProjectMenu(project.id)"
              >
                <img class="profile-project-menu-icon" src="/icons/menu.png" width="20" height="20" alt="" />
              </button>
              <div
                v-if="profileProjectMenuOpenId === project.id"
                class="profile-project-menu-dropdown"
                role="menu"
                @click.stop
              >
                <button type="button" class="profile-project-menu-item" role="menuitem" @click="openProjectParameters(project.id)">
                  Параметры
                </button>
                <button type="button" class="profile-project-menu-item profile-project-menu-item--danger" role="menuitem" @click="deleteProjectFromMenu(project.id)">
                  Удалить
                </button>
              </div>
            </div>
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

    <section v-else-if="route.path === '/project-stats'" class="profile-page">
      <div class="profile-page-main">
        <div class="profile-page-head">
          <div class="profile-stats-head-top">
            <div>
              <h2 class="profile-page-title">Параметры проекта</h2>
              <p v-if="tree.currentProjectName" class="profile-stats-project-meta">
                {{ tree.currentProjectName }}
                <span v-if="tree.currentProjectId" class="profile-stats-project-id"> · ID {{ tree.currentProjectId }}</span>
              </p>
            </div>
          </div>
        </div>
        <div class="profile-section project-stats-section">
          <dl class="stats-dl stats-dl--profile">
            <div class="stats-dl-row"><dt>Карточек</dt><dd>{{ tree.cardCount }}</dd></div>
            <div class="stats-dl-row"><dt>Связей</dt><dd>{{ tree.linkCount }}</dd></div>
            <div class="stats-dl-row"><dt>Сохранён</dt><dd>{{ formattedSavedAt }}</dd></div>
          </dl>
        </div>
        <div v-if="tree.currentProjectId" class="profile-section project-stats-export-image">
          <h3 class="project-stats-share-title">Поделиться изображением</h3>
          <p class="welcome-text project-stats-share-hint">
            Сохраните дерево как PNG в высоком разрешении: удобно отправить в мессенджер или распечатать.
          </p>
          <button
            type="button"
            class="btn primary project-stats-export-btn"
            :disabled="shareGraphicBusy || !tree.cards.length"
            @click="downloadProjectShareGraphic"
          >
            {{ shareGraphicBusy ? "Подождите…" : "Поделиться" }}
          </button>
          <p v-if="shareGraphicError" class="welcome-text project-stats-share-error">{{ shareGraphicError }}</p>
        </div>
        <div v-if="!tree.currentProjectReadOnly && tree.currentProjectId" class="profile-section project-stats-share">
          <h3 class="project-stats-share-title">Передать проект по ссылке</h3>
          <p class="welcome-text project-stats-share-hint">
            Каждая ссылка одноразовая: перестаёт действовать после принятия или отказа. Несколько активных ссылок могут существовать
            одновременно. Убрать ожидающую ссылку можно только кнопкой «Аннулировать».
          </p>
          <button type="button" class="btn primary project-stats-share-create" :disabled="shareInviteBusy" @click="createShareInviteLink">
            {{ shareInviteBusy ? "Создаём…" : "Создать ссылку-приглашение" }}
          </button>
          <div class="project-stats-invites-table-wrap">
            <table v-if="shareInvitesList.length" class="project-stats-invites-table">
              <thead>
                <tr>
                  <th scope="col">Создана</th>
                  <th scope="col">Ссылка</th>
                  <th scope="col">Статус</th>
                  <th scope="col" class="project-stats-invites-th-actions">Действия</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in shareInvitesList" :key="row.token">
                  <td>{{ formatShareInviteDate(row.createdAt) }}</td>
                  <td class="project-stats-invites-url-cell">
                    <span class="project-stats-invites-url" :title="shareInviteFullUrl(row.token)">{{
                      shareInviteShortUrl(row.token)
                    }}</span>
                  </td>
                  <td>{{ shareInviteStatusLabel(row.status) }}</td>
                  <td>
                    <div class="project-stats-invites-actions">
                      <button type="button" class="btn project-stats-invite-copy-btn" @click="copyShareInviteToken(row.token)">
                        Копировать
                      </button>
                      <button
                        v-if="row.status === 'pending'"
                        type="button"
                        class="btn project-stats-invite-annul-btn"
                        :disabled="shareInviteAnnulToken === row.token"
                        @click="annulShareInviteRow(row.token)"
                      >
                        {{ shareInviteAnnulToken === row.token ? "…" : "Аннулировать" }}
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="welcome-text project-stats-invites-empty">Пока нет созданных ссылок.</p>
          </div>
          <p v-if="shareInviteError" class="welcome-text project-stats-share-error">{{ shareInviteError }}</p>
        </div>
      </div>
      <aside class="profile-page-side" aria-hidden="true"></aside>
    </section>

    <ProjectInviteAcceptPage v-else-if="isInviteRoute" />
    <TreeWorkspace v-else ref="treeWorkspaceRef" class="app-tree" />
    </div>
  </template>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TreeWorkspace from "./modules/tree/components/TreeWorkspace.vue";
import ProjectInviteAcceptPage from "./modules/invite/ProjectInviteAcceptPage.vue";
import { useTreeStore } from "./modules/tree/state/treeStore";
import { useAuthStore } from "./modules/auth/state/authStore";
import { projectsApi } from "./shared/api/projectsApi";
import { authApi } from "./shared/api/authApi";
import { BIRTH_MONTH_OPTIONS, buildBirthFromParts } from "./shared/birthParts";

const tree = useTreeStore();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const treeWorkspaceRef = ref(null);
const shareGraphicBusy = ref(false);
const shareGraphicError = ref("");
const welcome = reactive({ fio: "", birth: "", birthPlace: "" });
const authMode = ref("login");
const authError = ref("");
const showUserMenu = ref(false);
const userMenuRoot = ref(null);
const profileProjectMenuOpenId = ref(null);
const pendingProfileProjectDeleteId = ref(null);
watch(
  () => route.fullPath,
  () => {
    profileProjectMenuOpenId.value = null;
    pendingProfileProjectDeleteId.value = null;
  }
);
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

const isInviteRoute = computed(() => route.name === "projectInvite");
const inviteRouteToken = computed(() =>
  isInviteRoute.value ? String(route.params.token || "").trim() : ""
);

const inviteLoginLoading = ref(false);
const inviteLoginPreview = ref(null);
const inviteLoginError = ref("");

const shareInviteBusy = ref(false);
const shareInviteError = ref("");
const shareInvitesList = ref([]);
const shareInviteAnnulToken = ref(null);

function shareInviteStatusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return "Ожидает";
  if (s === "accepted") return "Принял";
  if (s === "declined") return "Отказано";
  if (s === "annulled" || s === "revoked") return "Аннулирована";
  return s || "—";
}

function shareInviteFullUrl(token) {
  return `${window.location.origin}/invite/${token}`;
}

function shareInviteShortUrl(token) {
  const t = String(token || "");
  if (t.length <= 14) return shareInviteFullUrl(t);
  return `${window.location.origin}/invite/${t.slice(0, 10)}…`;
}

function formatShareInviteDate(createdAt) {
  const n = Number(createdAt);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Date(n).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadShareInviteList() {
  if (!tree.currentProjectId || tree.currentProjectReadOnly) {
    shareInvitesList.value = [];
    return;
  }
  try {
    const data = await projectsApi.listProjectShareInvites(tree.currentProjectId);
    shareInvitesList.value = Array.isArray(data?.invites) ? data.invites : [];
  } catch {
    shareInvitesList.value = [];
  }
}

watch(
  () => [auth.isAuthenticated, inviteRouteToken.value],
  async () => {
    if (auth.isAuthenticated || !inviteRouteToken.value || inviteRouteToken.value.length < 16) {
      inviteLoginPreview.value = null;
      inviteLoginError.value = "";
      inviteLoginLoading.value = false;
      return;
    }
    inviteLoginLoading.value = true;
    inviteLoginError.value = "";
    inviteLoginPreview.value = null;
    try {
      const data = await projectsApi.getShareInviteInfo(inviteRouteToken.value);
      if (data?.ok) {
        inviteLoginPreview.value = {
          projectName: data.projectName || "Проект",
          ownerUid: data.ownerUid,
          ownerName: data.ownerName || null,
        };
      } else {
        inviteLoginError.value = "Приглашение недействительно.";
      }
    } catch (e) {
      if (e?.status === 410) {
        inviteLoginError.value = "Ссылка уже использована или приглашение отклонено.";
      } else {
        inviteLoginError.value = "Приглашение не найдено или ссылка устарела.";
      }
    } finally {
      inviteLoginLoading.value = false;
    }
  },
  { immediate: true }
);

function closeUserMenuOnOutsidePointer(ev) {
  if (!showUserMenu.value) return;
  const root = userMenuRoot.value;
  if (root && typeof root.contains === "function" && !root.contains(ev.target)) {
    showUserMenu.value = false;
  }
}

function closeProfileProjectMenuOnOutsidePointer(ev) {
  if (profileProjectMenuOpenId.value == null) return;
  const t = ev.target;
  if (t && typeof t.closest === "function" && t.closest(".profile-project-menu-root")) return;
  profileProjectMenuOpenId.value = null;
}

function onGlobalPointerDownCloseMenus(ev) {
  closeUserMenuOnOutsidePointer(ev);
  closeProfileProjectMenuOnOutsidePointer(ev);
}

function toggleProfileProjectMenu(projectId) {
  profileProjectMenuOpenId.value = profileProjectMenuOpenId.value === projectId ? null : projectId;
}

onMounted(() => {
  document.addEventListener("pointerdown", onGlobalPointerDownCloseMenus, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onGlobalPointerDownCloseMenus, true);
});

const formattedSavedAt = computed(() =>
  tree.lastProjectUpdatedAt ? new Date(tree.lastProjectUpdatedAt).toLocaleString("ru-RU") : "—"
);
const linkDeleteBannerText = computed(() => {
  const delProjectId = pendingProfileProjectDeleteId.value;
  if (delProjectId != null) {
    const proj = tree.projects.find((x) => x.id === delProjectId);
    const name = String(proj?.name || "").trim() || "этот проект";
    return `Удалить проект «${name}»?`;
  }
  if (tree.pendingCardDeleteId) return "Удалить карточку?";
  const p = tree.pendingLinkDeletePayload;
  if (!p) return "";
  if (p.kind === "spouse") return "Удалить связь пары?";
  if (p.kind === "childOfUnion") return "Удалить связь?";
  return "Удалить связь?";
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
      if (route.path === "/myprofile" || route.path === "/project-stats") router.replace("/");
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
  () => [route.path, tree.currentProjectId, tree.currentProjectReadOnly, tree.ready, auth.isAuthenticated],
  async () => {
    const path = route.path;
    if (path === "/myprofile" && auth.isAuthenticated) {
      await refreshProfileData();
    }
    if (path !== "/project-stats") {
      shareInviteError.value = "";
      shareInvitesList.value = [];
    } else if (auth.isAuthenticated && tree.ready) {
      await loadShareInviteList();
    }
    if (!auth.isAuthenticated || !tree.ready) return;
    if (path === "/project-stats" && !tree.currentProjectId) {
      router.replace("/");
    }
  },
  { immediate: true }
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
    const t = inviteRouteToken.value;
    if (t) await router.replace(`/invite/${t}`);
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
  if (route.path === "/myprofile" || route.path === "/project-stats") router.replace("/");
}

async function openMyProfile() {
  showUserMenu.value = false;
  await router.push("/myprofile");
}

function onProjectToolbarClick() {
  if (!tree.currentProjectId) return;
  if (route.path === "/project-stats") {
    router.push("/");
  } else {
    router.push("/project-stats");
  }
}

async function createShareInviteLink() {
  if (!tree.currentProjectId || tree.currentProjectReadOnly) return;
  shareInviteBusy.value = true;
  shareInviteError.value = "";
  try {
    const data = await projectsApi.createProjectShareInvite(tree.currentProjectId);
    const tok = data?.token;
    if (!tok) {
      shareInviteError.value = "Не удалось получить ссылку.";
      return;
    }
    await loadShareInviteList();
    try {
      await navigator.clipboard.writeText(shareInviteFullUrl(tok));
    } catch {
      // таблица всё равно обновлена; копирование по желанию из строки
    }
  } catch {
    shareInviteError.value = "Не удалось создать ссылку. Проверьте, что проект сохранён и вы его владелец.";
  } finally {
    shareInviteBusy.value = false;
  }
}

async function copyShareInviteToken(token) {
  const t = String(token || "").trim();
  if (!t) return;
  try {
    await navigator.clipboard.writeText(shareInviteFullUrl(t));
    shareInviteError.value = "";
  } catch {
    shareInviteError.value = "Не удалось скопировать — скопируйте вручную.";
  }
}

async function annulShareInviteRow(token) {
  const t = String(token || "").trim();
  const pid = tree.currentProjectId;
  if (!t || !pid || tree.currentProjectReadOnly) return;
  shareInviteAnnulToken.value = t;
  shareInviteError.value = "";
  try {
    await projectsApi.annulProjectShareInvite(pid, t);
    await loadShareInviteList();
  } catch {
    shareInviteError.value = "Не удалось аннулировать ссылку.";
  } finally {
    shareInviteAnnulToken.value = null;
  }
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

async function openProjectParameters(id) {
  profileProjectMenuOpenId.value = null;
  await tree.openProject(id);
  await router.push("/project-stats");
}

function deleteProjectFromMenu(id) {
  profileProjectMenuOpenId.value = null;
  tree.cancelLinkDelete();
  tree.cancelCardDelete();
  pendingProfileProjectDeleteId.value = id;
}

async function deleteProject(id) {
  await tree.deleteProject(id);
}

function sanitizeProjectShareFilename(name) {
  const s = String(name || "project")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-");
  return s.slice(0, 72) || "project";
}

async function downloadProjectShareGraphic() {
  shareGraphicError.value = "";
  if (!tree.currentProjectId) return;
  if (!tree.cards.length) {
    shareGraphicError.value = "В проекте пока нет карточек — нечего сохранять.";
    return;
  }
  const returnPath = route.fullPath;
  const needReturn = route.path !== "/";
  shareGraphicBusy.value = true;
  try {
    if (needReturn) {
      await router.replace("/");
      for (let i = 0; i < 30 && !treeWorkspaceRef.value; i += 1) {
        await nextTick();
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    const ws = treeWorkspaceRef.value;
    if (!ws?.exportFamilyMapPng) {
      shareGraphicError.value =
        "Не удалось открыть поле дерева. Перейдите на страницу с деревом и попробуйте снова.";
      return;
    }
    const res = await ws.exportFamilyMapPng();
    if (!res?.ok) {
      if (res?.error === "empty") shareGraphicError.value = "Нет данных для изображения.";
      else shareGraphicError.value = res?.error ? `Не удалось сохранить: ${res.error}` : "Не удалось создать файл.";
      return;
    }
    const safeName = sanitizeProjectShareFilename(tree.currentProjectName);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `svoi-korni-${safeName}-${stamp}.png`;
    const url = URL.createObjectURL(res.blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  } finally {
    if (needReturn && route.fullPath !== returnPath) {
      await router.replace(returnPath);
    }
    shareGraphicBusy.value = false;
  }
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
  pendingProfileProjectDeleteId.value = null;
  tree.cancelLinkDelete();
  tree.cancelCardDelete();
}

async function confirmDelete() {
  if (pendingProfileProjectDeleteId.value != null) {
    const id = pendingProfileProjectDeleteId.value;
    pendingProfileProjectDeleteId.value = null;
    await deleteProject(id);
    return;
  }
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
