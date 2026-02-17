import { apiFetch } from './api.js'

export async function loadChestState({ worldId, chestId, guestId }) {
  const qs = new URLSearchParams({ worldId, chestId, guestId })
  const res = await apiFetch(`/api/chest/state?${qs.toString()}`, { method: 'GET' })
  if (res.status === 403) return { ok: false, error: 'forbidden' }
  if (res.status === 423) return { ok: false, error: 'locked' }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`load chest state failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  return data
}

export async function saveChestState({ worldId, chestId, guestId, lockToken, state }) {
  const res = await apiFetch('/api/chest/state', {
    method: 'PUT',
    body: JSON.stringify({ worldId, chestId, guestId, lockToken, state }),
  })
  if (res.status === 403) return { ok: false, error: 'forbidden' }
  if (res.status === 423) return { ok: false, error: 'locked' }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`save chest state failed: ${res.status} ${text}`)
  }
  return { ok: true }
}

export async function releaseChestLock({ worldId, chestId, guestId, lockToken }) {
  const res = await apiFetch('/api/chest/lock/release', {
    method: 'POST',
    body: JSON.stringify({ worldId, chestId, guestId, lockToken }),
  })
  if (!res.ok) return { ok: false }
  return { ok: true }
}
