import { getJson, sendJson } from "./httpClient";

export const projectsApi = {
  health() {
    return getJson("/api/health");
  },
  listProjects() {
    return getJson("/api/projects");
  },
  getProject(id) {
    return getJson(`/api/projects/${id}`);
  },
  createProject(name) {
    return sendJson("/api/projects", "POST", { name });
  },
  saveProject(id, payload) {
    return sendJson(`/api/projects/${id}`, "PUT", payload);
  },
  async updateProjectShareForMatching(projectId, shareForMatching) {
    const body = { shareForMatching: shareForMatching === true };
    try {
      return await sendJson(`/api/projects/${projectId}/share-for-matching`, "POST", body);
    } catch (e) {
      if (e.status !== 404) throw e;
      const data = await this.getProject(projectId);
      return await this.saveProject(projectId, {
        name: data.name || "Без названия",
        fieldW: data.fieldW,
        fieldH: data.fieldH,
        camX: data.camX,
        camY: data.camY,
        zoom: data.zoom,
        cards: Array.isArray(data.cards) ? data.cards : [],
        links: Array.isArray(data.links) ? data.links : [],
        profile: data.profile ?? null,
        shareForMatching: body.shareForMatching,
      });
    }
  },
  /**
   * Пересохраняет все проекты как есть — на сервере снова вызывается updateSharedCardIndex.
   * Работает без маршрута GET /api/matching/rebuild (старый backend).
   */
  async resaveAllProjectsForMatchingIndex() {
    const list = await this.listProjects();
    for (const p of list) {
      const data = await this.getProject(p.id);
      const payload = {
        name: data.name || "Без названия",
        fieldW: data.fieldW,
        fieldH: data.fieldH,
        camX: data.camX,
        camY: data.camY,
        zoom: data.zoom,
        cards: Array.isArray(data.cards) ? data.cards : [],
        links: Array.isArray(data.links) ? data.links : [],
        profile: data.profile ?? null,
        shareForMatching: data.shareForMatching === true,
      };
      await this.saveProject(p.id, payload);
    }
    return { ok: true, resavedCount: list.length };
  },
  async renameProject(id, name) {
    const project = await this.getProject(id);
    const payload = {
      name: String(name || "").trim() || project.name || "Без названия",
      fieldW: project.fieldW,
      fieldH: project.fieldH,
      camX: project.camX,
      camY: project.camY,
      zoom: project.zoom,
      cards: project.cards,
      links: project.links,
      profile: project.profile,
      shareForMatching: project.shareForMatching === true,
    };
    return this.saveProject(id, payload);
  },
  deleteProject(id) {
    return sendJson(`/api/projects/${id}`, "DELETE", {});
  },
  suggestPlaces(query) {
    return getJson(`/api/places/suggest?q=${encodeURIComponent(query)}`);
  },
  importMatchingProject(projectId, ownerUid) {
    return sendJson("/api/matching/import-project", "POST", {
      projectId: Number(projectId),
      ownerUid: ownerUid != null ? Number(ownerUid) : undefined,
    });
  },
  getSharedMatchingProject(projectId, ownerUid) {
    return getJson(
      `/api/matching/shared-project?projectId=${encodeURIComponent(Number(projectId))}&ownerUid=${encodeURIComponent(
        Number(ownerUid)
      )}`
    );
  },
};
