<template>
  <section class="profile-page profile-page--invite-accept">
    <div class="profile-page-main">
      <div class="profile-page-head">
        <h2 class="profile-page-title">Приглашение в проект</h2>
      </div>
      <div v-if="loading" class="profile-section invite-accept-section">
        <p class="welcome-text">Загрузка…</p>
      </div>
      <div v-else-if="error" class="profile-section invite-accept-section">
        <p class="welcome-text">{{ error }}</p>
        <button type="button" class="btn primary" @click="declineAndGoHome">На главную</button>
      </div>
      <div v-else-if="preview" class="profile-section invite-accept-section">
        <p class="invite-accept-lead">
          Вы были приглашены в проект «<strong>{{ preview.projectName }}</strong>».
        </p>
        <p v-if="preview.ownerName || preview.ownerUid" class="welcome-text invite-accept-owner">
          От кого:
          <template v-if="preview.ownerName">{{ preview.ownerName }}</template>
          <template v-if="preview.ownerName && preview.ownerUid"> · </template>
          <template v-if="preview.ownerUid">UID {{ preview.ownerUid }}</template>
        </p>
        <p class="invite-accept-confirm">Уверены, что хотите добавить проект к себе в коллекцию?</p>
        <div class="invite-accept-actions">
          <button type="button" class="btn primary" :disabled="accepting" @click="confirmAccept">
            {{ accepting ? "Добавляем…" : "Добавить в коллекцию" }}
          </button>
          <button type="button" class="btn" :disabled="accepting" @click="declineAndGoHome">Отмена</button>
        </div>
        <p v-if="actionError" class="welcome-text invite-accept-action-error">{{ actionError }}</p>
      </div>
    </div>
    <aside class="profile-page-side" aria-hidden="true"></aside>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { projectsApi } from "../../shared/api/projectsApi";
import { useTreeStore } from "../tree/state/treeStore";

const route = useRoute();
const router = useRouter();
const tree = useTreeStore();

const token = computed(() => String(route.params.token || "").trim());

const loading = ref(true);
const error = ref("");
const preview = ref(null);
const accepting = ref(false);
const actionError = ref("");

async function loadPreview() {
  loading.value = true;
  error.value = "";
  preview.value = null;
  actionError.value = "";
  const t = token.value;
  if (!t || t.length < 16) {
    loading.value = false;
    error.value = "Некорректная ссылка-приглашение.";
    return;
  }
  try {
    const data = await projectsApi.getShareInviteInfo(t);
    if (!data?.ok) {
      error.value = "Приглашение недействительно.";
      return;
    }
    preview.value = {
      projectName: data.projectName || "Проект",
      ownerUid: data.ownerUid,
      ownerName: data.ownerName || null,
    };
  } catch (e) {
    if (e?.status === 410) {
      error.value = "Ссылка уже использована или приглашение отклонено.";
    } else {
      error.value = "Приглашение не найдено или срок действия истёк.";
    }
  } finally {
    loading.value = false;
  }
}

watch(token, () => {
  loadPreview();
});

onMounted(() => {
  loadPreview();
});

async function declineAndGoHome() {
  const t = token.value;
  if (t) {
    try {
      await projectsApi.declineShareInvite(t);
    } catch {
      // всё равно уходим с экрана
    }
  }
  router.push("/");
}

async function confirmAccept() {
  const t = token.value;
  if (!t || accepting.value) return;
  accepting.value = true;
  actionError.value = "";
  try {
    const data = await projectsApi.acceptShareInvite(t);
    const newId = data?.importedProject?.id;
    await tree.refreshProjects();
    if (newId) await tree.openProject(newId);
    await router.push("/");
  } catch (e) {
    if (e?.status === 410) {
      actionError.value = "Ссылка уже использована или приглашение отклонено.";
    } else if (e?.status === 400) {
      actionError.value = "Нельзя добавить свой проект или приглашение больше не действует.";
    } else {
      actionError.value = "Не удалось добавить проект. Попробуйте позже.";
    }
  } finally {
    accepting.value = false;
  }
}
</script>
