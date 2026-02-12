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
    this._coreW = 9 // Z span (flat face / portal area)

    // Overall mountain footprint (includes dressing): 4x the core width laterally.
    this._mountW = this._coreW * 4 // Z span total

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

    /** @type {THREE.CatmullRomCurve3|null} */
    this._curve = null

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

    // --- Interior: curved tunnel + supports + lamps ---
    const { tunnelMesh, curve } = this._makeTunnel()
    this._curve = curve
    this._mineGroup.add(tunnelMesh)
    this._makeSupportsAndLamps(curve)

    this.scene.add(this._worldGroup)
    this.scene.add(this._mineGroup)
    this.scene.add(this._lights)
    this.scene.add(this._amb)

    // Apply current visibility (interior hidden by default).
    this.setInteriorVisible(this._interiorVisible)

    // --- Collision ---
    this._buildWorldColliders()
    this._buildMineColliders(curve)

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
    // Spawn on alternating sides of the interior tunnel.
    const pts = []
    const c = this._curve
    if (!c) return pts

    const count = 10
    for (let i = 0; i < count; i++) {
      const t = 0.22 + (i / (count - 1)) * 0.68
      const p = c.getPoint(t)
      const tan = c.getTangent(t)
      const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
      const side = i % 2 === 0 ? 1 : -1
      const off = this._tunnelRadius * 0.62
      pts.push({ x: p.x + n.x * off * side, y: 1.05, z: p.z + n.z * off * side })
    }

    return pts
  }

  // ----------------- Exterior (world) -----------------

  _makeMountainMesh() {
    // Single mountain mesh: keep a perfectly flat front face for the portal,
    // and sculpt the rest to resemble the reference low-poly mountain silhouette.
    const w = this._mountW
    const coreW = this._coreW
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

      // Keep the portal/front face perfectly flat (local +X face) ONLY for the core width.
      if (v.x > halfD - 0.001 && Math.abs(v.z) <= (coreW * 0.5 + 0.4)) {
        pos.setXYZ(i, v.x, v.y, v.z)
        continue
      }

      // Normalize coords to [0..1]
      const ax = (v.x + halfD) / d // 0 back .. 1 front
      const nz = (v.z - peakZ) / (halfW || 1)
      const az = Math.min(1, Math.abs(nz))

      // Base mound profile: higher towards the back, taper towards front.
      const back = Math.pow(1 - ax, 0.55)
      // Side dressing falls to 0 at the edges (stronger taper to avoid a boxy silhouette).
      const center = Math.pow(1 - az, 2.4)

      // Heightfield (adds above the box's base height)
      const extra = (H * 0.95) * back * center

      // Carve to a rocky silhouette (ridges) without spikes.
      const ridge =
        0.18 * Math.sin((v.z + 8) * 0.55) * back * center +
        0.12 * Math.sin((v.x - 3) * 0.85) * center

      // Raise the top, keep bottom grounded.
      if (v.y > -halfH + 0.001) {
        const y01 = (v.y + halfH) / H
        v.y += extra * Math.pow(y01, 1.35) + ridge
      }

      // Slightly expand width towards the back/top (bulky mountain).
      const widen = 1 + 0.18 * back * center
      v.z *= widen

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
    const g = new THREE.Group()

    const dirtGeo = new THREE.CircleGeometry(5.2, 12)
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x1b1a16, roughness: 1.0 })
    const dirt = new THREE.Mesh(dirtGeo, dirtMat)
    dirt.rotation.x = -Math.PI / 2
    dirt.position.set(this.entrance.x + 1.4, 0.012, this.entrance.z)

    const stoneGeo = new THREE.DodecahedronGeometry(0.35, 0)
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 1.0 })
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(stoneGeo, stoneMat)
      s.position.set(this.entrance.x + 0.6 + Math.random() * 4.0, 0.18, this.entrance.z + (Math.random() - 0.5) * 5.4)
      s.scale.setScalar(0.7 + Math.random() * 1.2)
      s.rotation.set(Math.random(), Math.random(), Math.random())
      g.add(s)
    }

    // Camouflage rocks (remanso/cover) to make the entrance less obvious from a distance.
    const bigGeo = new THREE.DodecahedronGeometry(0.85, 0)
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(bigGeo, stoneMat)
      b.position.set(this.entrance.x - 0.8 + Math.random() * 2.2, 0.35, this.entrance.z + (Math.random() - 0.5) * 3.6)
      b.scale.setScalar(1.0 + Math.random() * 0.9)
      b.rotation.set(Math.random(), Math.random(), Math.random())
      g.add(b)
    }

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

    // Rectangular mountain collision: circles along the rectangle perimeter.
    // Keep a centered opening (portal) on the face towards the forest.
    const cx = this.center.x
    const cz = this.center.z

    const w = this._mountW
    const d = this._mountD

    const toForest = new THREE.Vector3(-cx, 0, -cz)
    if (toForest.lengthSq() < 1e-6) toForest.set(-1, 0, 0)
    toForest.normalize()
    const right = new THREE.Vector3(-toForest.z, 0, toForest.x)

    const add = (x, z, r) => this._worldColliders.push({ x, z, r })

    const halfD = d * 0.5
    const halfW = w * 0.5

    // Opening on forest-facing face (sd = +halfD): skip colliders near the center.
    const openHalf = (this._coreW * 0.5) + 0.2

    const edgeSamples = 18
    const cr = 1.25

    const sampleEdge = (sd0, sw0, sd1, sw1, isForestFace) => {
      for (let i = 0; i <= edgeSamples; i++) {
        const t = i / edgeSamples
        const sdv = sd0 + (sd1 - sd0) * t
        const swv = sw0 + (sw1 - sw0) * t

        if (isForestFace && Math.abs(swv) < openHalf && Math.abs(sdv - halfD) < 1e-6) continue

        add(cx + toForest.x * sdv + right.x * swv, cz + toForest.z * sdv + right.z * swv, cr)
      }
    }

    // Forest-facing edge
    sampleEdge(halfD, -halfW, halfD, halfW, true)
    // Back edge
    sampleEdge(-halfD, -halfW, -halfD, halfW, false)
    // Left edge
    sampleEdge(-halfD, -halfW, halfD, -halfW, false)
    // Right edge
    sampleEdge(-halfD, halfW, halfD, halfW, false)

    // Funnel near the portal
    add(this.entrance.x + right.x * 2.6, this.entrance.z + right.z * 2.6, 0.9)
    add(this.entrance.x - right.x * 2.6, this.entrance.z - right.z * 2.6, 0.9)

    // Fill to avoid corner squeezing
    add(cx, cz, 2.0)
  }

  // ----------------- Interior (mine) -----------------

  _makeTunnel() {
    // Curve with 2 noticeable bends, placed at mineOrigin.
    const o = this.mineOrigin

    const p0 = new THREE.Vector3(o.x + 1.0, 1.8, o.z)
    const p1 = new THREE.Vector3(o.x + 6.0, 1.9, o.z + 1.2)
    const p2 = new THREE.Vector3(o.x + 12.0, 2.0, o.z + 6.6)
    const p3 = new THREE.Vector3(o.x + 18.7, 2.1, o.z + 3.0)
    const p4 = new THREE.Vector3(o.x + 24.2, 2.15, o.z - 2.2)

    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4])
    curve.curveType = 'catmullrom'
    curve.tension = 0.35

    const tubularSegments = 70
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

    const mat = new THREE.MeshStandardMaterial({ color: 0x131318, roughness: 1.0, metalness: 0.0, side: THREE.BackSide })
    const tunnel = new THREE.Mesh(geo, mat)
    tunnel.name = 'MineTunnel'

    return { tunnelMesh: tunnel, curve }
  }

  _makeSupportsAndLamps(curve) {
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

    const steps = 6
    for (let i = 0; i < steps; i++) {
      const t = 0.18 + (i / (steps - 1)) * 0.76
      const p = curve.getPoint(t)
      const tan = curve.getTangent(t)
      const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize()

      const frame = new THREE.Group()
      frame.position.set(p.x, 0, p.z)

      const left = new THREE.Mesh(postGeo, woodMat)
      const right = new THREE.Mesh(postGeo, woodMat)
      left.position.set(n.x * (this._tunnelRadius - 0.55), 1.6, n.z * (this._tunnelRadius - 0.55))
      right.position.set(n.x * -(this._tunnelRadius - 0.55), 1.6, n.z * -(this._tunnelRadius - 0.55))

      const top = new THREE.Mesh(beamGeo, woodMat)
      top.position.set(0, 3.05, 0)
      top.rotation.y = Math.atan2(tan.x, tan.z)

      frame.add(left)
      frame.add(right)
      frame.add(top)
      this._mineGroup.add(frame)

      const lamp = new THREE.Mesh(lampGeo, lampMat)
      lamp.position.set(p.x + n.x * 1.1, 2.45, p.z + n.z * 1.1)
      this._mineGroup.add(lamp)

      const light = new THREE.PointLight(0xffb06a, 0.95, 16, 1.6)
      light.position.set(lamp.position.x, lamp.position.y, lamp.position.z)
      this._lights.add(light)
    }

    const end = curve.getPoint(0.98)
    const fill = new THREE.PointLight(0xffb88a, 0.55, 18, 1.4)
    fill.position.set(end.x, 2.6, end.z)
    this._lights.add(fill)
  }

  _buildMineColliders(curve) {
    this._mineColliders = []

    // Curved tunnel walls
    const samples = 18
    const wallR = 0.85
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const p = curve.getPoint(t)
      const tan = curve.getTangent(t)
      const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize()

      const off = this._tunnelRadius - 0.35
      this._mineColliders.push({ x: p.x + n.x * off, z: p.z + n.z * off, r: wallR })
      this._mineColliders.push({ x: p.x - n.x * off, z: p.z - n.z * off, r: wallR })
    }

    // End cap
    const end = curve.getPoint(1)
    this._mineColliders.push({ x: end.x, z: end.z, r: 2.0 })

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
