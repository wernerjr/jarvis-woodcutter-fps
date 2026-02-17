import * as THREE from 'three'

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

function makeTilledTile() {
  const geo = new THREE.PlaneGeometry(1.0, 1.0)
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b2a18, roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0.92 })
  const m = new THREE.Mesh(geo, mat)
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.01
  return m
}

function makePlantMesh() {
  const g = new THREE.Group()

  const stemMat = new THREE.MeshStandardMaterial({ color: 0x2b8a3e, roughness: 1.0, metalness: 0.0 })
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.45, 7), stemMat)
  stem.position.y = 0.22
  g.add(stem)

  const topMat = new THREE.MeshStandardMaterial({ color: 0x39b24a, roughness: 1.0, metalness: 0.0 })
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 9), topMat)
  top.position.y = 0.45
  g.add(top)

  // start small
  g.scale.set(0.25, 0.25, 0.25)
  g.position.y = 0.02

  return g
}

/**
 * Client-side rendering for farming plots.
 * Authoritative state comes from server via worldChunk (farmPlots).
 */
export class FarmManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    this._plots = new Map() // id -> { st, tile, plant }
    this._plotsByChunk = new Map() // "cx:cz" -> Set<id>
    this._chunkSize = 32 // must match server
  }

  update(dt) {
    // Update plant growth visuals.
    // (dt unused except for future animations; growth is time-based)
    const now = Date.now()
    for (const rec of this._plots.values()) {
      const st = rec.st
      if (!st?.seedId || !st?.plantedAt || !st?.growMs) {
        if (rec.plant) rec.plant.visible = false
        continue
      }

      const t = (now - Number(st.plantedAt)) / Number(st.growMs || 1)
      const p = clamp01(t)

      if (rec.plant) {
        rec.plant.visible = true
        const s = 0.25 + p * 0.95
        rec.plant.scale.set(s, s, s)

        // Ready = brighter
        const ready = p >= 1
        for (const ch of rec.plant.children) {
          if (ch.material && ch.material.color) {
            ch.material.color.setHex(ready ? 0x6af07d : (ch.geometry?.type?.includes('Sphere') ? 0x39b24a : 0x2b8a3e))
          }
        }
      }
    }
  }

  /**
   * Apply authoritative farm state for a chunk.
   * @param {number} chunkX
   * @param {number} chunkZ
   * @param {Array<any>} farmPlots
   */
  applyChunkState(chunkX, chunkZ, farmPlots) {
    const cx = Number(chunkX)
    const cz = Number(chunkZ)
    const ck = `${cx}:${cz}`

    const list = Array.isArray(farmPlots) ? farmPlots : []
    const nextIds = new Set(list.map((p) => String(p?.id || ''))) 

    // Remove plots that no longer exist in this chunk.
    const prevIds = this._plotsByChunk.get(ck) || new Set()
    for (const id of prevIds) {
      if (!nextIds.has(String(id))) {
        const rec = this._plots.get(String(id))
        if (rec) {
          if (rec.tile) this.scene.remove(rec.tile)
          if (rec.plant) this.scene.remove(rec.plant)
        }
        this._plots.delete(String(id))
      }
    }

    // Add/update plots
    const chunkSet = new Set()
    for (const p of list) {
      const id = String(p?.id || '')
      if (!id) continue

      const x = Number(p?.x)
      const z = Number(p?.z)
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue

      chunkSet.add(id)

      let rec = this._plots.get(id)
      if (!rec) {
        const tile = makeTilledTile()
        tile.position.x = x
        tile.position.z = z
        this.scene.add(tile)

        const plant = makePlantMesh()
        plant.position.x = x
        plant.position.z = z
        this.scene.add(plant)

        rec = { st: {}, tile, plant }
        this._plots.set(id, rec)
      }

      rec.st = {
        id,
        x,
        z,
        tilledAt: p?.tilledAt ?? null,
        seedId: p?.seedId ?? null,
        plantedAt: p?.plantedAt ?? null,
        growMs: p?.growMs ?? null,
      }
    }

    this._plotsByChunk.set(ck, chunkSet)
  }

  getPlot(plotId) {
    const rec = this._plots.get(String(plotId))
    return rec?.st || null
  }

  /** Snap world coords to integer tile grid. */
  snap(x, z) {
    const tx = Math.round(Number(x))
    const tz = Math.round(Number(z))
    return { tx, tz, x: tx, z: tz, id: `${tx}:${tz}` }
  }

  isReady(plotSt) {
    if (!plotSt?.seedId || !plotSt?.plantedAt || !plotSt?.growMs) return false
    return Date.now() >= Number(plotSt.plantedAt) + Number(plotSt.growMs)
  }
}
