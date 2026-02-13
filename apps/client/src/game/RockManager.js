import * as THREE from 'three'
import { mulberry32 } from './util.js'

function makeRockMesh(rng) {
  const g = new THREE.DodecahedronGeometry(0.22 + rng() * 0.18, 0)
  const m = new THREE.MeshStandardMaterial({ color: 0x6f757b, roughness: 1.0, metalness: 0.0 })
  const mesh = new THREE.Mesh(g, m)
  mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)
  mesh.userData = {
    collected: false,
    respawnRemaining: 0,
  }
  return mesh
}

export class RockManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    this._rocks = new Map() // id -> mesh
    this._raycaster = new THREE.Raycaster()
    this._raycaster.far = 2.5
    this._respawnSec = 8.0
    this._idCounter = 1
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
      this.scene.add(mesh)
      this._rocks.set(id, mesh)
    }
  }

  update(dt) {
    for (const mesh of this._rocks.values()) {
      // World persistence: removed rocks should stay gone (no respawn).
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
      } else {
        // rocks are static (no idle spin)
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

    const hits = this._raycaster.intersectObjects(targets, false)
    if (!hits.length) return null

    const hit = hits[0]
    const rockId = hit.object?.userData?.id
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
}
