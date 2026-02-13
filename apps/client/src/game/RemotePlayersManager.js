import * as THREE from 'three'

export class RemotePlayersManager {
  /** @param {{scene:THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    /** @type {Map<string, {root:THREE.Object3D, mesh:THREE.Mesh}>} */
    this.players = new Map()

    this._matA = new THREE.MeshStandardMaterial({ color: 0x7aa7ff, roughness: 0.8, metalness: 0.1, flatShading: true })
    this._matB = new THREE.MeshStandardMaterial({ color: 0xffb06a, roughness: 0.9, metalness: 0.0, flatShading: true })
    this._geo = new THREE.CapsuleGeometry(0.35, 1.2, 4, 8)
  }

  _ensure(id) {
    let p = this.players.get(id)
    if (p) return p

    const root = new THREE.Group()
    root.name = `RemotePlayer:${id}`

    const mat = (this.players.size % 2 === 0) ? this._matA : this._matB
    const mesh = new THREE.Mesh(this._geo, mat)
    mesh.position.y = 0.95
    root.add(mesh)

    this.scene.add(root)
    p = { root, mesh }
    this.players.set(id, p)
    return p
  }

  applySnapshot({ meId, players }) {
    const seen = new Set()
    for (const pl of players || []) {
      if (!pl?.id || pl.id === meId) continue
      const p = this._ensure(pl.id)
      p.root.position.set(pl.x || 0, 0, pl.z || 0)
      p.root.rotation.y = pl.yaw || 0
      seen.add(pl.id)
    }

    for (const [id, p] of this.players) {
      if (!seen.has(id)) {
        p.root.removeFromParent()
        this.players.delete(id)
      }
    }
  }

  clear() {
    for (const p of this.players.values()) p.root.removeFromParent()
    this.players.clear()
  }
}
