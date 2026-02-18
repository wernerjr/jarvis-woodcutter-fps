import { apiFetch } from './api.js';

const LS_GUEST_ID = 'woodcutter_guest_id';
const LS_GUEST_TOKEN = 'woodcutter_guest_token';
const LS_WORLD_ID = 'woodcutter_world_id';
const LS_ACCOUNT_EMAIL = 'woodcutter_account_email';
const LS_DEVICE_KEY = 'woodcutter_device_key';

export function getStoredGuestId() {
  try {
    return localStorage.getItem(LS_GUEST_ID);
  } catch {
    return null;
  }
}

export function setStoredGuestId(guestId) {
  try {
    localStorage.setItem(LS_GUEST_ID, guestId);
  } catch {
    // ignore
  }
}

export function getStoredGuestToken() {
  try {
    return localStorage.getItem(LS_GUEST_TOKEN);
  } catch {
    return null;
  }
}

export function setStoredGuestToken(token) {
  try {
    if (!token) localStorage.removeItem(LS_GUEST_TOKEN);
    else localStorage.setItem(LS_GUEST_TOKEN, token);
  } catch {
    // ignore
  }
}

export function getStoredWorldId() {
  try {
    return localStorage.getItem(LS_WORLD_ID);
  } catch {
    return null;
  }
}

export function setStoredWorldId(worldId) {
  try {
    if (!worldId) localStorage.removeItem(LS_WORLD_ID);
    else localStorage.setItem(LS_WORLD_ID, worldId);
  } catch {
    // ignore
  }
}

export function getStoredAccountEmail() {
  try {
    return localStorage.getItem(LS_ACCOUNT_EMAIL);
  } catch {
    return null;
  }
}

export function getOrCreateDeviceKey() {
  try {
    let v = localStorage.getItem(LS_DEVICE_KEY)
    if (v && v.length >= 16) return v
    const rand = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9_-]/g, '')
    v = `dev_${rand}`
    localStorage.setItem(LS_DEVICE_KEY, v)
    return v
  } catch {
    return `dev_fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }
}

export function setStoredAccountEmail(email) {
  try {
    if (!email) localStorage.removeItem(LS_ACCOUNT_EMAIL);
    else localStorage.setItem(LS_ACCOUNT_EMAIL, String(email).trim().toLowerCase());
  } catch {
    // ignore
  }
}

export async function ensureGuest({ worldId } = {}) {
  // Compat wrapper: guest agora é garantido por dispositivo (Auth v2)
  const out = await ensureGuestByDevice({ worldId })
  return {
    guestId: out.guestId,
    worldId: out.worldId,
    token: out.token,
    tokenExpMs: out.tokenExpMs ?? null,
  }
}

export async function loadPlayerState({ guestId, worldId }) {
  const qs = new URLSearchParams({ guestId, worldId });
  const res = await apiFetch(`/api/player/state?${qs.toString()}`, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`load player state failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data?.state ?? null;
}

export async function savePlayerState({ guestId, worldId, state }) {
  const res = await apiFetch('/api/player/state', {
    method: 'PUT',
    body: JSON.stringify({ guestId, worldId, state }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`save player state failed: ${res.status} ${text}`);
  }
  return true;
}

export async function loadPlayerSettings({ guestId, worldId }) {
  const qs = new URLSearchParams({ guestId, worldId });
  const res = await apiFetch(`/api/player/settings?${qs.toString()}`, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`load player settings failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data?.settings ?? {};
}

export async function savePlayerSettings({ guestId, worldId, settings }) {
  const res = await apiFetch('/api/player/settings', {
    method: 'PUT',
    body: JSON.stringify({ guestId, worldId, settings }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`save player settings failed: ${res.status} ${text}`);
  }
  return true;
}

export async function startAccountLink({ guestId, email }) {
  const res = await apiFetch('/api/auth/link/start', {
    method: 'POST',
    body: JSON.stringify({ guestId, email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `link/start failed: ${res.status}`);
  return data;
}

export async function verifyAccountLink({ guestId, email, code }) {
  const res = await apiFetch('/api/auth/link/verify', {
    method: 'POST',
    body: JSON.stringify({ guestId, email, code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `link/verify failed: ${res.status}`);

  if (data?.guestId && data?.token) {
    setStoredGuestId(data.guestId);
    setStoredGuestToken(data.token);
  }
  setStoredAccountEmail(email);

  return data;
}

export async function startAccountLogin({ email }) {
  const res = await apiFetch('/api/auth/login/start', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `login/start failed: ${res.status}`);
  return data;
}

export async function verifyAccountLogin({ email, code }) {
  const res = await apiFetch('/api/auth/login/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `login/verify failed: ${res.status}`);

  if (data?.guestId && data?.token) {
    setStoredGuestId(data.guestId);
    setStoredGuestToken(data.token);
  }
  setStoredAccountEmail(email);

  return data;
}

// Auth v2 (WIP)
export async function ensureGuestByDevice({ worldId } = {}) {
  const desiredWorldId = worldId || getStoredWorldId();
  const deviceKey = getOrCreateDeviceKey();

  const res = await apiFetch('/api/auth/device/guest', {
    method: 'POST',
    body: JSON.stringify({
      deviceKey,
      ...(desiredWorldId ? { worldId: desiredWorldId } : {}),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `auth/device/guest failed: ${res.status}`);

  if (!data?.guestId || !data?.worldId || !data?.token) throw new Error('auth/device/guest invalid response');
  setStoredGuestId(data.guestId);
  setStoredGuestToken(data.token);
  setStoredWorldId(data.worldId);
  return data;
}

export async function registerUserPassword({ username, password, guestId }) {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, ...(guestId ? { guestId } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `auth/register failed: ${res.status}`);
  return data;
}

export async function loginUserPassword({ username, password }) {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `auth/login failed: ${res.status}`);

  if (data?.guestId && data?.token) {
    setStoredGuestId(data.guestId);
    setStoredGuestToken(data.token);
  }
  if (data?.worldId) setStoredWorldId(data.worldId);

  return data;
}
