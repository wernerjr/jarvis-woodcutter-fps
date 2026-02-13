import { apiFetch } from './api.js';

const LS_GUEST_ID = 'woodcutter_guest_id';
const LS_GUEST_TOKEN = 'woodcutter_guest_token';
const LS_WORLD_ID = 'woodcutter_world_id';

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

export async function ensureGuest({ worldId } = {}) {
  const guestId = getStoredGuestId();
  const desiredWorldId = worldId || getStoredWorldId();
  const body = {
    ...(guestId ? { guestId } : {}),
    ...(desiredWorldId ? { worldId: desiredWorldId } : {}),
  };

  const res = await apiFetch('/api/auth/guest', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`auth/guest failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (!data?.guestId || !data?.worldId || !data?.token) throw new Error('auth/guest invalid response');

  setStoredGuestId(data.guestId);
  setStoredGuestToken(data.token);
  setStoredWorldId(data.worldId);
  return { guestId: data.guestId, worldId: data.worldId, token: data.token, tokenExpMs: data.tokenExpMs ?? null };
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
