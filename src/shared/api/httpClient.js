let authToken = "";

export function setAuthToken(token) {
  authToken = String(token || "");
}

function withAuthHeaders(init) {
  const headers = { ...(init?.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return { ...(init || {}), headers };
}

export async function getJson(url, init) {
  const response = await fetch(url, withAuthHeaders(init));
  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const msg = body && typeof body.error === "string" ? body.error : `HTTP ${response.status} for ${url}`;
    const err = new Error(msg);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return response.json();
}

export async function sendJson(url, method, body) {
  return getJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
