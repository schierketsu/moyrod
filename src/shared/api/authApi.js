import { getJson, sendJson } from "./httpClient";

export const authApi = {
  register(payload) {
    return sendJson("/api/auth/register", "POST", payload);
  },
  login(payload) {
    return sendJson("/api/auth/login", "POST", payload);
  },
  me() {
    return getJson("/api/auth/me");
  },
  logout() {
    return sendJson("/api/auth/logout", "POST", {});
  },
  matchingSuggestions() {
    return getJson("/api/matching/suggestions");
  },
};
