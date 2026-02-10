import * as THREE from 'three'
import { mulberry32 } from './util.js'

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function rollHp() {
  // Simple tuning: multiple hits needed, but not too many.
  return 30 + Math.floor(Math.random() * 21) // 30..50
}

function makeTreeMesh(rng) {
  const group = new THREE.Group()

  const trunkH = 1.7 + rng() * 1.0
  const trunkR = 0.18 + rng() * 0.10

  const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.85, trunkR, trunkH, 10)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1.0, metalness: 0.0 })
  const trunk = new THREE.Mesh(trunkGeo, trunkMat)
  trunk.position.y = trunkH / 2

  const leafH = 1.8 + rng() * 1.2
  const leafR = 0.9 + rng() * 0.55
  const leafGeo = new THREE.ConeGeometry(leafR, leafH, 10)
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f6b2a, roughness: 1.0, metalness: 0.0 })
  const leaf = new THREE.Mesh(leafGeo, leafMat)
  leaf.position.y = trunkH + leafH / 2 - 0.15

  // Small variation
  leaf.rotation.y = rng() * Math.PI

  group.add(trunk)
  group.add(leaf)

  const maxHp = rollHp()
  group.userData = {
    trunkH,
    trunkR,
    leafR,
    maxHp,
    hp: maxHp,
    cut: false,
    falling: false,
    fallT: 0,
    fallDirX: 0,
    fallDirZ: 1,
    respawnRemaining: 0,
  }

  return group
}

export class TreeManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene

    this._trees = new Map() // id -> { mesh, collider }
    this._raycaster = new THREE.Raycaster()
    this._raycaster.far = 5

    this._respawnSec = 5.0
    this._idCounter = 1

    this._tmpVec = new THREE.Vector3()
  }

  init({ seed = 1, count = 30, radius = 35 } = {}) {
    const rng = mulberry32(seed)

    for (let i = 0; i < count; i++) {
      const id = String(this._idCounter++)
      const mesh = makeTreeMesh(rng)

      const ang = rng() * Math.PI * 2
      const r = (0.25 + rng() * 0.75) * radius
      mesh.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r)
      mesh.rotation.y = rng() * Math.PI * 2

      // Collider approx: sphere around trunk center (for raycast grouping)
      const trunkH = mesh.userData.trunkH
      const leafR = mesh.userData.leafR
      const sph = new THREE.Sphere(mesh.position.clone().add(new THREE.Vector3(0, trunkH * 0.8, 0)), Math.max(0.5, leafR * 0.75))

      mesh.userData.id = id
      this.scene.add(mesh)

      this._trees.set(id, { mesh, sphere: sph })
    }
  }

  update(dt) {
    // update colliders + fall/respawn (dt-based so pause freezes timers)
    const t = performance.now()
    for (const { mesh, sphere } of this._trees.values()) {
      // keep collider centered if animating
      const trunkH = mesh.userData.trunkH
      sphere.center.set(mesh.position.x, mesh.position.y + trunkH * 0.8, mesh.position.z)

      if (mesh.userData.falling) {
        mesh.userData.fallT = Math.min(1, mesh.userData.fallT + dt / 0.55)
        const p = easeOutCubic(mesh.userData.fallT)
        const ang = p * (Math.PI / 2)

        // Fall away from player: use dir in XZ to compute tilt on x/z.
        const dx = mesh.userData.fallDirX
        const dz = mesh.userData.fallDirZ
        mesh.rotation.x = dz * ang
        mesh.rotation.z = -dx * ang

        if (mesh.userData.fallT >= 1) {
          mesh.userData.falling = false
          mesh.userData.cut = true
          mesh.userData.respawnRemaining = this._respawnSec
          mesh.visible = false
        }
        continue
      }

      if (mesh.userData.cut) {
        mesh.userData.respawnRemaining = Math.max(0, (mesh.userData.respawnRemaining ?? 0) - dt)
        if (mesh.userData.respawnRemaining === 0) this._respawn(mesh)
        continue
      }

      // simple "sway" for alive trees
      const sway = Math.sin((mesh.position.x + mesh.position.z + t * 0.0006)) * 0.01
      mesh.rotation.z = sway
    }
  }

  getTrunkColliders() {
    const out = []
    for (const { mesh } of this._trees.values()) {
      if (!mesh.visible) continue
      // Keep collision while falling; remove only after it's gone.
      if (mesh.userData.cut) continue
      out.push({ x: mesh.position.x, z: mesh.position.z, r: Math.max(0.18, mesh.userData.trunkR) + 0.10 })
    }
    return out
  }

  raycastFromCamera(camera) {
    this._raycaster.setFromCamera({ x: 0, y: 0 }, camera)

    // intersect meshes (children). We'll map back to tree group via parent chain.
    const targets = []
    for (const { mesh } of this._trees.values()) {
      if (mesh.visible) targets.push(mesh)
    }
    const hits = this._raycaster.intersectObjects(targets, true)
    if (!hits.length) return null

    const hit = hits[0]
    let obj = hit.object
    while (obj && !obj.userData?.id) obj = obj.parent
    if (!obj?.userData?.id) return null

    const treeId = obj.userData.id
    return { treeId, distance: hit.distance, point: hit.point.clone() }
  }

  chop(treeId, playerPos) {
    const item = this._trees.get(String(treeId))
    if (!item) return false
    const { mesh } = item

    if (mesh.userData.cut || mesh.userData.falling) return false

    // Start falling animation. Tree is considered "cut" for score/loot purposes now.
    mesh.userData.falling = true
    mesh.userData.fallT = 0

    // Fall direction: away from player (normalized XZ).
    let dx = mesh.position.x - (playerPos?.x ?? 0)
    let dz = mesh.position.z - (playerPos?.z ?? 0)
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    mesh.userData.fallDirX = dx
    mesh.userData.fallDirZ = dz

    // Make sure it's visible and full size.
    mesh.visible = true
    mesh.scale.set(1, 1, 1)

    // Hide leaves early so the fall reads better.
    for (const child of mesh.children) {
      if (child.geometry?.type?.includes('Cone')) child.visible = false
    }

    return true
  }

  /**
   * Applies damage. Returns state for UI.
   * @param {string} treeId
   * @param {number} dmg
   * @param {any} playerPos
   */
  damage(treeId, dmg, playerPos) {
    const item = this._trees.get(String(treeId))
    if (!item) return null
    const { mesh } = item

    if (mesh.userData.cut || mesh.userData.falling) return null

    mesh.userData.hp = Math.max(-9999, (mesh.userData.hp ?? mesh.userData.maxHp) - dmg)

    const cutNow = mesh.userData.hp <= 0
    if (cutNow) {
      const ok = this.chop(treeId, playerPos)
      return { cut: ok, hp: 0, maxHp: mesh.userData.maxHp }
    }

    // Minor feedback: tiny trunk tilt.
    mesh.rotation.x = -0.01

    return { cut: false, hp: mesh.userData.hp, maxHp: mesh.userData.maxHp }
  }

  resetAll() {
    for (const { mesh } of this._trees.values()) {
      this._respawn(mesh)
    }
  }

  _respawn(mesh) {
    mesh.userData.cut = false
    mesh.userData.falling = false
    mesh.userData.fallT = 0
    mesh.userData.respawnRemaining = 0

    // Reset HP (reroll to keep some variety per respawn)
    mesh.userData.maxHp = rollHp()
    mesh.userData.hp = mesh.userData.maxHp

    mesh.visible = true
    mesh.scale.set(1, 1, 1)
    mesh.rotation.x = 0
    mesh.rotation.z = 0
    mesh.position.y = 0

    for (const child of mesh.children) child.visible = true
  }
}
