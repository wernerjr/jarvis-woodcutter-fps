import { apiFetch } from './api.js'

export async function loadForgeState({ worldId, forgeId }) {
  const qs = new URLSearchParams({ worldId, forgeId })
  const res = await apiFetch(`/api/forge/state?${qs.toString()}`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`load forge state failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  if (!data?.state) throw new Error('load forge state invalid response')
  return data.state
}

export async function saveForgeState({ worldId, forgeId, state }) {
  const res = await apiFetch('/api/forge/state', {
    method: 'PUT',
    body: JSON.stringify({ worldId, forgeId, state }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`save forge state failed: ${res.status} ${text}`)
  }
  return true
}
