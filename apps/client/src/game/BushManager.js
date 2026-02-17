import * as THREE from 'three'
import { mulberry32 } from './util.js'

function makeBushMesh(rng) {
  const group = new THREE.Group()

  const h = 0.45 + rng() * 0.25
  const r = 0.32 + rng() * 0.22

  const mat = new THREE.MeshStandardMaterial({ color: 0x1f6b2a, roughness: 1.0, metalness: 0.0 })
  const geo = new THREE.SphereGeometry(r, 10, 9)
  const bush = new THREE.Mesh(geo, mat)
  bush.position.y = h * 0.45
  bush.scale.y = 0.75
  group.add(bush)

  // Invisible hitbox (easier pickup)
  const hitGeo = new THREE.SphereGeometry(r * 2.2, 12, 10)
  const hitMat = new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthWrite: false })
  const hit = new THREE.Mesh(hitGeo, hitMat)
  hit.name = 'BushHitbox'
  hit.position.y = h * 0.40
  group.add(hit)

  group.rotation.y = rng() * Math.PI * 2

  group.userData = {
    collected: false,
    respawnRemaining: 0,
  }

  return group
}

export class BushManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    this._bushes = new Map() // id -> group
    this._bushesByChunk = new Map() // "cx:cz" -> Set<id>
    this._raycaster = new THREE.Raycaster()
    this._raycaster.far = 2.6

    // Must match server wsServer.ts
    this._chunkSize = 32

    this._idCounter = 1
  }

  init({ seed = 2026, count = 26, radius = 46 } = {}) {
    const rng = mulberry32(seed)

    for (let i = 0; i < count; i++) {
      const id = String(this._idCounter++)
      const mesh = makeBushMesh(rng)
      mesh.userData.id = id

      // Scatter in the world ring, keep away from exact center a bit.
      const ang = rng() * Math.PI * 2
      const rr = (0.22 + rng() * 0.78) * radius
      mesh.position.set(Math.cos(ang) * rr, 0.01, Math.sin(ang) * rr)

      const cx = Math.floor(mesh.position.x / this._chunkSize)
      const cz = Math.floor(mesh.position.z / this._chunkSize)
      mesh.userData.chunkX = cx
      mesh.userData.chunkZ = cz
      const ck = `${cx}:${cz}`
      if (!this._bushesByChunk.has(ck)) this._bushesByChunk.set(ck, new Set())
      this._bushesByChunk.get(ck).add(id)

      this.scene.add(mesh)
      this._bushes.set(id, mesh)
    }
  }

  update(dt) {
    for (const mesh of this._bushes.values()) {
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
    for (const mesh of this._bushes.values()) {
      if (!mesh.visible || mesh.userData.collected) continue
      targets.push(mesh)
    }

    const hits = this._raycaster.intersectObjects(targets, true)
    if (!hits.length) return null

    let obj = hits[0].object
    while (obj && !obj.userData?.id && obj.parent) obj = obj.parent
    const bushId = obj?.userData?.id
    if (!bushId) return null

    // Use the root position for server chunking (avoid boundary issues from hit point on large hitbox).
    return {
      bushId: String(bushId),
      distance: hits[0].distance,
      point: hits[0].point?.clone?.(),
      x: obj.position?.x ?? 0,
      z: obj.position?.z ?? 0,
    }
  }

  collect(bushId, { world = false } = {}) {
    const mesh = this._bushes.get(String(bushId))
    if (!mesh || !mesh.visible || mesh.userData.collected || mesh.userData.worldRemoved) return false

    mesh.userData.collected = true
    mesh.userData.respawnRemaining = world ? 0 : 0
    mesh.visible = false
    if (world) mesh.userData.worldRemoved = true

    return true
  }

  markWorldRemoved(bushId) {
    const mesh = this._bushes.get(String(bushId))
    if (!mesh) return false
    mesh.userData.worldRemoved = true
    mesh.userData.collected = true
    mesh.userData.respawnRemaining = 0
    mesh.visible = false
    return true
  }

  respawnWorld(bushId) {
    const mesh = this._bushes.get(String(bushId))
    if (!mesh) return false
    mesh.userData.worldRemoved = false
    mesh.userData.collected = false
    mesh.userData.respawnRemaining = 0
    mesh.visible = true
    return true
  }

  applyChunkState(chunkX, chunkZ, removedBushes) {
    const ck = `${Number(chunkX)}:${Number(chunkZ)}`
    const ids = this._bushesByChunk.get(ck)
    if (!ids) return

    const removed = new Set((removedBushes || []).map((id) => String(id)))

    for (const id of ids) {
      if (removed.has(String(id))) this.markWorldRemoved(id)
      else this.respawnWorld(id)
    }
  }
}
