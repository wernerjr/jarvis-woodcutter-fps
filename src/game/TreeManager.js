import * as THREE from 'three'
import { mulberry32 } from './util.js'

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

  group.userData = {
    trunkH,
    trunkR,
    leafR,
    cut: false,
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
    // update colliders + respawn (dt-based so pause freezes timers)
    const t = performance.now()
    for (const { mesh, sphere } of this._trees.values()) {
      // keep collider centered if animating
      const trunkH = mesh.userData.trunkH
      sphere.center.set(mesh.position.x, mesh.position.y + trunkH * 0.8, mesh.position.z)

      if (mesh.userData.cut) {
        mesh.userData.respawnRemaining = Math.max(0, (mesh.userData.respawnRemaining ?? 0) - dt)
        if (mesh.userData.respawnRemaining === 0) this._respawn(mesh)
      } else {
        // simple "sway" for alive trees
        const sway = Math.sin((mesh.position.x + mesh.position.z + t * 0.0006)) * 0.01
        mesh.rotation.z = sway
      }
    }
  }

  getTrunkColliders() {
    const out = []
    for (const { mesh } of this._trees.values()) {
      if (!mesh.visible) continue
      if (mesh.userData.cut) continue
      out.push({ x: mesh.position.x, z: mesh.position.z, r: Math.max(0.18, mesh.userData.trunkR) + 0.08 })
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
    return { treeId, distance: hit.distance }
  }

  chop(treeId) {
    const item = this._trees.get(String(treeId))
    if (!item) return false
    const { mesh } = item

    if (mesh.userData.cut) return false

    mesh.userData.cut = true
    mesh.userData.respawnRemaining = this._respawnSec

    // cut animation: shrink + tilt
    mesh.rotation.x = -0.08
    mesh.scale.set(1, 0.2, 1)
    mesh.position.y = 0.05

    // hide leaves first for clarity
    for (const child of mesh.children) {
      if (child.geometry?.type?.includes('Cone')) child.visible = false
    }

    return true
  }

  resetAll() {
    for (const { mesh } of this._trees.values()) {
      this._respawn(mesh)
    }
  }

  _respawn(mesh) {
    mesh.userData.cut = false
    mesh.userData.respawnRemaining = 0

    mesh.scale.set(1, 1, 1)
    mesh.rotation.x = 0
    mesh.rotation.z = 0
    mesh.position.y = 0

    for (const child of mesh.children) child.visible = true
  }
}
