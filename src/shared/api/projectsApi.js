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
  deleteProject(id) {
    return sendJson(`/api/projects/${id}`, "DELETE", {});
  },
  suggestPlaces(query) {
    return getJson(`/api/places/suggest?q=${encodeURIComponent(query)}`);
  },
};
