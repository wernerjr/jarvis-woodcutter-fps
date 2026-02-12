import * as THREE from 'three'

export class RiverManager {
  /** @param {{scene:THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene

    this.enabled = true

    this._group = new THREE.Group()
    this._mesh = null

    /** @type {{x:number,z:number,r:number}[]} */
    this._colliders = []

    // params
    this.radius = 95
    this.width = 8
    this.segments = 220

    this._t = 0
  }

  resetAll() {
    this._group.removeFromParent()
    this._group = new THREE.Group()
    this._mesh = null
    this._colliders = []
  }

  /** @param {{radius?:number,width?:number,segments?:number}} opts */
  init({ radius = 95, width = 8, segments = 220 } = {}) {
    this.resetAll()
    this.radius = radius
    this.width = width
    this.segments = segments

    // Generate a closed loop around the playable area (serpentine circle).
    const pts = []
    const R = radius
    // More serpentine: multi-frequency wobble.
    const amp1 = 6.2
    const amp2 = 3.4
    const amp3 = 1.8

    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2
      const wob =
        Math.sin(a * 2.2 + 0.4) * amp1 +
        Math.sin(a * 5.6 + 1.7) * amp2 +
        Math.sin(a * 11.3 + 2.4) * amp3
      const rr = R + wob
      pts.push(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr))
    }

    // Build strip geometry (2 verts per point).
    const up = new THREE.Vector3(0, 1, 0)
    const hw = width * 0.5
    const pos = new Float32Array((segments + 1) * 2 * 3)

    const tmpT = new THREE.Vector3()
    const tmpN = new THREE.Vector3()

    for (let i = 0; i <= segments; i++) {
      const p = pts[i]
      const pPrev = pts[i === 0 ? segments - 1 : i - 1]
      const pNext = pts[i === segments ? 1 : i + 1]

      tmpT.copy(pNext).sub(pPrev).normalize()
      tmpN.copy(tmpT).cross(up).normalize() // points to the left

      const l = tmpN.clone().multiplyScalar(hw)
      const r = tmpN.clone().multiplyScalar(-hw)

      // Slightly above ground to avoid z-fighting / being buried by terrain.
      const y = 0.02

      // left
      let o = i * 2 * 3
      pos[o + 0] = p.x + l.x
      pos[o + 1] = y
      pos[o + 2] = p.z + l.z
      // right
      pos[o + 3] = p.x + r.x
      pos[o + 4] = y
      pos[o + 5] = p.z + r.z

      // Colliders along inner edge (block leaving map)
      if (i % 2 === 0) {
        // inner side is toward center => use "right" here because tmpN is left; choose inward by checking dot.
        // Approx inward vector is -p (towards origin).
        const inward = new THREE.Vector3(-p.x, 0, -p.z).normalize()
        const inwardOffset = inward.multiplyScalar(hw * 0.35)
        this._colliders.push({ x: p.x + inwardOffset.x, z: p.z + inwardOffset.z, r: hw * 0.55 })
      }
    }

    const idx = []
    for (let i = 0; i < segments; i++) {
      const a = i * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      // two tris
      idx.push(a, c, b, c, d, b)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      // Brighter water to read as a clear boundary.
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
    mesh.frustumCulled = false
    mesh.receiveShadow = false
    mesh.castShadow = false

    this._mesh = mesh
    this._group.add(mesh)
    this.scene.add(this._group)
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
    // subtle shimmer
    const s = 0.5 + 0.5 * Math.sin(this._t * 0.6)
    m.emissiveIntensity = 0.48 + s * 0.18
    m.opacity = 0.84 + s * 0.06
  }
}
