import * as THREE from 'three'

export class LakeManager {
  /** @param {{scene:THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene

    this.enabled = true

    this._group = new THREE.Group()
    this._mesh = null

    /** @type {{x:number,z:number,r:number}[]} */
    this._colliders = []

    // Tunables
    this.center = new THREE.Vector3(102, 0, 0)
    this.rx = 16
    this.rz = 11
    this.y = 0.021

    // collider tuning
    this.colliderBands = [
      { off: 0.0, r: 3.8 },
      { off: 1.8, r: 3.0 },
    ]

    this._t = 0
  }

  resetAll() {
    this._group.removeFromParent()
    this._group = new THREE.Group()
    this._mesh = null
    this._colliders = []
  }

  /** @param {{center?:{x:number,z:number}, rx?:number, rz?:number}} opts */
  init({ center = { x: 102, z: 0 }, rx = 16, rz = 11 } = {}) {
    this.resetAll()

    this.center.set(center.x, 0, center.z)
    this.rx = rx
    this.rz = rz

    // Visual: simple ellipse plane, slightly above ground to avoid z-fighting.
    const geo = new THREE.CircleGeometry(1, 64)
    geo.scale(this.rx, 1, this.rz)
    geo.rotateX(-Math.PI / 2)

    const mat = new THREE.MeshStandardMaterial({
      color: 0x225d87,
      roughness: 0.28,
      metalness: 0.0,
      transparent: true,
      opacity: 0.92,
      emissive: 0x0b2a3b,
      emissiveIntensity: 0.75,
      side: THREE.DoubleSide,
    })

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(this.center.x, this.y, this.center.z)
    mesh.frustumCulled = false
    mesh.receiveShadow = false
    mesh.castShadow = false

    this._mesh = mesh
    this._group.add(mesh)
    this.scene.add(this._group)

    // Colliders: circles along the perimeter (thick enough to block diagonal squeeze).
    this._colliders = []
    const samples = 44
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2
      const px = this.center.x + Math.cos(a) * this.rx
      const pz = this.center.z + Math.sin(a) * this.rz

      // Approx outward from center of lake.
      const outward = new THREE.Vector3(px - this.center.x, 0, pz - this.center.z).normalize()

      for (const b of this.colliderBands) {
        this._colliders.push({
          x: px + outward.x * b.off,
          z: pz + outward.z * b.off,
          r: b.r,
        })
      }

      // Midpoint to reduce gaps.
      const a2 = ((i + 0.5) / samples) * Math.PI * 2
      const mx = this.center.x + Math.cos(a2) * this.rx
      const mz = this.center.z + Math.sin(a2) * this.rz
      const out2 = new THREE.Vector3(mx - this.center.x, 0, mz - this.center.z).normalize()
      for (const b of this.colliderBands) {
        this._colliders.push({ x: mx + out2.x * b.off, z: mz + out2.z * b.off, r: b.r })
      }
    }
  }

  /** @returns {{x:number,z:number,r:number}[]} */
  getColliders() {
    return this._colliders
  }

  /** @param {number} dt */
  update(dt) {
    if (!this.enabled) return
    if (!this._mesh) return

    this._t += dt
    const m = /** @type {THREE.MeshStandardMaterial} */ (this._mesh.material)
    const s = 0.5 + 0.5 * Math.sin(this._t * 0.55)
    m.emissiveIntensity = 0.50 + s * 0.18
    m.opacity = 0.84 + s * 0.06
  }
}
