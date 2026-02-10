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
    this._rocks = []
    this._respawnSec = 8.0
  }

  init({ seed = 42, count = 28, radius = 45 } = {}) {
    const rng = mulberry32(seed)
    for (let i = 0; i < count; i++) {
      const mesh = makeRockMesh(rng)
      const ang = rng() * Math.PI * 2
      const r = (0.15 + rng() * 0.85) * radius
      mesh.position.set(Math.cos(ang) * r, 0.02, Math.sin(ang) * r)
      this.scene.add(mesh)
      this._rocks.push(mesh)
    }
  }

  update(dt) {
    for (const mesh of this._rocks) {
      if (mesh.userData.collected) {
        mesh.userData.respawnRemaining = Math.max(0, mesh.userData.respawnRemaining - dt)
        if (mesh.userData.respawnRemaining === 0) {
          mesh.userData.collected = false
          mesh.visible = true
        }
      } else {
        // tiny idle spin
        mesh.rotation.y += dt * 0.4
      }
    }
  }

  resetAll() {
    for (const mesh of this._rocks) {
      mesh.userData.collected = false
      mesh.userData.respawnRemaining = 0
      mesh.visible = true
    }
  }

  /**
   * Auto-pickup closest rock within radius.
   * @param {{x:number,y:number,z:number}} pos
   * @param {number} radius
   */
  tryPickup(pos, radius = 1.1) {
    let best = null
    let bestD2 = radius * radius
    for (const mesh of this._rocks) {
      if (!mesh.visible || mesh.userData.collected) continue
      const dx = mesh.position.x - pos.x
      const dz = mesh.position.z - pos.z
      const d2 = dx * dx + dz * dz
      if (d2 <= bestD2) {
        bestD2 = d2
        best = mesh
      }
    }
    if (!best) return false

    best.userData.collected = true
    best.userData.respawnRemaining = this._respawnSec
    best.visible = false
    return true
  }
}
