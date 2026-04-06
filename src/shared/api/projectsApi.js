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
};
