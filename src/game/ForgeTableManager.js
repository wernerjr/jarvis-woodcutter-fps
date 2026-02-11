import * as THREE from 'three'

export class ForgeTableManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    this._tables = new Map()
    this._ray = new THREE.Raycaster()
    this._id = 1
  }

  resetAll() {
    for (const t of this._tables.values()) t.mesh.removeFromParent()
    this._tables.clear()
    this._id = 1
  }

  _makeMesh() {
    const g = new THREE.Group()

    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2e1d, roughness: 1.0 })
    const metal = new THREE.MeshStandardMaterial({ color: 0x3c3c46, roughness: 0.55, metalness: 0.35 })
    const stone = new THREE.MeshStandardMaterial({ color: 0x2a2a2f, roughness: 1.0 })

    // Table top
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 1.2), wood)
    top.position.y = 1.02

    // Legs
    const legGeo = new THREE.BoxGeometry(0.14, 1.0, 0.14)
    const legs = [
      [-0.95, 0.5, -0.45],
      [0.95, 0.5, -0.45],
      [-0.95, 0.5, 0.45],
      [0.95, 0.5, 0.45],
    ]
    for (const [x, y, z] of legs) {
      const l = new THREE.Mesh(legGeo, wood)
      l.position.set(x, y, z)
      g.add(l)
    }

    // Small anvil
    const anvilBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.35), metal)
    anvilBase.position.set(-0.45, 1.18, 0)
    const anvilHorn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.48, 8), metal)
    anvilHorn.rotation.z = Math.PI / 2
    anvilHorn.position.set(-0.12, 1.22, 0)

    // Stone block support
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.55), stone)
    block.position.set(-0.45, 0.75, 0)

    // Hammer + tongs silhouettes
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.12), metal)
    hammer.position.set(0.45, 1.20, -0.20)
    hammer.rotation.y = 0.6

    const tong = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.06), metal)
    tong.position.set(0.45, 1.16, 0.22)
    tong.rotation.y = -0.7

    g.add(top)
    g.add(block)
    g.add(anvilBase)
    g.add(anvilHorn)
    g.add(hammer)
    g.add(tong)

    return g
  }

  /** @param {{x:number,z:number}} pos */
  place(pos) {
    const id = String(this._id++)
    const mesh = this._makeMesh()
    mesh.position.set(pos.x, 0, pos.z)
    mesh.userData.forgeTableId = id
    this.scene.add(mesh)

    this._tables.set(id, { id, mesh })
    return id
  }

  /** @returns {{x:number,z:number,r:number}[]} */
  getColliders() {
    const out = []
    for (const t of this._tables.values()) out.push({ x: t.mesh.position.x, z: t.mesh.position.z, r: 1.2 })
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
    for (const t of this._tables.values()) roots.push(t.mesh)

    const hits = this._ray.intersectObjects(roots, true)
    if (!hits.length) return null

    let obj = hits[0].object
    while (obj && !obj.userData.forgeTableId && obj.parent) obj = obj.parent
    const forgeTableId = obj?.userData?.forgeTableId
    if (!forgeTableId) return null

    return { forgeTableId: String(forgeTableId), point: hits[0].point, distance: hits[0].distance }
  }

  get(id) {
    return this._tables.get(String(id))
  }

  remove(id) {
    const t = this._tables.get(String(id))
    if (!t) return false
    t.mesh.removeFromParent()
    this._tables.delete(String(id))
    return true
  }
}
