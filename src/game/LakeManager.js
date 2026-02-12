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
    // Base radius (keep close to river width ~8, so lake is small)
    this.baseR = 7.2
    this.y = 0.021

    // Organic wobble (makes it look more natural than a perfect oval)
    this.segments = 64
    this.amp1 = 1.2
    this.amp2 = 0.7
    this.amp3 = 0.35

    // collider tuning (thick enough to block, but not huge)
    this.colliderBands = [
      { off: 0.0, r: 3.3 },
      { off: 1.2, r: 2.7 },
    ]

    this._t = 0
  }

  resetAll() {
    this._group.removeFromParent()
    this._group = new THREE.Group()
    this._mesh = null
    this._colliders = []
  }

  /** @param {{center?:{x:number,z:number}, baseR?:number}} opts */
  init({ center = { x: 102, z: 0 }, baseR = 7.2 } = {}) {
    this.resetAll()

    this.center.set(center.x, 0, center.z)
    this.baseR = baseR

    // Visual: organic blob (serpentine-ish) built from a 2D shape on XZ.
    const pts2 = []
    const n = this.segments
    const R = this.baseR

    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2
      const wob =
        Math.sin(a * 2.1 + 0.4) * this.amp1 +
        Math.sin(a * 5.2 + 1.7) * this.amp2 +
        Math.sin(a * 9.4 + 2.4) * this.amp3
      const rr = Math.max(2.5, R + wob)
      pts2.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr))
    }

    const shape = new THREE.Shape(pts2)
    const geo = new THREE.ShapeGeometry(shape, 1)
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

    // Colliders: use the same boundary points used to build the blob.
    // We convert the local 2D points (x,z) into world space and add 2 bands + midpoints.
    this._colliders = []

    const addBands = (wx, wz) => {
      const outward = new THREE.Vector3(wx - this.center.x, 0, wz - this.center.z)
      if (outward.lengthSq() < 1e-6) outward.set(1, 0, 0)
      outward.normalize()
      for (const b of this.colliderBands) {
        this._colliders.push({ x: wx + outward.x * b.off, z: wz + outward.z * b.off, r: b.r })
      }
    }

    // pts2 includes a duplicated closing point; use n points for iteration.
    for (let i = 0; i < n; i++) {
      const p = pts2[i]
      const pn = pts2[(i + 1) % n]

      const wx = this.center.x + p.x
      const wz = this.center.z + p.y
      addBands(wx, wz)

      // Midpoint
      const mx = this.center.x + (p.x + pn.x) * 0.5
      const mz = this.center.z + (p.y + pn.y) * 0.5
      addBands(mx, mz)
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
