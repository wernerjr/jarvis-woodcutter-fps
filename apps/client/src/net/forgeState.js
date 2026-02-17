import { apiFetch } from './api.js'

export async function loadForgeState({ worldId, forgeId, guestId }) {
  const qs = new URLSearchParams({ worldId, forgeId, guestId })
  const res = await apiFetch(`/api/forge/state?${qs.toString()}`, { method: 'GET' })
  if (res.status === 423) return { ok: false, error: 'locked' }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`load forge state failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  if (!data?.state) throw new Error('load forge state invalid response')
  return data
}

export async function saveForgeState({ worldId, forgeId, guestId, lockToken, state }) {
  const res = await apiFetch('/api/forge/state', {
    method: 'PUT',
    body: JSON.stringify({ worldId, forgeId, guestId, lockToken, state }),
  })
  if (res.status === 423) return { ok: false, error: 'locked' }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`save forge state failed: ${res.status} ${text}`)
  }
  return { ok: true }
}

export async function getForgeLockStatus({ worldId, forgeId, guestId }) {
  const qs = new URLSearchParams({ worldId, forgeId, guestId })
  const res = await apiFetch(`/api/forge/lock/status?${qs.toString()}`, { method: 'GET' })
  if (!res.ok) return { ok: false }
  return await res.json()
}

export async function renewForgeLock({ worldId, forgeId, guestId, lockToken }) {
  const res = await apiFetch('/api/forge/lock/renew', {
    method: 'POST',
    body: JSON.stringify({ worldId, forgeId, guestId, lockToken }),
  })
  if (res.status === 423) return { ok: false, error: 'locked' }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`renew forge lock failed: ${res.status} ${text}`)
  }
  return { ok: true }
}

export async function releaseForgeLock({ worldId, forgeId, guestId, lockToken }) {
  const res = await apiFetch('/api/forge/lock/release', {
    method: 'POST',
    body: JSON.stringify({ worldId, forgeId, guestId, lockToken }),
  })
  if (res.status === 423) return { ok: false, error: 'locked' }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`release forge lock failed: ${res.status} ${text}`)
  }
  return { ok: true }
}
