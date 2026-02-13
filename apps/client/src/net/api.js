const API_BASE = import.meta.env?.VITE_API_BASE_URL || '';

/** @param {string} path */
function url(path) {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

/** @param {string} path @param {RequestInit} [init] */
export async function apiFetch(path, init = {}) {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return res;
}
