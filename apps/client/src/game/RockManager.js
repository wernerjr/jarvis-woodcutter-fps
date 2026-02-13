import * as THREE from 'three'
import { mulberry32 } from './util.js'

function makeRockMesh(rng) {
  const g = new THREE.DodecahedronGeometry(0.22 + rng() * 0.18, 0)
  const m = new THREE.MeshStandardMaterial({ color: 0x6f757b, roughness: 1.0, metalness: 0.0 })

  // Group with visible rock + invisible hitbox (easier pickup).
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(g, m)
  mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)
  group.add(mesh)

  // 2x bigger pickup hitbox.
  const hitGeo = new THREE.SphereGeometry(1.10, 12, 10)
  const hitMat = new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthWrite: false })
  const hit = new THREE.Mesh(hitGeo, hitMat)
  hit.name = 'RockHitbox'
  group.add(hit)

  group.userData = {
    collected: false,
    respawnRemaining: 0,
  }

  return group
}

export class RockManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    this._rocks = new Map() // id -> mesh
    this._rocksByChunk = new Map() // "cx:cz" -> Set<id>
    this._raycaster = new THREE.Raycaster()
    this._raycaster.far = 2.5
    // Client timer respawn is disabled for world-authoritative rocks.
    this._respawnSec = 20.0
    this._idCounter = 1

    // Must match server wsServer.ts
    this._chunkSize = 32
  }

  init({ seed = 42, count = 28, radius = 45 } = {}) {
    const rng = mulberry32(seed)
    for (let i = 0; i < count; i++) {
      const id = String(this._idCounter++)
      const mesh = makeRockMesh(rng)
      mesh.userData.id = id

      const ang = rng() * Math.PI * 2
      const r = (0.15 + rng() * 0.85) * radius
      mesh.position.set(Math.cos(ang) * r, 0.02, Math.sin(ang) * r)

      const cx = Math.floor(mesh.position.x / this._chunkSize)
      const cz = Math.floor(mesh.position.z / this._chunkSize)
      mesh.userData.chunkX = cx
      mesh.userData.chunkZ = cz
      const ck = `${cx}:${cz}`
      if (!this._rocksByChunk.has(ck)) this._rocksByChunk.set(ck, new Set())
      this._rocksByChunk.get(ck).add(id)

      this.scene.add(mesh)
      this._rocks.set(id, mesh)
    }
  }

  update(dt) {
    for (const mesh of this._rocks.values()) {
      // Server-authoritative world removals.
      if (mesh.userData.worldRemoved) {
        mesh.visible = false
        continue
      }

      // Non-world (local) pickup could use timer, but currently rocks are collected via WS.
      if (mesh.userData.collected) {
        mesh.userData.respawnRemaining = Math.max(0, mesh.userData.respawnRemaining - dt)
        if (mesh.userData.respawnRemaining === 0) {
          mesh.userData.collected = false
          mesh.visible = true
        }
      }
    }
  }

  resetAll() {
    for (const mesh of this._rocks.values()) {
      mesh.userData.worldRemoved = false
      mesh.userData.collected = false
      mesh.userData.respawnRemaining = 0
      mesh.visible = true
    }
  }

  raycastFromCamera(camera) {
    this._raycaster.setFromCamera({ x: 0, y: 0 }, camera)

    const targets = []
    for (const mesh of this._rocks.values()) {
      if (!mesh.visible || mesh.userData.collected) continue
      targets.push(mesh)
    }

    const hits = this._raycaster.intersectObjects(targets, true)
    if (!hits.length) return null

    const hit = hits[0]
    let obj = hit.object
    while (obj && !obj.userData?.id && obj.parent) obj = obj.parent
    const rockId = obj?.userData?.id
    if (!rockId) return null
    return { rockId, distance: hit.distance, point: hit.point?.clone?.() }
  }

  collect(rockId, { world = false } = {}) {
    const mesh = this._rocks.get(String(rockId))
    if (!mesh || !mesh.visible || mesh.userData.collected || mesh.userData.worldRemoved) return false

    mesh.userData.collected = true
    mesh.userData.respawnRemaining = world ? 0 : this._respawnSec
    mesh.visible = false
    if (world) mesh.userData.worldRemoved = true
    return true
  }

  markWorldRemoved(rockId) {
    const mesh = this._rocks.get(String(rockId))
    if (!mesh) return false
    mesh.userData.worldRemoved = true
    mesh.userData.collected = true
    mesh.userData.respawnRemaining = 0
    mesh.visible = false
    return true
  }

  respawnWorld(rockId) {
    const mesh = this._rocks.get(String(rockId))
    if (!mesh) return false
    mesh.userData.worldRemoved = false
    mesh.userData.collected = false
    mesh.userData.respawnRemaining = 0
    mesh.visible = true
    return true
  }

  /** Apply authoritative removed list for a whole chunk (supports respawn). */
  applyChunkState(chunkX, chunkZ, removedRocks) {
    const ck = `${Number(chunkX)}:${Number(chunkZ)}`
    const ids = this._rocksByChunk.get(ck)
    if (!ids) return

    const removed = new Set((removedRocks || []).map((id) => String(id)))

    for (const id of ids) {
      if (removed.has(String(id))) this.markWorldRemoved(id)
      else this.respawnWorld(id)
    }
  }
}
