import { apiFetch } from './api.js';

const LS_GUEST_ID = 'woodcutter_guest_id';

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

export async function ensureGuest() {
  const guestId = getStoredGuestId();
  const body = guestId ? { guestId } : {};

  const res = await apiFetch('/api/auth/guest', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`auth/guest failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (!data?.guestId || !data?.worldId) throw new Error('auth/guest invalid response');

  setStoredGuestId(data.guestId);
  return { guestId: data.guestId, worldId: data.worldId };
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
