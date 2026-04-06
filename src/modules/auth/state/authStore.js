import { defineStore } from "pinia";
import { authApi } from "../../../shared/api/authApi";
import { setAuthToken } from "../../../shared/api/httpClient";

const AUTH_TOKEN_KEY = "svoi_korni_auth_token_v1";

function readToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    ready: false,
    token: "",
    user: null,
    lastError: "",
  }),
  getters: {
    isAuthenticated: (s) => !!s.user,
  },
  actions: {
    async bootstrap() {
      this.ready = false;
      this.lastError = "";
      this.token = readToken();
      setAuthToken(this.token);
      if (!this.token) {
        this.user = null;
        this.ready = true;
        return;
      }
      try {
        const me = await authApi.me();
        this.user = me.user || null;
      } catch {
        this.clearAuth();
      } finally {
        this.ready = true;
      }
    },
    applyAuth(token, user) {
      this.token = token || "";
      this.user = user || null;
      setAuthToken(this.token);
      if (this.token) localStorage.setItem(AUTH_TOKEN_KEY, this.token);
      else localStorage.removeItem(AUTH_TOKEN_KEY);
    },
    clearAuth() {
      this.applyAuth("", null);
    },
    async register(payload) {
      this.lastError = "";
      const result = await authApi.register(payload);
      this.applyAuth(result.token, result.user);
      return result;
    },
    async login(uid, password) {
      this.lastError = "";
      const result = await authApi.login({ uid, password });
      this.applyAuth(result.token, result.user);
      return result;
    },
    async logout() {
      try {
        if (this.token) await authApi.logout();
      } catch {
        // Ignore API logout failure for stateless JWT.
      } finally {
        this.clearAuth();
      }
    },
  },
});
