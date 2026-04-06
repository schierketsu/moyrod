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
    const err = new Error(`HTTP ${response.status} for ${url}`);
    err.status = response.status;
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
