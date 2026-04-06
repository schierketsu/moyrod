import { defineStore } from "pinia";
import { projectsApi } from "../../../shared/api/projectsApi";

const SELF_CARD_ID = "m_self";
const PROFILE_KEY = "svoi_korni_profile_v1";
const LAST_PROJECT_KEY = "svoi_korni_last_project_id";
const CARD_W = 232;
const CARD_H = 204;

function uid() {
  return `c_${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeBirthInput(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{4})$/);
  if (m) return m[1];
  return s;
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.completed ? parsed : null;
  } catch {
    return null;
  }
}

function saveProfile(data) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
}

export const useTreeStore = defineStore("tree", {
  state: () => ({
    ready: false,
    apiAvailable: false,
    projects: [],
    currentProjectId: null,
    currentProjectName: "Мой проект",
    lastProjectUpdatedAt: null,
    cards: [],
    links: [],
    camX: 0,
    camY: 0,
    zoom: 1,
    fieldW: 2000,
    fieldH: 1400,
    loadingProject: false,
    showWelcome: false,
    showNewCardPanel: false,
    showEditCardPanel: false,
    editingCardId: null,
    showStats: false,
    pendingLinkDeletePayload: null,
    pendingCardDeleteId: null,
    shareForMatching: false,
    newCardDraft: {
      fio: "",
      birth: "",
      birthPlace: "",
      gender: "",
      maidenName: "",
      uncertainFio: false,
      uncertainBirth: false,
      uncertainBirthPlace: false,
    },
    editDraft: {
      fio: "",
      birth: "",
      birthPlace: "",
      gender: "",
      maidenName: "",
      uncertainFio: false,
      uncertainBirth: false,
      uncertainBirthPlace: false,
    },
    hasUnsavedChanges: false,
    isSaving: false,
  }),
  getters: {
    cardCount: (s) => s.cards.length,
    linkCount: (s) => s.links.length,
    selfCard: (s) => s.cards.find((c) => c.id === SELF_CARD_ID) || s.cards[0] || null,
  },
  actions: {
    async bootstrap() {
      this.ready = false;
      try {
        await projectsApi.health();
        this.apiAvailable = true;
      } catch {
        this.apiAvailable = false;
      }

      if (this.apiAvailable) {
        this.projects = await projectsApi.listProjects();
        if (this.projects.length === 0) {
          this.clearProjectSession();
        } else {
          const wanted = localStorage.getItem(LAST_PROJECT_KEY);
          const pick = wanted && this.projects.some((p) => String(p.id) === wanted)
            ? Number(wanted)
            : this.projects[0].id;
          await this.openProject(pick);
        }
      } else {
        this.initFromProfileOnly();
      }
      this.hasUnsavedChanges = false;
      this.ready = true;
    },

    async refreshProjects() {
      if (!this.apiAvailable) return [];
      this.projects = await projectsApi.listProjects();
      return this.projects;
    },

    async createProject(name) {
      const created = await projectsApi.createProject(name || "Мой проект");
      await this.refreshProjects();
      await this.openProject(created.id);
      return created;
    },

    clearProjectSession() {
      this.currentProjectId = null;
      this.currentProjectName = "";
      this.lastProjectUpdatedAt = null;
      this.cards = [];
      this.links = [];
      this.camX = this.fieldW / 2;
      this.camY = this.fieldH / 2;
      this.zoom = 1;
      this.showWelcome = false;
      this.shareForMatching = false;
      this.hasUnsavedChanges = false;
      this.pendingLinkDeletePayload = null;
      this.pendingCardDeleteId = null;
      try {
        localStorage.removeItem(LAST_PROJECT_KEY);
      } catch {
        /* ignore */
      }
    },

    async deleteProject(id) {
      await projectsApi.deleteProject(id);
      await this.refreshProjects();
      if (this.currentProjectId === id) {
        if (this.projects.length > 0) await this.openProject(this.projects[0].id);
        else this.clearProjectSession();
      }
    },

    async renameProject(id, name) {
      const cleanName = String(name || "").trim().slice(0, 200) || "Без названия";
      await projectsApi.renameProject(id, cleanName);
      if (this.currentProjectId === id) this.currentProjectName = cleanName;
      await this.refreshProjects();
    },

    initFromProfileOnly() {
      const profile = loadProfile();
      this.cards = [];
      this.links = [];
      if (profile) {
        const self = {
          id: SELF_CARD_ID,
          x: this.fieldW / 2 - CARD_W / 2,
          y: this.fieldH / 2 - CARD_H / 2,
          fio: profile.fio || "",
          birth: profile.birth || "",
          birthPlace: profile.birthPlace || "",
          gender: "",
          maidenName: "",
          pinned: false,
          isUnknown: false,
        };
        this.cards.push(self);
        this.camX = self.x + 116;
        this.camY = self.y + 102;
        this.zoom = 1;
        this.showWelcome = false;
      } else {
        this.camX = this.fieldW / 2;
        this.camY = this.fieldH / 2;
        this.zoom = 1;
        this.showWelcome = true;
      }
    },

    async openProject(id) {
      this.loadingProject = true;
      try {
        const data = await projectsApi.getProject(id);
        this.currentProjectId = data.id;
        this.currentProjectName = data.name || "Без названия";
        this.lastProjectUpdatedAt = data.updated_at || null;
        this.fieldW = Math.max(1000, Number(data.fieldW) || 2000);
        this.fieldH = Math.max(800, Number(data.fieldH) || 1400);
        this.camX = Number(data.camX) || this.fieldW / 2;
        this.camY = Number(data.camY) || this.fieldH / 2;
        this.zoom = Number(data.zoom) || 1;
        this.cards = Array.isArray(data.cards) ? data.cards : [];
        this.links = Array.isArray(data.links) ? data.links : [];
        this.shareForMatching = data.shareForMatching === true;
        localStorage.setItem(LAST_PROJECT_KEY, String(data.id));
        if (!this.cards.some((c) => c.id === SELF_CARD_ID) && data.profile?.fio) {
          this.cards.push({
            id: SELF_CARD_ID,
            x: this.fieldW / 2 - CARD_W / 2,
            y: this.fieldH / 2 - CARD_H / 2,
            fio: data.profile.fio || "",
            birth: data.profile.birth || "",
            birthPlace: data.profile.birthPlace || "",
            gender: "",
            maidenName: "",
            pinned: false,
            isUnknown: false,
          });
        }
        this.showWelcome = this.cards.length === 0;
        const self = this.selfCard;
        if (self) {
          this.camX = self.x + 116;
          this.camY = self.y + 102;
          this.zoom = 1;
        } else {
          this.camX = this.fieldW / 2;
          this.camY = this.fieldH / 2;
          this.zoom = 1;
        }
        this.hasUnsavedChanges = false;
      } finally {
        this.loadingProject = false;
      }
    },

    setViewport(camX, camY, zoom, persist = true) {
      this.camX = Math.max(0, Math.min(this.fieldW, camX));
      this.camY = Math.max(0, Math.min(this.fieldH, camY));
      this.zoom = zoom;
      // Viewport movement does not require manual save button activation.
      void persist;
    },

    setFieldSize(w, h) {
      this.fieldW = Math.max(1000, Math.round(w));
      this.fieldH = Math.max(800, Math.round(h));
    },

    resizeFieldWithRescale(w, h) {
      const nextW = Math.max(1000, Math.round(w));
      const nextH = Math.max(800, Math.round(h));
      if (nextW === this.fieldW && nextH === this.fieldH) return;
      const oldCenterX = this.fieldW / 2 - CARD_W / 2;
      const oldCenterY = this.fieldH / 2 - CARD_H / 2;
      const oldCamX = this.camX;
      const oldCamY = this.camY;
      const self = this.cards.find((c) => c.id === SELF_CARD_ID);
      const hasOnlySelf = this.cards.length === 1 && self && this.links.length === 0;
      const selfWasCentered =
        !!self && Math.abs(self.x - oldCenterX) < 1 && Math.abs(self.y - oldCenterY) < 1;
      this.fieldW = nextW;
      this.fieldH = nextH;
      // Keep camera on the same world point; avoid recenter drift on overlay/layout changes.
      this.camX = oldCamX;
      this.camY = oldCamY;
      // During first-run bootstrap keep the "self" card exactly at dot-grid center.
      if (hasOnlySelf && selfWasCentered) {
        self.x = this.fieldW / 2 - CARD_W / 2;
        self.y = this.fieldH / 2 - CARD_H / 2;
        this.camX = self.x + CARD_W / 2;
        this.camY = self.y + CARD_H / 2;
      }
      this.camX = Math.max(0, Math.min(nextW, this.camX));
      this.camY = Math.max(0, Math.min(nextH, this.camY));

    },

    addCard(payload) {
      const card = {
        id: payload.id || uid(),
        x: payload.x ?? this.fieldW / 2,
        y: payload.y ?? this.fieldH / 2,
        fio: payload.fio || "",
        birth: normalizeBirthInput(payload.birth || ""),
        birthPlace: payload.birthPlace || "",
        gender: payload.gender || "",
        maidenName: payload.gender === "f" ? (payload.maidenName || "") : "",
        uncertainFio: payload.uncertainFio === true,
        uncertainBirth: payload.uncertainBirth === true,
        uncertainBirthPlace: payload.uncertainBirthPlace === true,
        pinned: !!payload.pinned,
        isUnknown: !!payload.isUnknown,
      };
      this.cards.push(card);
      this.markDirty();
      return card.id;
    },

    patchCard(id, patch) {
      const c = this.cards.find((x) => x.id === id);
      if (!c) return;
      Object.assign(c, patch);
      c.birth = normalizeBirthInput(c.birth || "");
      if (c.gender !== "f") c.maidenName = "";
      this.markDirty();
    },

    removeCard(id) {
      this.cards = this.cards.filter((c) => c.id !== id);
      this.links = this.links.filter((l) => l.from !== id && l.to !== id && l.a !== id && l.b !== id && l.child !== id);
      this.markDirty();
    },

    addLineageLink(from, to) {
      if (from === to) return;
      if (this.links.some((l) => (l.kind || "lineage") === "lineage" && l.from === from && l.to === to)) return;
      this.links.push({ kind: "lineage", from, to });
      this.markDirty();
    },

    addSpouseLink(a, b) {
      if (a === b) return;
      if (this.links.some((l) => l.kind === "spouse" && ((l.a === a && l.b === b) || (l.a === b && l.b === a)))) return;
      this.links.push({ kind: "spouse", a, b });
      this.markDirty();
    },

    addChildOfUnionLink(a, b, child) {
      if (this.links.some((l) => l.kind === "childOfUnion" && l.a === a && l.b === b && l.child === child)) return;
      this.links.push({ kind: "childOfUnion", a, b, child });
      this.markDirty();
    },

    requestLinkDelete(payload) {
      this.pendingLinkDeletePayload = payload || null;
    },

    cancelLinkDelete() {
      this.pendingLinkDeletePayload = null;
    },

    requestCardDelete(cardId) {
      this.pendingCardDeleteId = cardId || null;
    },

    cancelCardDelete() {
      this.pendingCardDeleteId = null;
    },

    confirmLinkDelete() {
      const p = this.pendingLinkDeletePayload;
      if (!p || !p.kind) return;
      if (p.kind === "lineage") {
        this.links = this.links.filter((l) => !((l.kind || "lineage") === "lineage" && l.from === p.from && l.to === p.to));
      } else if (p.kind === "spouse") {
        this.links = this.links.filter(
          (l) => !(l.kind === "spouse" && ((l.a === p.a && l.b === p.b) || (l.a === p.b && l.b === p.a)))
        );
      } else if (p.kind === "childOfUnion") {
        this.links = this.links.filter(
          (l) => !(l.kind === "childOfUnion" && l.a === p.a && l.b === p.b && l.child === p.child)
        );
      }
      this.pendingLinkDeletePayload = null;
      this.markDirty();
    },

    confirmCardDelete() {
      if (!this.pendingCardDeleteId) return;
      const cardId = this.pendingCardDeleteId;
      this.pendingCardDeleteId = null;
      this.removeCard(cardId);
    },

    submitWelcome(form) {
      const fio = String(form.fio || "").trim();
      if (!fio) return;
      const birth = normalizeBirthInput(form.birth || "");
      const birthPlace = String(form.birthPlace || "").trim();
      saveProfile({ completed: true, fio, birth, birthPlace });
      this.showWelcome = false;
      if (!this.cards.some((c) => c.id === SELF_CARD_ID)) {
        this.addCard({
          id: SELF_CARD_ID,
          x: this.fieldW / 2 - CARD_W / 2,
          y: this.fieldH / 2 - CARD_H / 2,
          fio,
          birth,
          birthPlace,
        });
      } else {
        this.patchCard(SELF_CARD_ID, { fio, birth, birthPlace, isUnknown: false });
      }
      const self = this.cards.find((c) => c.id === SELF_CARD_ID);
      if (self) {
        this.camX = self.x + 116;
        this.camY = self.y + 102;
        this.zoom = 1;
      }
    },

    serializeProject() {
      return {
        name: this.currentProjectName || "Без названия",
        fieldW: this.fieldW,
        fieldH: this.fieldH,
        camX: this.camX,
        camY: this.camY,
        zoom: this.zoom,
        cards: this.cards,
        links: this.links,
        profile: this.selfCard
          ? {
              completed: true,
              fio: this.selfCard.fio,
              birth: this.selfCard.birth,
              birthPlace: this.selfCard.birthPlace,
              shareForMatching: this.shareForMatching === true,
            }
          : null,
        shareForMatching: this.shareForMatching === true,
      };
    },

    markDirty() {
      this.hasUnsavedChanges = true;
    },

    async saveNow() {
      if (!this.apiAvailable || this.loadingProject || this.currentProjectId == null) return false;
      if (!this.hasUnsavedChanges || this.isSaving) return false;
      this.isSaving = true;
      try {
        const payload = this.serializeProject();
        const res = await projectsApi.saveProject(this.currentProjectId, payload);
        this.lastProjectUpdatedAt = res.updated_at || Date.now();
        this.hasUnsavedChanges = false;
        return true;
      } finally {
        this.isSaving = false;
      }
    },
  },
});

