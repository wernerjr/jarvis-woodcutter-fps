import * as THREE from 'three'

export class MineManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene

    // World placement
    this.center = new THREE.Vector3(58, 0, -18)
    this.entrance = new THREE.Vector3(50, 0, -18)

    /** @type {{x:number,z:number,r:number}[]} */
    this._colliders = []

    this._group = new THREE.Group()
    this._group.name = 'Mine'

    this._light = new THREE.PointLight(0xfff1cc, 1.2, 26, 1.4)
    this._light.position.set(this.center.x + 10, 4.2, this.center.z)

    this._amb = new THREE.AmbientLight(0x3a3a44, 0.25)
  }

  init() {
    // Mountain (simple stylized rock dome)
    const domeGeo = new THREE.SphereGeometry(12, 18, 12)
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2f, roughness: 1.0, metalness: 0.0 })
    const dome = new THREE.Mesh(domeGeo, domeMat)
    dome.scale.set(1.15, 0.75, 1.0)
    dome.position.copy(this.center)
    dome.position.y = 6.3

    // Entrance frame (to read clearly from outside)
    const frameGeo = new THREE.BoxGeometry(4.8, 4.2, 1.6)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 1.0 })
    const frame = new THREE.Mesh(frameGeo, frameMat)
    frame.position.set(this.entrance.x, 2.1, this.entrance.z)

    const holeGeo = new THREE.BoxGeometry(3.4, 3.2, 1.7)
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 1.0 })
    const hole = new THREE.Mesh(holeGeo, holeMat)
    hole.position.set(this.entrance.x, 1.7, this.entrance.z)

    // Simple tunnel interior (visual only)
    const tunnelGeo = new THREE.BoxGeometry(18, 5.0, 7.0)
    const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x101015, roughness: 1.0, metalness: 0.0, side: THREE.BackSide })
    const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat)
    tunnel.position.set(this.entrance.x + 9.2, 2.5, this.entrance.z)

    // Floor tint inside (subtle)
    const floorGeo = new THREE.PlaneGeometry(18, 7)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x141419, roughness: 1.0 })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(this.entrance.x + 9.2, 0.01, this.entrance.z)

    this._group.add(dome)
    this._group.add(frame)
    this._group.add(hole)
    this._group.add(tunnel)
    this._group.add(floor)

    this.scene.add(this._group)
    this.scene.add(this._light)
    this.scene.add(this._amb)

    // Colliders: ring around mountain with an opening at the entrance.
    this._colliders = []
    const cx = this.center.x
    const cz = this.center.z
    const ringR = 10.2
    const cR = 1.7
    const n = 18
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      // Entrance faces west (pi). Skip a small arc to form the opening.
      const da = Math.abs(this._wrapAngle(a - Math.PI))
      if (da < 0.38) continue
      this._colliders.push({ x: cx + Math.cos(a) * ringR, z: cz + Math.sin(a) * ringR, r: cR })
    }

    // Tunnel walls (guide the player and prevent clipping through the sides)
    const tx0 = this.entrance.x + 1.5
    const tz0 = this.entrance.z
    const wallR = 0.9
    for (let k = 0; k < 10; k++) {
      const x = tx0 + k * 1.6
      this._colliders.push({ x, z: tz0 + 3.2, r: wallR })
      this._colliders.push({ x, z: tz0 - 3.2, r: wallR })
    }

    // Back wall (stop at the end)
    this._colliders.push({ x: this.entrance.x + 17.4, z: tz0, r: 2.2 })
  }

  /** @returns {{x:number,z:number,r:number}[]} */
  getColliders() {
    return this._colliders
  }

  getOreSpawnPoints() {
    // Points inside the tunnel.
    const pts = []
    for (let i = 0; i < 8; i++) {
      pts.push({ x: this.entrance.x + 5 + i * 1.6, y: 0.9, z: this.entrance.z + (i % 2 === 0 ? 1.6 : -1.6) })
    }
    return pts
  }

  _wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2
    while (a < -Math.PI) a += Math.PI * 2
    return a
  }
}
