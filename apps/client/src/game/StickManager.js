import * as THREE from 'three'
import { mulberry32 } from './util.js'

function makeStickMesh(rng) {
  const group = new THREE.Group()

  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 1.0, metalness: 0.0 })

  // Bigger for gameplay readability/pickup.
  // Target: ~33% longer and ~2x thicker.
  const len = (0.22 + rng() * 0.18) * 1.33
  const r = (0.014 + rng() * 0.010) * 2.0

  const main = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, len, 7), wood)
  main.rotation.z = Math.PI / 2
  group.add(main)

  // Invisible hitbox to make pickup easier (raycast target).
  const hitGeo = new THREE.BoxGeometry(len * 1.85, r * 10.0, r * 10.0)
  const hitMat = new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthWrite: false })
  const hit = new THREE.Mesh(hitGeo, hitMat)
  hit.name = 'StickHitbox'
  group.add(hit)

  // Little branch for readability.
  const brLen = len * (0.35 + rng() * 0.25)
  const br = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.95, brLen, 6), wood)
  br.position.set((rng() * 0.08 - 0.04), 0.0, (rng() * 0.08 - 0.04))
  br.rotation.set((rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.9)
  group.add(br)

  group.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.25)

  group.userData = {
    collected: false,
    respawnRemaining: 0,
  }

  return group
}

export class StickManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    this._sticks = new Map() // id -> group
    this._sticksByChunk = new Map() // "cx:cz" -> Set<id>
    this._raycaster = new THREE.Raycaster()
    this._raycaster.far = 2.5

    // Must match server wsServer.ts
    this._chunkSize = 32

    this._idCounter = 1
  }

  init({ seed = 777, count = 40, radius = 45 } = {}) {
    const rng = mulberry32(seed)
    for (let i = 0; i < count; i++) {
      const id = String(this._idCounter++)
      const mesh = makeStickMesh(rng)
      mesh.userData.id = id

      const ang = rng() * Math.PI * 2
      const r = (0.15 + rng() * 0.85) * radius
      mesh.position.set(Math.cos(ang) * r, 0.02, Math.sin(ang) * r)
      mesh.rotation.y = rng() * Math.PI * 2

      const cx = Math.floor(mesh.position.x / this._chunkSize)
      const cz = Math.floor(mesh.position.z / this._chunkSize)
      mesh.userData.chunkX = cx
      mesh.userData.chunkZ = cz
      const ck = `${cx}:${cz}`
      if (!this._sticksByChunk.has(ck)) this._sticksByChunk.set(ck, new Set())
      this._sticksByChunk.get(ck).add(id)

      this.scene.add(mesh)
      this._sticks.set(id, mesh)
    }
  }

  update(dt) {
    for (const mesh of this._sticks.values()) {
      if (mesh.userData.worldRemoved) {
        mesh.visible = false
        continue
      }

      if (mesh.userData.collected) {
        mesh.userData.respawnRemaining = Math.max(0, mesh.userData.respawnRemaining - dt)
        if (mesh.userData.respawnRemaining === 0) {
          mesh.userData.collected = false
          mesh.visible = true
        }
      }
    }
  }

  raycastFromCamera(camera) {
    this._raycaster.setFromCamera({ x: 0, y: 0 }, camera)

    const targets = []
    for (const mesh of this._sticks.values()) {
      if (!mesh.visible || mesh.userData.collected) continue
      targets.push(mesh)
    }

    const hits = this._raycaster.intersectObjects(targets, true)
    if (!hits.length) return null

    let obj = hits[0].object
    while (obj && !obj.userData?.id && obj.parent) obj = obj.parent
    const stickId = obj?.userData?.id
    if (!stickId) return null

    return { stickId: String(stickId), distance: hits[0].distance, point: hits[0].point?.clone?.() }
  }

  collect(stickId, { world = false } = {}) {
    const mesh = this._sticks.get(String(stickId))
    if (!mesh || !mesh.visible || mesh.userData.collected || mesh.userData.worldRemoved) return false

    mesh.userData.collected = true
    mesh.userData.respawnRemaining = world ? 0 : 0
    mesh.visible = false
    if (world) mesh.userData.worldRemoved = true
    return true
  }

  markWorldRemoved(stickId) {
    const mesh = this._sticks.get(String(stickId))
    if (!mesh) return false
    mesh.userData.worldRemoved = true
    mesh.userData.collected = true
    mesh.userData.respawnRemaining = 0
    mesh.visible = false
    return true
  }

  respawnWorld(stickId) {
    const mesh = this._sticks.get(String(stickId))
    if (!mesh) return false
    mesh.userData.worldRemoved = false
    mesh.userData.collected = false
    mesh.userData.respawnRemaining = 0
    mesh.visible = true
    return true
  }

  applyChunkState(chunkX, chunkZ, removedSticks) {
    const ck = `${Number(chunkX)}:${Number(chunkZ)}`
    const ids = this._sticksByChunk.get(ck)
    if (!ids) return

    const removed = new Set((removedSticks || []).map((id) => String(id)))

    for (const id of ids) {
      if (removed.has(String(id))) this.markWorldRemoved(id)
      else this.respawnWorld(id)
    }
  }
}
