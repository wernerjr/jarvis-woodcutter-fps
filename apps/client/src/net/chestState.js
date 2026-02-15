import { apiFetch } from './api.js'

export async function loadChestState({ worldId, chestId, guestId }) {
  const qs = new URLSearchParams({ worldId, chestId, guestId })
  const res = await apiFetch(`/api/chest/state?${qs.toString()}`, { method: 'GET' })
  if (res.status === 403) return { ok: false, error: 'forbidden' }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`load chest state failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  return data
}

export async function saveChestState({ worldId, chestId, guestId, state }) {
  const res = await apiFetch('/api/chest/state', {
    method: 'PUT',
    body: JSON.stringify({ worldId, chestId, guestId, state }),
  })
  if (res.status === 403) return { ok: false, error: 'forbidden' }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`save chest state failed: ${res.status} ${text}`)
  }
  return { ok: true }
}
