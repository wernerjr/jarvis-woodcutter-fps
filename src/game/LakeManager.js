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
    this.baseR = 6.2
    this.y = 0.021

    // Organic wobble (makes it look more natural than a perfect oval)
    this.segments = 64
    this.amp1 = 1.2
    this.amp2 = 0.7
    this.amp3 = 0.35

    // collider tuning (thick enough to block, but not huge)
    // Colliders should sit close to the shoreline (like the river), so the player can approach the water.
    // Use one band slightly inward + one slightly outward to avoid diagonal leaks.
    this.colliderBands = [
      { off: -0.35, r: 2.6 },
      { off: 0.85, r: 2.2 },
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

    // Offset colliders using a local edge normal (not just radial-from-center),
    // otherwise concave/serpentine parts won't match the shoreline.
    const addBands = (wx, wz, nx, nz) => {
      // (nx,nz) should point outward from the shoreline.
      const d2 = nx * nx + nz * nz
      if (d2 < 1e-8) {
        nx = 1
        nz = 0
      } else {
        const inv = 1 / Math.sqrt(d2)
        nx *= inv
        nz *= inv
      }

      for (const b of this.colliderBands) {
        this._colliders.push({ x: wx + nx * b.off, z: wz + nz * b.off, r: b.r })
      }
    }

    // pts2 includes a duplicated closing point; use n points for iteration.
    for (let i = 0; i < n; i++) {
      const pPrev = pts2[(i - 1 + n) % n]
      const p = pts2[i]
      const pNext = pts2[(i + 1) % n]

      // Vertex normal from prev->next tangent.
      const tx = pNext.x - pPrev.x
      const tz = pNext.y - pPrev.y
      // Perp (t.z, -t.x) gives a stable outward candidate for CCW polygons.
      let nx = tz
      let nz = -tx

      // Ensure it points outward (away from lake center at 0,0 in local space).
      const dot = nx * p.x + nz * p.y
      if (dot < 0) {
        nx = -nx
        nz = -nz
      }

      const wx = this.center.x + p.x
      const wz = this.center.z + p.y
      addBands(wx, wz, nx, nz)

      // Midpoint normal from edge p->pNext (better fit on tight curves).
      const ex = pNext.x - p.x
      const ez = pNext.y - p.y
      let mnx = ez
      let mnz = -ex
      const mxLocal = (p.x + pNext.x) * 0.5
      const mzLocal = (p.y + pNext.y) * 0.5
      const mdot = mnx * mxLocal + mnz * mzLocal
      if (mdot < 0) {
        mnx = -mnx
        mnz = -mnz
      }

      const mx = this.center.x + mxLocal
      const mz = this.center.z + mzLocal
      addBands(mx, mz, mnx, mnz)
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
    // Match river shimmer exactly for consistent color read.
    const s = 0.5 + 0.5 * Math.sin(this._t * 0.6)
    m.emissiveIntensity = 0.48 + s * 0.18
    m.opacity = 0.84 + s * 0.06
  }
}
