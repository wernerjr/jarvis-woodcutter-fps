import * as THREE from 'three'

export class MineManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene

    // Exterior placement (world)
    // Rectangular mountain: big face points towards the forest (approx origin).
    this.center = new THREE.Vector3(58, 0, -18)

    // Rect mountain dimensions (must match _makeMountainMesh/_buildWorldColliders)
    // Core wall (flat portal face) dimensions:
    // - height reduced ~10% (from 7.8 -> 7.02)
    // - width reduced ~70% (from 30 -> 9)
    // NOTE: Werner wants the "rectangle" width to be 9, and the lateral dressing width to be 36.
    this._mountW = 9 // Z span (core flat face / portal area)
    this._detailW = 36 // Z span total (including lateral dressing)

    this._coreW = this._mountW // alias for readability

    this._mountD = 22 // X span (depth)
    this._mountH = 7.02

    // Entrance: centered on the face that looks towards the forest.
    // (Final values are computed in init() after we know face direction.)
    this.entrance = new THREE.Vector3(0, 0, 0)

    // Interior placement (kept far away; accessed via portal teleport)
    this.mineOrigin = new THREE.Vector3(-120, 0, 95)

    /** @type {{x:number,z:number,r:number}[]} */
    this._worldColliders = []
    /** @type {{x:number,z:number,r:number}[]} */
    this._mineColliders = []

    this._worldGroup = new THREE.Group()
    this._worldGroup.name = 'MineWorld'

    this._mineGroup = new THREE.Group()
    this._mineGroup.name = 'MineInterior'

    this._lights = new THREE.Group()
    this._lights.name = 'MineLights'

    this._amb = new THREE.AmbientLight(0x242432, 0.20)

    /** @type {THREE.CatmullRomCurve3[]} */
    this._curves = []

    this._tunnelRadius = 2.9

    // Portal triggers (XZ)
    this.portalEnter = { x: this.entrance.x - 0.6, z: this.entrance.z, r: 1.35 }
    this.portalExit = { x: this.mineOrigin.x + 1.4, z: this.mineOrigin.z, r: 1.35 }

    // Teleport targets
    this.spawnMine = new THREE.Vector3(this.mineOrigin.x + 2.2, 1.65, this.mineOrigin.z)
    this.spawnWorld = new THREE.Vector3(this.entrance.x - 2.6, 1.65, this.entrance.z)

    // Interior should be hidden by default (only visible when player is inside the mine).
    this._interiorVisible = false
  }

  /** @param {boolean} v */
  setInteriorVisible(v) {
    this._interiorVisible = !!v
    if (this._mineGroup) this._mineGroup.visible = this._interiorVisible
    if (this._lights) this._lights.visible = this._interiorVisible
    if (this._amb) this._amb.visible = this._interiorVisible
  }

  init() {
    // Clear previous
    this._worldGroup.removeFromParent()
    this._mineGroup.removeFromParent()
    this._lights.removeFromParent()

    this._worldGroup = new THREE.Group()
    this._worldGroup.name = 'MineWorld'

    this._mineGroup = new THREE.Group()
    this._mineGroup.name = 'MineInterior'

    this._lights = new THREE.Group()
    this._lights.name = 'MineLights'

    // Compute entrance point on the face that points to the forest (origin).
    const toForest = new THREE.Vector3(-this.center.x, 0, -this.center.z)
    if (toForest.lengthSq() < 1e-6) toForest.set(-1, 0, 0)
    toForest.normalize()
    const halfD = this._mountD * 0.5
    // Place entrance on the border of the block (slight epsilon outside to avoid z-fighting).
    this.entrance.set(
      this.center.x + toForest.x * (halfD + 0.02),
      0,
      this.center.z + toForest.z * (halfD + 0.02)
    )

    // --- Exterior: single carved mountain mesh with a flat face + portal (no trail) ---
    this._worldGroup.add(this._makeMountainMesh())
    this._worldGroup.add(this._makeEntrance())
    this._worldGroup.add(this._makeMouthGround())

    // --- Interior: bigger mine (descending) with multiple paths + supports + lamps ---
    const { tunnelMeshes, curves } = this._makeTunnels()
    this._curves = curves
    for (const m of tunnelMeshes) this._mineGroup.add(m)
    this._makeSupportsAndLamps(curves)

    this.scene.add(this._worldGroup)
    this.scene.add(this._mineGroup)
    this.scene.add(this._lights)
    this.scene.add(this._amb)

    // Apply current visibility (interior hidden by default).
    this.setInteriorVisible(this._interiorVisible)

    // --- Collision ---
    this._buildWorldColliders()
    this._buildMineColliders(curves)

    // Portal triggers updated (in case entrance moved)
    this.portalEnter = { x: this.entrance.x - 0.6, z: this.entrance.z, r: 1.35 }
    this.portalExit = { x: this.mineOrigin.x + 1.4, z: this.mineOrigin.z, r: 1.35 }
    this.spawnMine = new THREE.Vector3(this.mineOrigin.x + 2.2, 1.65, this.mineOrigin.z)
    this.spawnWorld = new THREE.Vector3(this.entrance.x - 2.6, 1.65, this.entrance.z)
  }

  /** @returns {{x:number,z:number,r:number}[]} */
  getWorldColliders() {
    return this._worldColliders
  }

  /** @returns {{x:number,z:number,r:number}[]} */
  getMineColliders() {
    return this._mineColliders
  }

  getOreSpawnPoints() {
    // Spawn as "veins" on the tunnel walls (needs position + inward normal).
    const pts = []
    const curves = this._curves
    if (!curves || !curves.length) return pts

    const up = new THREE.Vector3(0, 1, 0)

    const addFromCurve = (c, baseCount, t0, t1) => {
      for (let i = 0; i < baseCount; i++) {
        const t = t0 + (i / Math.max(1, baseCount - 1)) * (t1 - t0)
        const p = c.getPoint(t)
        const tan = c.getTangent(t)

        // Side vector (roughly horizontal) even when the tunnel descends.
        let sideVec = new THREE.Vector3().crossVectors(up, tan)
        if (sideVec.lengthSq() < 1e-6) sideVec.set(1, 0, 0)
        sideVec.normalize()

        const side = i % 2 === 0 ? 1 : -1
        const wallOut = sideVec.multiplyScalar(side)

        // Position at wall. Normal points inward (into tunnel).
        const off = this._tunnelRadius * 0.92
        const x = p.x + wallOut.x * off
        const z = p.z + wallOut.z * off
        const y = p.y + 0.4 + (i % 3) * 0.28

        pts.push({ x, y, z, nx: -wallOut.x, ny: 0, nz: -wallOut.z })
      }
    }

    // Main path + branches.
    addFromCurve(curves[0], 10, 0.12, 0.92)
    if (curves[1]) addFromCurve(curves[1], 6, 0.18, 0.9)
    if (curves[2]) addFromCurve(curves[2], 6, 0.18, 0.9)

    return pts
  }

  // ----------------- Exterior (world) -----------------

  _makeMountainMesh() {
    // Single mountain mesh: keep a perfectly flat front face for the portal,
    // and sculpt the rest to resemble the reference low-poly mountain silhouette.
    const w = this._detailW
    const coreW = this._mountW
    const d = this._mountD
    const H = this._mountH

    // Subdivided box so we can sculpt.
    const geo = new THREE.BoxGeometry(d, H, w, 16, 10, 20)
    const pos = geo.attributes.position
    const v = new THREE.Vector3()

    const halfD = d * 0.5
    const halfW = w * 0.5
    const halfH = H * 0.5

    // Peak biased a bit to one side for a more natural look.
    const peakZ = halfW * 0.18

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)

      const coreLimit = (coreW * 0.5 + 0.4)

      // Keep the portal/front face perfectly flat (local +X face) ONLY for the core width.
      if (v.x > halfD - 0.001 && Math.abs(v.z) <= coreLimit) {
        pos.setXYZ(i, v.x, v.y, v.z)
        continue
      }

      // If we are on the front face but outside the core, push it inward to avoid the giant rectangle look.
      if (v.x > halfD - 0.001 && Math.abs(v.z) > coreLimit) {
        const az2 = Math.min(1, (Math.abs(v.z) - coreLimit) / Math.max(0.001, (halfW - coreLimit)))
        const indent = 1.4 + az2 * 4.6
        v.x -= indent

        // Slight vertical shaping so the top edge isn't perfectly straight.
        const y01 = (v.y + halfH) / H
        v.y += (H * 0.35) * (1 - az2) * Math.pow(Math.max(0, y01), 1.2)
      }

      // Normalize coords to [0..1]
      const axRaw = (v.x + halfD) / d // 0 back .. 1 front
      const ax = Math.min(axRaw, 0.92) // keep some shape near the front
      const nz = (v.z - peakZ) / (halfW || 1)
      const az = Math.min(1, Math.abs(nz))

      // Base mound profile: higher towards the back, taper towards front.
      const back = Math.pow(1 - ax, 0.55)
      // Side dressing falls to 0 at the edges (stronger taper to avoid a boxy silhouette).
      const center = Math.pow(1 - az, 2.4)

      // Heightfield (adds above the box's base height)
      const extra = (H * 0.95) * back * center

      // Add irregularity (deterministic low-cost noise). Stronger towards the back.
      const n =
        Math.sin((v.z + 11.7) * 0.35 + (v.y + 2.0) * 0.22) * 0.55 +
        Math.sin((v.x - 5.3) * 0.48 - (v.z - 2.1) * 0.28) * 0.35 +
        Math.sin((v.x + v.z) * 0.18 + 1.2) * 0.25
      const noise01 = Math.max(-1, Math.min(1, n))

      // Carve to a rocky silhouette (ridges) without spikes.
      const ridge =
        0.18 * Math.sin((v.z + 8) * 0.55) * back * center +
        0.12 * Math.sin((v.x - 3) * 0.85) * center +
        0.22 * noise01 * back * center

      // Make the forest-facing side more organic too (except the flat core):
      // a tiny inward/outward wobble that fades away near the core.
      if (v.x > halfD - 0.6 && Math.abs(v.z) > coreLimit) {
        const az2 = Math.min(1, (Math.abs(v.z) - coreLimit) / Math.max(0.001, (halfW - coreLimit)))
        v.x += 0.25 * noise01 * az2
      }

      // Raise the top, keep bottom grounded.
      if (v.y > -halfH + 0.001) {
        const y01 = (v.y + halfH) / H
        // Noise fades near the base to keep the skirt clean.
        const nFade = Math.pow(Math.max(0, y01), 1.1)
        v.y += extra * Math.pow(y01, 1.35) + ridge * (0.65 + 0.35 * nFade)
      }

      // Slightly expand width towards the back/top (bulky mountain).
      const widen = 1 + 0.18 * back * center
      v.z *= widen

      // Make sides/back fall smoothly to the ground (avoid vertical wall look).
      // Add a "skirt" that flares out near the base.
      const y01b = Math.max(0, Math.min(1, (v.y + halfH) / H))
      const base = Math.pow(1 - y01b, 1.25)

      const edgeStart = halfW * 0.55
      const edgeSpan = Math.max(0.001, halfW - edgeStart)
      const edgeZ01 = Math.max(0, Math.min(1, (Math.abs(v.z) - edgeStart) / edgeSpan))

      const backStart = halfD * 0.25
      const backSpan = Math.max(0.001, halfD - backStart)
      const back01 = Math.max(0, Math.min(1, ((-v.x) - backStart) / backSpan))

      const skirt = 4.8 * base
      if (edgeZ01 > 0.001) v.z += Math.sign(v.z || 1) * skirt * edgeZ01
      if (back01 > 0.001) v.x -= skirt * 0.9 * back01

      pos.setXYZ(i, v.x, v.y, v.z)
    }

    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2b2a,
      roughness: 1.0,
      metalness: 0.0,
      flatShading: true,
    })

    const m = new THREE.Mesh(geo, mat)
    m.position.set(this.center.x, halfH, this.center.z)

    // Orient so the flat face is towards the forest.
    const toForest = new THREE.Vector3(-this.center.x, 0, -this.center.z)
    if (toForest.lengthSq() < 1e-6) toForest.set(-1, 0, 0)
    toForest.normalize()
    m.rotation.y = Math.atan2(-toForest.z, toForest.x)

    m.name = 'Mountain'
    return m
  }

  _makeEntrance() {
    // Simple portal module: 3 woods on the large face (towards forest).
    // Keep it centered on the face.
    const g = new THREE.Group()
    g.name = 'MineEntrance'

    const toForest = new THREE.Vector3(-this.center.x, 0, -this.center.z)
    if (toForest.lengthSq() < 1e-6) toForest.set(-1, 0, 0)
    toForest.normalize()

    // Align local +X (portal depth axis) towards the forest.
    const yaw = Math.atan2(-toForest.z, toForest.x)

    // Push portal outward from the face (towards the forest) so wood sits outside the rectangle.
    g.position.set(this.entrance.x + toForest.x * 0.65, 0, this.entrance.z + toForest.z * 0.65)
    g.rotation.y = yaw

    // Carved dark opening (visual depth)
    const mouthMat = new THREE.MeshStandardMaterial({
      color: 0x09090e,
      roughness: 1.0,
      emissive: 0x050509,
      emissiveIntensity: 0.35,
    })
    // Opening volume: thin in depth (X), wide across (Z), so it doesn't sit "inside" the block.
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.0, 4.6), mouthMat)
    // Slightly inside the wall so the entrance reads carved.
    mouth.position.set(-0.45, 2.05, 0)
    g.add(mouth)

    // 3 wood pieces portal
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1d, roughness: 1.0, metalness: 0.0 })
    const postGeo = new THREE.BoxGeometry(0.55, 4.6, 0.55)
    const beamGeo = new THREE.BoxGeometry(5.0, 0.6, 0.6)

    const left = new THREE.Mesh(postGeo, woodMat)
    const right = new THREE.Mesh(postGeo, woodMat)
    const top = new THREE.Mesh(beamGeo, woodMat)

    left.position.set(0.0, 2.3, 2.05)
    right.position.set(0.0, 2.3, -2.05)
    top.position.set(0.0, 4.65, 0)
    // Rotate 90deg so the beam spans between the two posts.
    top.rotation.y = Math.PI / 2

    // Infinite torches (always lit) on the front of each post to keep the entrance readable.
    const makeTorch = () => {
      const t = new THREE.Group()

      const stickGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.9, 8)
      const stickMat = new THREE.MeshStandardMaterial({ color: 0x3e2a18, roughness: 1.0 })
      const stick = new THREE.Mesh(stickGeo, stickMat)
      stick.position.set(0, 0.45, 0)

      const flameGeo = new THREE.ConeGeometry(0.14, 0.32, 10)
      const flameMat = new THREE.MeshStandardMaterial({
        color: 0xffb24a,
        emissive: 0xff6a00,
        emissiveIntensity: 1.6,
        transparent: true,
        opacity: 0.92,
      })
      const flame = new THREE.Mesh(flameGeo, flameMat)
      flame.position.set(0, 0.98, 0)

      const light = new THREE.PointLight(0xffb06a, 1.1, 16, 1.7)
      light.position.set(0, 1.05, 0)

      t.add(stick)
      t.add(flame)
      t.add(light)
      t.rotation.z = 0.08
      return t
    }

    const torchL = makeTorch()
    const torchR = makeTorch()

    // Portal local coords: +X points outward (towards forest), so place torches slightly in front.
    // Place torches halfway up the posts.
    torchL.position.set(0.45, 1.25, 2.05)
    torchR.position.set(0.45, 1.25, -2.05)

    g.add(left)
    g.add(right)
    g.add(top)
    g.add(torchL)
    g.add(torchR)

    return g
  }

  _makeMouthGround() {
    // Keep the entrance clean: no rocks in front of the portal.
    const g = new THREE.Group()

    const dirtGeo = new THREE.CircleGeometry(5.2, 12)
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x1b1a16, roughness: 1.0 })
    const dirt = new THREE.Mesh(dirtGeo, dirtMat)
    dirt.rotation.x = -Math.PI / 2
    dirt.position.set(this.entrance.x + 1.4, 0.012, this.entrance.z)

    g.add(dirt)
    return g
  }

  // Trail removed (no path leading to the mine in the new rectangular-mountain layout).
  _makeTrail() {
    const g = new THREE.Group()
    g.name = 'MudTrail'
    return g
  }

  _buildWorldColliders() {
    this._worldColliders = []

    // Rebuild collision after the final shape is defined.
    // Perimeter follows the same irregular "lines" as the mountain sculpt (and keeps the portal opening).
    const cx = this.center.x
    const cz = this.center.z

    const w = this._detailW
    const d = this._mountD

    const toForest = new THREE.Vector3(-cx, 0, -cz)
    if (toForest.lengthSq() < 1e-6) toForest.set(-1, 0, 0)
    toForest.normalize()
    const right = new THREE.Vector3(-toForest.z, 0, toForest.x)

    const halfD = d * 0.5
    const halfW = w * 0.5

    // Opening matches the flat core width.
    const openHalf = (this._coreW * 0.5) + 0.25

    // Two bands + midpoints to avoid diagonal leaks.
    const bandA = { off: 0.15, r: 1.35 }
    const bandB = { off: 1.15, r: 1.05 }

    const pushBandsWorld = (wx, wz, nwx, nwz) => {
      const len = Math.hypot(nwx, nwz) || 1
      const ox = nwx / len
      const oz = nwz / len
      this._worldColliders.push({ x: wx + ox * bandA.off, z: wz + oz * bandA.off, r: bandA.r })
      this._worldColliders.push({ x: wx + ox * bandB.off, z: wz + oz * bandB.off, r: bandB.r })
    }

    const noise = (t) => 0.35 * Math.sin(t * 7.1) + 0.22 * Math.sin(t * 13.7 + 1.3)

    // Compute a perimeter point in local (sd,sw) plus the local outward normal.
    const perimeterPoint = (edgeId, t) => {
      // base rectangle perimeter in (sd,sw)
      let sdv, swv, nx, nz
      if (edgeId === 0) {
        // forest face: sd=+halfD
        sdv = halfD
        swv = -halfW + (halfW * 2) * t
        nx = 1
        nz = 0
      } else if (edgeId === 1) {
        // back: sd=-halfD
        sdv = -halfD
        swv = -halfW + (halfW * 2) * t
        nx = -1
        nz = 0
      } else if (edgeId === 2) {
        // left: sw=-halfW
        sdv = -halfD + (halfD * 2) * t
        swv = -halfW
        nx = 0
        nz = -1
      } else {
        // right: sw=+halfW
        sdv = -halfD + (halfD * 2) * t
        swv = halfW
        nx = 0
        nz = 1
      }

      // Apply same style of irregularity used by the sculpt/collision earlier.
      const n = noise(edgeId + t)

      // Forest face: keep opening clean. Outside opening, also apply the same indentation used to break the rectangle.
      if (edgeId === 0) {
        const a = Math.abs(swv)
        if (a < openHalf) return null

        const az2 = Math.min(1, (a - openHalf) / Math.max(0.001, (halfW - openHalf)))
        const indent = 1.4 + az2 * 4.6
        sdv -= indent

        // small irregularity far from opening
        if (a > openHalf + 1.0) {
          sdv += nx * n * 0.35
          swv += nz * n * 0.35
        }
      } else {
        // Other edges can wobble a bit.
        sdv += nx * n
        swv += nz * n
      }

      return { sdv, swv, nx, nz }
    }

    const edgeSamples = 28
    for (let edgeId = 0; edgeId < 4; edgeId++) {
      for (let i = 0; i <= edgeSamples; i++) {
        const t = i / edgeSamples

        const p = perimeterPoint(edgeId, t)
        if (p) {
          const wx = cx + toForest.x * p.sdv + right.x * p.swv
          const wz = cz + toForest.z * p.sdv + right.z * p.swv
          const nwx = toForest.x * p.nx + right.x * p.nz
          const nwz = toForest.z * p.nx + right.z * p.nz
          pushBandsWorld(wx, wz, nwx, nwz)
        }

        // midpoint
        if (i < edgeSamples) {
          const t2 = (i + 0.5) / edgeSamples
          const p2 = perimeterPoint(edgeId, t2)
          if (p2) {
            const wx2 = cx + toForest.x * p2.sdv + right.x * p2.swv
            const wz2 = cz + toForest.z * p2.sdv + right.z * p2.swv
            const nwx2 = toForest.x * p2.nx + right.x * p2.nz
            const nwz2 = toForest.z * p2.nx + right.z * p2.nz
            pushBandsWorld(wx2, wz2, nwx2, nwz2)
          }
        }
      }
    }

    // Funnel near the portal (helps prevent clipping around opening edges)
    this._worldColliders.push({ x: this.entrance.x + right.x * 2.0, z: this.entrance.z + right.z * 2.0, r: 0.95 })
    this._worldColliders.push({ x: this.entrance.x - right.x * 2.0, z: this.entrance.z - right.z * 2.0, r: 0.95 })

    // Fill: prevents corner squeezing into interior.
    this._worldColliders.push({ x: cx, z: cz, r: 2.0 })
  }

  // ----------------- Interior (mine) -----------------

  _makeTunnels() {
    // Bigger mine: one main path descending + 2 branches.
    const o = this.mineOrigin

    const mkCurve = (pts) => {
      const c = new THREE.CatmullRomCurve3(pts)
      c.curveType = 'catmullrom'
      c.tension = 0.35
      return c
    }

    // Main: start near portal, then descend and snake.
    const main = mkCurve([
      new THREE.Vector3(o.x + 1.0, 1.8, o.z),
      new THREE.Vector3(o.x + 7.0, 1.4, o.z + 1.2),
      new THREE.Vector3(o.x + 14.0, 0.7, o.z + 6.8),
      new THREE.Vector3(o.x + 22.0, -0.9, o.z + 3.4),
      new THREE.Vector3(o.x + 30.0, -2.6, o.z - 3.2),
      new THREE.Vector3(o.x + 40.0, -4.8, o.z - 0.5),
      new THREE.Vector3(o.x + 52.0, -7.2, o.z + 5.6),
    ])

    // Branch A (mid): forks to one side.
    const a = mkCurve([
      new THREE.Vector3(o.x + 18.0, -0.6, o.z + 4.6),
      new THREE.Vector3(o.x + 24.0, -2.0, o.z + 10.0),
      new THREE.Vector3(o.x + 34.0, -3.8, o.z + 12.0),
      new THREE.Vector3(o.x + 44.0, -5.8, o.z + 8.8),
    ])

    // Branch B (late): forks to the other side.
    const b = mkCurve([
      new THREE.Vector3(o.x + 34.0, -3.6, o.z - 3.2),
      new THREE.Vector3(o.x + 42.0, -5.0, o.z - 9.0),
      new THREE.Vector3(o.x + 52.0, -6.6, o.z - 10.0),
      new THREE.Vector3(o.x + 62.0, -8.1, o.z - 5.2),
    ])

    const curves = [main, a, b]

    const mat = new THREE.MeshStandardMaterial({
      color: 0x131318,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.BackSide,
    })

    const makeTube = (curve, name) => {
      const tubularSegments = 110
      const radialSegments = 10
      const geo = new THREE.TubeGeometry(curve, tubularSegments, this._tunnelRadius, radialSegments, false)

      // Slight vertex noise to break perfect tube
      const pos = geo.attributes.position
      const v = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i)
        const n = Math.sin(v.x * 0.9 + v.z * 1.1) * 0.12 + Math.sin(v.x * 2.1 - v.z * 1.7) * 0.06
        v.y += n
        pos.setXYZ(i, v.x, v.y, v.z)
      }
      geo.computeVertexNormals()

      const tunnel = new THREE.Mesh(geo, mat)
      tunnel.name = name
      return tunnel
    }

    return {
      tunnelMeshes: [makeTube(main, 'MineTunnelMain'), makeTube(a, 'MineTunnelBranchA'), makeTube(b, 'MineTunnelBranchB')],
      curves,
    }
  }

  /** @param {THREE.CatmullRomCurve3[]} curves */
  _makeSupportsAndLamps(curves) {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1d, roughness: 1.0 })
    const postGeo = new THREE.BoxGeometry(0.35, 3.2, 0.35)
    const beamGeo = new THREE.BoxGeometry(this._tunnelRadius * 2.0 - 0.4, 0.32, 0.32)

    const lampGeo = new THREE.SphereGeometry(0.12, 8, 6)
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffd79a,
      emissive: 0xffa34a,
      emissiveIntensity: 1.2,
      roughness: 0.4,
    })

    const up = new THREE.Vector3(0, 1, 0)

    const placeOnCurve = (curve, steps, t0, t1, lightScale = 1.0) => {
      for (let i = 0; i < steps; i++) {
        const t = t0 + (i / Math.max(1, steps - 1)) * (t1 - t0)
        const p = curve.getPoint(t)
        const tan = curve.getTangent(t)

        let n = new THREE.Vector3().crossVectors(up, tan)
        if (n.lengthSq() < 1e-6) n.set(1, 0, 0)
        n.normalize()

        const frame = new THREE.Group()
        frame.position.set(p.x, 0, p.z)

        const left = new THREE.Mesh(postGeo, woodMat)
        const right = new THREE.Mesh(postGeo, woodMat)
        left.position.set(n.x * (this._tunnelRadius - 0.55), 1.6 + (p.y - 1.8) * 0.12, n.z * (this._tunnelRadius - 0.55))
        right.position.set(n.x * -(this._tunnelRadius - 0.55), 1.6 + (p.y - 1.8) * 0.12, n.z * -(this._tunnelRadius - 0.55))

        const top = new THREE.Mesh(beamGeo, woodMat)
        top.position.set(0, 3.05 + (p.y - 1.8) * 0.12, 0)
        top.rotation.y = Math.atan2(tan.x, tan.z)

        frame.add(left)
        frame.add(right)
        frame.add(top)
        this._mineGroup.add(frame)

        const lamp = new THREE.Mesh(lampGeo, lampMat)
        lamp.position.set(p.x + n.x * 1.1, p.y + 1.25, p.z + n.z * 1.1)
        this._mineGroup.add(lamp)

        const light = new THREE.PointLight(0xffb06a, 0.95 * lightScale, 16, 1.6)
        light.position.set(lamp.position.x, lamp.position.y, lamp.position.z)
        this._lights.add(light)
      }
    }

    // Main tunnel: more lights.
    placeOnCurve(curves[0], 10, 0.08, 0.96, 1.0)
    // Branches: fewer.
    if (curves[1]) placeOnCurve(curves[1], 5, 0.12, 0.92, 0.85)
    if (curves[2]) placeOnCurve(curves[2], 5, 0.12, 0.92, 0.85)

    // Fill at the end of the main path
    const end = curves[0].getPoint(0.98)
    const fill = new THREE.PointLight(0xffb88a, 0.55, 22, 1.4)
    fill.position.set(end.x, end.y + 1.8, end.z)
    this._lights.add(fill)
  }

  /** @param {THREE.CatmullRomCurve3[]} curves */
  _buildMineColliders(curves) {
    this._mineColliders = []

    const up = new THREE.Vector3(0, 1, 0)

    const addWalls = (curve, samples) => {
      const wallR = 0.85
      for (let i = 0; i <= samples; i++) {
        const t = i / samples
        const p = curve.getPoint(t)
        const tan = curve.getTangent(t)

        let n = new THREE.Vector3().crossVectors(up, tan)
        if (n.lengthSq() < 1e-6) n.set(1, 0, 0)
        n.normalize()

        const off = this._tunnelRadius - 0.35
        this._mineColliders.push({ x: p.x + n.x * off, z: p.z + n.z * off, r: wallR })
        this._mineColliders.push({ x: p.x - n.x * off, z: p.z - n.z * off, r: wallR })

        // Add midpoints to reduce diagonal clipping.
        if (i < samples) {
          const t2 = (i + 0.5) / samples
          const p2 = curve.getPoint(t2)
          const tan2 = curve.getTangent(t2)
          let n2 = new THREE.Vector3().crossVectors(up, tan2)
          if (n2.lengthSq() < 1e-6) n2.set(1, 0, 0)
          n2.normalize()
          this._mineColliders.push({ x: p2.x + n2.x * off, z: p2.z + n2.z * off, r: wallR })
          this._mineColliders.push({ x: p2.x - n2.x * off, z: p2.z - n2.z * off, r: wallR })
        }
      }
    }

    addWalls(curves[0], 26)
    if (curves[1]) addWalls(curves[1], 18)
    if (curves[2]) addWalls(curves[2], 18)

    // Caps to prevent walking off ends.
    const endMain = curves[0].getPoint(1)
    this._mineColliders.push({ x: endMain.x, z: endMain.z, r: 2.2 })
    if (curves[1]) {
      const endA = curves[1].getPoint(1)
      this._mineColliders.push({ x: endA.x, z: endA.z, r: 2.0 })
    }
    if (curves[2]) {
      const endB = curves[2].getPoint(1)
      this._mineColliders.push({ x: endB.x, z: endB.z, r: 2.0 })
    }

    // Entry "posts" inside mine (avoid clipping near portal)
    this._mineColliders.push({ x: this.mineOrigin.x + 1.0, z: this.mineOrigin.z + 2.4, r: 0.8 })
    this._mineColliders.push({ x: this.mineOrigin.x + 1.0, z: this.mineOrigin.z - 2.4, r: 0.8 })
  }

  _wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2
    while (a < -Math.PI) a += Math.PI * 2
    return a
  }
}
