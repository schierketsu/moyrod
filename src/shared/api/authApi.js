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
  /** Список пар + meta.hint (почему пусто). Старый формат — массив — тоже поддерживается. */
  async matchingSuggestions() {
    const data = await getJson("/api/matching/suggestions");
    if (Array.isArray(data)) {
      return { suggestions: data, meta: {} };
    }
    return {
      suggestions: data.suggestions || [],
      meta: data.meta || {},
    };
  },
};
