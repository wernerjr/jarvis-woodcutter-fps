import * as THREE from 'three'

export class ChestManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    this._chests = new Map()
    this._ray = new THREE.Raycaster()
  }

  resetAll() {
    for (const c of this._chests.values()) c.mesh.removeFromParent()
    this._chests.clear()
  }

  _makeMesh() {
    const g = new THREE.Group()

    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.95 })
    const metal = new THREE.MeshStandardMaterial({ color: 0x2f2f36, roughness: 0.5, metalness: 0.5 })

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.65), wood)
    base.position.y = 0.275

    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.22, 0.67), wood)
    lid.position.y = 0.55

    const band = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.06, 0.69), metal)
    band.position.y = 0.47

    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.04), metal)
    lock.position.set(0, 0.40, 0.345)

    g.add(base)
    g.add(lid)
    g.add(band)
    g.add(lock)

    return g
  }

  /** @param {{x:number,z:number}} pos */
  place(pos, id = null) {
    const assigned = id ? String(id) : (crypto.randomUUID?.() ?? String(Math.random()).slice(2))
    const mesh = this._makeMesh()
    mesh.position.set(pos.x, 0, pos.z)
    mesh.userData.chestId = assigned
    this.scene.add(mesh)
    this._chests.set(assigned, { id: assigned, mesh })
    return assigned
  }

  /** @returns {{x:number,z:number,r:number}[]} */
  getColliders() {
    const out = []
    for (const c of this._chests.values()) {
      out.push({ x: c.mesh.position.x, z: c.mesh.position.z, r: 0.9 })
    }
    return out
  }

  /** @param {THREE.Camera} camera */
  raycastFromCamera(camera) {
    const origin = new THREE.Vector3()
    const dir = new THREE.Vector3()
    camera.getWorldPosition(origin)
    camera.getWorldDirection(dir)

    this._ray.set(origin, dir)
    this._ray.far = 3.0

    const roots = []
    for (const c of this._chests.values()) roots.push(c.mesh)

    const hits = this._ray.intersectObjects(roots, true)
    if (!hits.length) return null

    let obj = hits[0].object
    while (obj && !obj.userData.chestId && obj.parent) obj = obj.parent
    const chestId = obj?.userData?.chestId
    if (!chestId) return null

    return { chestId: String(chestId), point: hits[0].point, distance: hits[0].distance }
  }

  get(id) {
    return this._chests.get(String(id))
  }

  remove(id) {
    const sid = String(id)
    const c = this._chests.get(sid)
    if (c) {
      c.mesh.removeFromParent()
      this._chests.delete(sid)
    }

    // Hard cleanup: remove any orphan meshes that still carry this chestId but are
    // not in the map (can happen if we placed twice due to chunk reconciliation).
    try {
      const toRemove = []
      this.scene.traverse((obj) => {
        if (obj?.userData?.chestId && String(obj.userData.chestId) === sid) {
          // remove at the mesh root that holds chestId
          toRemove.push(obj)
        }
      })
      for (const obj of toRemove) obj.removeFromParent()
    } catch {
      // ignore
    }

    return true
  }
}
