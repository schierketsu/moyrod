import { defineStore } from "pinia";
import { projectsApi } from "../../../shared/api/projectsApi";

const SELF_CARD_ID = "m_self";
const PROFILE_KEY = "svoi_korni_profile_v1";
const LAST_PROJECT_KEY = "svoi_korni_last_project_id";

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
    newCardDraft: { fio: "", birth: "", birthPlace: "", gender: "", maidenName: "" },
    editDraft: { fio: "", birth: "", birthPlace: "", gender: "", maidenName: "" },
    saveTimer: null,
  }),
  getters: {
    cardCount: (s) => s.cards.length,
    linkCount: (s) => s.links.length,
    selfCard: (s) => s.cards.find((c) => c.id === SELF_CARD_ID) || null,
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
          const created = await projectsApi.createProject("Мой проект");
          this.projects = [created];
        }
        const wanted = localStorage.getItem(LAST_PROJECT_KEY);
        const pick = wanted && this.projects.some((p) => String(p.id) === wanted)
          ? Number(wanted)
          : this.projects[0].id;
        await this.openProject(pick);
      } else {
        this.initFromProfileOnly();
      }
      this.ready = true;
    },

    initFromProfileOnly() {
      const profile = loadProfile();
      this.cards = [];
      this.links = [];
      if (profile) {
        this.cards.push({
          id: SELF_CARD_ID,
          x: 900,
          y: 500,
          fio: profile.fio || "",
          birth: profile.birth || "",
          birthPlace: profile.birthPlace || "",
          gender: "",
          maidenName: "",
          pinned: false,
          isUnknown: false,
        });
        this.showWelcome = false;
      } else {
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
        localStorage.setItem(LAST_PROJECT_KEY, String(data.id));
        if (!this.cards.some((c) => c.id === SELF_CARD_ID) && data.profile?.fio) {
          this.cards.push({
            id: SELF_CARD_ID,
            x: this.fieldW / 2,
            y: this.fieldH / 2,
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
      } finally {
        this.loadingProject = false;
      }
    },

    setViewport(camX, camY, zoom) {
      this.camX = camX;
      this.camY = camY;
      this.zoom = zoom;
      this.scheduleSave();
    },

    setFieldSize(w, h) {
      this.fieldW = Math.max(1000, Math.round(w));
      this.fieldH = Math.max(800, Math.round(h));
      this.scheduleSave();
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
        pinned: !!payload.pinned,
        isUnknown: !!payload.isUnknown,
      };
      this.cards.push(card);
      this.scheduleSave();
      return card.id;
    },

    patchCard(id, patch) {
      const c = this.cards.find((x) => x.id === id);
      if (!c) return;
      Object.assign(c, patch);
      c.birth = normalizeBirthInput(c.birth || "");
      if (c.gender !== "f") c.maidenName = "";
      this.scheduleSave();
    },

    removeCard(id) {
      this.cards = this.cards.filter((c) => c.id !== id);
      this.links = this.links.filter((l) => l.from !== id && l.to !== id && l.a !== id && l.b !== id && l.child !== id);
      this.scheduleSave();
    },

    addLineageLink(from, to) {
      if (from === to) return;
      if (this.links.some((l) => (l.kind || "lineage") === "lineage" && l.from === from && l.to === to)) return;
      this.links.push({ kind: "lineage", from, to });
      this.scheduleSave();
    },

    addSpouseLink(a, b) {
      if (a === b) return;
      if (this.links.some((l) => l.kind === "spouse" && ((l.a === a && l.b === b) || (l.a === b && l.b === a)))) return;
      this.links.push({ kind: "spouse", a, b });
      this.scheduleSave();
    },

    addChildOfUnionLink(a, b, child) {
      if (this.links.some((l) => l.kind === "childOfUnion" && l.a === a && l.b === b && l.child === child)) return;
      this.links.push({ kind: "childOfUnion", a, b, child });
      this.scheduleSave();
    },

    submitWelcome(form) {
      const fio = String(form.fio || "").trim();
      if (!fio) return;
      const birth = normalizeBirthInput(form.birth || "");
      const birthPlace = String(form.birthPlace || "").trim();
      saveProfile({ completed: true, fio, birth, birthPlace });
      this.showWelcome = false;
      if (!this.cards.some((c) => c.id === SELF_CARD_ID)) {
        this.addCard({ id: SELF_CARD_ID, x: this.fieldW / 2, y: this.fieldH / 2, fio, birth, birthPlace });
      } else {
        this.patchCard(SELF_CARD_ID, { fio, birth, birthPlace, isUnknown: false });
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
          ? { completed: true, fio: this.selfCard.fio, birth: this.selfCard.birth, birthPlace: this.selfCard.birthPlace }
          : null,
      };
    },

    scheduleSave() {
      if (!this.apiAvailable || this.loadingProject || this.currentProjectId == null) return;
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(async () => {
        this.saveTimer = null;
        if (!this.apiAvailable || this.currentProjectId == null) return;
        const payload = this.serializeProject();
        const res = await projectsApi.saveProject(this.currentProjectId, payload);
        this.lastProjectUpdatedAt = res.updated_at || Date.now();
      }, 650);
    },
  },
});

