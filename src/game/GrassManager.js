import * as THREE from 'three'

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class GrassManager {
  /** @param {{scene:THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene

    this.enabled = true

    this.chunkSize = 18
    this.viewDist = 62
    this.viewDist2 = this.viewDist * this.viewDist

    this._chunks = []

    // Density controls
    this.instancesPerChunk = 220

    // Palette (match ground/forest)
    this._colA = new THREE.Color(0x1f5a24)
    this._colB = new THREE.Color(0x2f8a36)
  }

  resetAll() {
    for (const c of this._chunks) c.group.removeFromParent()
    this._chunks = []
  }

  /** @param {{seed?:number, radius?:number}} opts */
  init({ seed = 777, radius = 90 } = {}) {
    this.resetAll()

    // Low-poly tuft: 2 crossed planes (billboard-ish), no texture.
    // Tuned smaller + thinner for clarity near player.
    const bladeGeo = new THREE.PlaneGeometry(0.15, 0.225, 1, 1)
    bladeGeo.translate(0, 0.1125, 0)

    const geo = new THREE.BufferGeometry()
    // merge two planes rotated 90deg
    const g1 = bladeGeo.clone()
    const g2 = bladeGeo.clone()
    g2.rotateY(Math.PI / 2)

    // merge manually
    const pos = []
    const uv = []
    const push = (g) => {
      const p = g.attributes.position.array
      const u = g.attributes.uv.array
      for (let i = 0; i < p.length; i++) pos.push(p[i])
      for (let i = 0; i < u.length; i++) uv.push(u[i])
    }
    push(g1)
    push(g2)

    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))

    // indices
    const idx = []
    const tri = (off) => {
      // PlaneGeometry has 2 triangles (0,2,1) (2,3,1) in its index, but we built non-indexed.
      // We'll just index sequential quads.
      idx.push(off + 0, off + 2, off + 1, off + 2, off + 3, off + 1)
    }
    tri(0)
    tri(4)
    geo.setIndex(idx)
    geo.computeVertexNormals()

    const mat = new THREE.MeshLambertMaterial({
      color: 0x2f8a36,
      side: THREE.DoubleSide,
    })

    const half = radius
    const minX = -half
    const maxX = half
    const minZ = -half
    const maxZ = half

    const chunkSize = this.chunkSize
    const nx = Math.ceil((maxX - minX) / chunkSize)
    const nz = Math.ceil((maxZ - minZ) / chunkSize)

    // Areas to keep clear (paths/buildings/resources): list of circles.
    const clear = [
      // spawn/start area
      { x: 0, z: 6, r: 9 },
      // around main forest center (keep sightlines)
      { x: 0, z: 0, r: 5 },
      // mine region (approx)
      { x: 58, z: -18, r: 18 },
      // trail corridor to mine (rough) — keep path readable
      { x: 36, z: -14, r: 7 },
      { x: 34, z: -24, r: 7 },
      { x: 36, z: -34, r: 7 },
    ]

    const isClear = (x, z) => {
      const r2 = x * x + z * z
      // River band: clear a ring around the perimeter where water lives.
      // (Keep it generous to avoid any grass tufts inside the river.)
      if (r2 > 86 * 86 && r2 < 104 * 104) return true

      for (const c of clear) {
        const dx = x - c.x
        const dz = z - c.z
        if (dx * dx + dz * dz < c.r * c.r) return true
      }
      return false
    }

    let s = seed >>> 0

    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x0 = minX + ix * chunkSize
        const z0 = minZ + iz * chunkSize
        const x1 = x0 + chunkSize
        const z1 = z0 + chunkSize

        // Skip chunks that are mostly in clear zones (fast check at center).
        const cx = (x0 + x1) * 0.5
        const cz = (z0 + z1) * 0.5
        if (isClear(cx, cz) && isClear(cx + 3, cz) && isClear(cx - 3, cz)) {
          continue
        }

        const rand = mulberry32((s += 0x9e3779b9) >>> 0)

        const inst = new THREE.InstancedMesh(geo, mat, this.instancesPerChunk)
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

        const col = new THREE.Color()
        inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.instancesPerChunk * 3), 3)

        const m = new THREE.Matrix4()
        const p = new THREE.Vector3()
        const q = new THREE.Quaternion()
        const sc = new THREE.Vector3()

        let placed = 0
        let tries = 0

        while (placed < this.instancesPerChunk && tries < this.instancesPerChunk * 4) {
          tries++
          const x = x0 + rand() * chunkSize
          const z = z0 + rand() * chunkSize

          // moderate density: random thinning
          if (rand() < 0.22) continue

          if (isClear(x, z)) continue

          // Keep grass away from far edges slightly (avoid hard cutoff)
          const edge = Math.min(x - minX, maxX - x, z - minZ, maxZ - z)
          if (edge < 5 && rand() < 0.65) continue

          p.set(x, 0.01, z)
          q.setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, 0))
          // ~1/4 size overall; thinner width than height.
          const h = 0.16 + rand() * 0.14
          const w = 0.10 + rand() * 0.05
          sc.set(w, h, w)

          m.compose(p, q, sc)
          inst.setMatrixAt(placed, m)

          // color variation
          col.copy(this._colA).lerp(this._colB, rand())
          inst.setColorAt(placed, col)

          placed++
        }

        inst.count = placed
        inst.castShadow = false
        inst.receiveShadow = false

        const group = new THREE.Group()
        group.position.set(0, 0, 0)
        group.add(inst)

        this.scene.add(group)

        this._chunks.push({ group, inst, cx, cz })
      }
    }
  }

  /** @param {number} dt @param {THREE.Vector3} camPos */
  update(dt, camPos) {
    if (!this.enabled) return
    if (!camPos) return

    // Distance-based culling per chunk.
    for (const c of this._chunks) {
      const dx = camPos.x - c.cx
      const dz = camPos.z - c.cz
      const d2 = dx * dx + dz * dz
      c.group.visible = d2 <= this.viewDist2
    }
  }
}
