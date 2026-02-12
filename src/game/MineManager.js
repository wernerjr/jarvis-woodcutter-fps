import * as THREE from 'three'

export class MineManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene

    // Exterior placement (world)
    this.center = new THREE.Vector3(58, 0, -18)
    // Entrance sits on the mountain rim (not inside the mound), slightly tucked away.
    this.entrance = new THREE.Vector3(38.0, 0, -28.0)

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

    // --- Exterior: mountain + entrance + trail ---
    this._worldGroup.add(this._makeMountainMesh())
    this._worldGroup.add(this._makeTrail())
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
    // New mountain: a compact low-poly mound (icosahedron) with vertex displacement.
    // Goal: keep silhouette readable and make the entrance feel embedded (not swallowed by a slope plane).
    const baseR = 26
    const geo = new THREE.IcosahedronGeometry(baseR, 2)

    const pos = geo.attributes.position
    const v = new THREE.Vector3()

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)

      // Keep a flatter base and a taller top.
      const y01 = Math.max(0, (v.y + baseR) / (2 * baseR))
      const top = Math.pow(y01, 1.35)

      // Cheap directional noise to break perfect sphere.
      const n =
        Math.sin(v.x * 0.12 + v.z * 0.10) * 0.9 +
        Math.sin(v.x * 0.28 - v.z * 0.22) * 0.5 +
        Math.sin(v.x * 0.55 + v.y * 0.25) * 0.25

      const scale = 0.86 + top * 0.55 + n * 0.05
      v.multiplyScalar(scale)

      // Push bottom down a bit to sit on ground.
      if (v.y < -baseR * 0.25) v.y = -baseR * 0.25

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
    m.position.set(this.center.x, baseR * 0.25, this.center.z)
    m.rotation.y = 0.35
    m.name = 'Mountain'

    return m
  }

  _makeEntrance() {
    // Entrance is built as a small cliff-face + tunnel module oriented to the mountain center.
    // This makes the entrance feel physically connected to the mountain.
    const g = new THREE.Group()
    g.name = 'MineEntrance'

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x242428, roughness: 1.0, metalness: 0.0, flatShading: true })
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1d, roughness: 1.0, metalness: 0.0 })
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x382114, roughness: 1.0, metalness: 0.0 })

    const ex = this.entrance.x
    const ez = this.entrance.z

    // Face points outwards from mountain center.
    const faceDir = new THREE.Vector3(ex - this.center.x, 0, ez - this.center.z)
    if (faceDir.lengthSq() < 1e-6) faceDir.set(1, 0, 0)
    faceDir.normalize()
    const yaw = Math.atan2(faceDir.x, faceDir.z)

    g.position.set(ex, 0, ez)
    g.rotation.y = yaw

    // Cliff-face block that blends into the mountain.
    const face = new THREE.Mesh(new THREE.BoxGeometry(7.5, 7.5, 4.2), rockMat)
    face.position.set(1.4, 3.2, 0)
    g.add(face)

    // Dark mouth (arched-ish) + inner tunnel.
    const mouthMat = new THREE.MeshStandardMaterial({
      color: 0x0b0b10,
      roughness: 1.0,
      emissive: 0x07070c,
      emissiveIntensity: 0.65,
    })
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(3.9, 3.5, 3.2), mouthMat)
    mouth.position.set(0.8, 1.85, 0)
    g.add(mouth)

    // Visible tunnel segment (inside the mountain)
    const tunnel = new THREE.Group()
    tunnel.position.set(0.8, 0, 0)
    g.add(tunnel)

    const innerGeo = new THREE.CylinderGeometry(1.7, 1.95, 7.2, 14, 1, true)
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x0c0c12,
      roughness: 1.0,
      side: THREE.BackSide,
      emissive: 0x06060a,
      emissiveIntensity: 0.35,
    })
    const inner = new THREE.Mesh(innerGeo, innerMat)
    inner.rotation.z = Math.PI / 2 // length along +X local
    inner.position.set(3.8, 1.85, 0)
    tunnel.add(inner)

    // Floor kept inside
    const floorGeo = new THREE.PlaneGeometry(5.6, 3.0, 1, 1)
    floorGeo.rotateX(-Math.PI / 2)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x16120f, roughness: 1.0 })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.position.set(3.9, 0.02, 0)
    tunnel.add(floor)

    // Timber frame just at the mouth (no weird protrusions)
    const postGeo = new THREE.BoxGeometry(0.46, 4.2, 0.46)
    const beamGeo = new THREE.BoxGeometry(4.6, 0.52, 0.52)

    const left = new THREE.Mesh(postGeo, woodMat)
    const right = new THREE.Mesh(postGeo, woodMat)
    left.position.set(-0.3, 2.1, 1.85)
    right.position.set(-0.3, 2.1, -1.85)
    const top = new THREE.Mesh(beamGeo, woodMat)
    top.position.set(-0.3, 4.05, 0)

    // Braces angled inward
    const braceGeo = new THREE.BoxGeometry(0.35, 2.6, 0.35)
    const b1 = new THREE.Mesh(braceGeo, darkWoodMat)
    const b2 = new THREE.Mesh(braceGeo, darkWoodMat)
    b1.position.set(0.15, 2.35, 1.1)
    b2.position.set(0.15, 2.35, -1.1)
    b1.rotation.z = Math.PI / 4
    b2.rotation.z = -Math.PI / 4

    g.add(left)
    g.add(right)
    g.add(top)
    g.add(b1)
    g.add(b2)

    // A couple of warm lamps inside for immersion
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffd0a0,
      emissive: 0xffa34a,
      emissiveIntensity: 1.2,
      roughness: 0.4,
    })
    const lampGeo = new THREE.SphereGeometry(0.12, 8, 6)

    const s1 = new THREE.Mesh(lampGeo, lampMat)
    s1.position.set(2.3, 2.15, 1.05)
    tunnel.add(s1)
    const l1 = new THREE.PointLight(0xffb06a, 0.65, 12, 1.7)
    l1.position.copy(s1.position)
    tunnel.add(l1)

    const s2 = new THREE.Mesh(lampGeo, lampMat)
    s2.position.set(3.2, 2.15, -1.05)
    tunnel.add(s2)
    const l2 = new THREE.PointLight(0xffb06a, 0.65, 12, 1.7)
    l2.position.copy(s2.position)
    tunnel.add(l2)

    // Soft fill deeper
    const glow = new THREE.PointLight(0xffb06a, 0.35, 16, 1.6)
    glow.position.set(6.5, 2.2, 0)
    tunnel.add(glow)

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

  _makeTrail() {
    // Path from the forest edge to the mine entrance.
    // Anti-intersection rule: any point inside the mountain safe radius is pushed outward.
    const start = new THREE.Vector3(28, 0, -6)
    // Bend around the mountain so the entrance feels more tucked away.
    const mid1 = new THREE.Vector3(36, 0, -14)
    const mid2 = new THREE.Vector3(34, 0, -24)
    const mid3 = new THREE.Vector3(36, 0, -34)
    const end = new THREE.Vector3(this.entrance.x - 0.4, 0, this.entrance.z)

    const raw = [start, mid1, mid2, mid3, end]
    const safeR = 19.2

    const adjusted = raw.map((p) => {
      const v = p.clone()
      const dx = v.x - this.center.x
      const dz = v.z - this.center.z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d < safeR) {
        const k = (safeR + 1.2) / Math.max(0.0001, d)
        v.x = this.center.x + dx * k
        v.z = this.center.z + dz * k
      }
      return v
    })

    const curve = new THREE.CatmullRomCurve3(adjusted)
    curve.tension = 0.48

    const samples = 68
    const width = 4.2

    const pts = []
    for (let i = 0; i <= samples; i++) {
      const p = curve.getPoint(i / samples)

      // second pass: ensure no sample point enters the mountain
      const dx = p.x - this.center.x
      const dz = p.z - this.center.z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d < safeR) {
        const k = (safeR + 0.9) / Math.max(0.0001, d)
        p.x = this.center.x + dx * k
        p.z = this.center.z + dz * k
      }

      pts.push(p)
    }

    // Build a strip (2 verts per point).
    const verts = []
    const uvs = []
    const indices = []

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]

      const prev = pts[Math.max(0, i - 1)]
      const next = pts[Math.min(pts.length - 1, i + 1)]
      const dir = next.clone().sub(prev)
      dir.y = 0
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0)
      dir.normalize()

      const n = new THREE.Vector3(-dir.z, 0, dir.x)
      const edge = width * 0.5
      const y = 0.011

      const l = p.clone().addScaledVector(n, edge)
      const r = p.clone().addScaledVector(n, -edge)

      verts.push(l.x, y, l.z)
      verts.push(r.x, y, r.z)

      const vv = i / (pts.length - 1)
      uvs.push(0, vv)
      uvs.push(1, vv)

      if (i < pts.length - 1) {
        const a = i * 2
        const b = i * 2 + 1
        const c = i * 2 + 2
        const d = i * 2 + 3
        indices.push(a, c, b)
        indices.push(c, d, b)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    // Vertex-color noise (cheap variation)
    const colors = new Float32Array((pts.length * 2) * 3)
    for (let i = 0; i < colors.length; i += 3) {
      const n = 0.72 + Math.random() * 0.28
      colors[i + 0] = 0.36 * n
      colors[i + 1] = 0.24 * n
      colors[i + 2] = 0.16 * n
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0 })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'MudTrail'

    const geo2 = geo.clone()
    const mat2 = new THREE.MeshStandardMaterial({ color: 0x2b1c12, roughness: 1.0, transparent: true, opacity: 0.22 })
    const overlay = new THREE.Mesh(geo2, mat2)
    overlay.position.y = 0.003
    overlay.scale.set(1.08, 1, 1.08)

    const g = new THREE.Group()
    g.add(mesh)
    g.add(overlay)
    return g
  }

  _buildWorldColliders() {
    this._worldColliders = []

    // Solid collision via multiple rings + interior "fill" points.
    // The entrance opening is small and aligned to the entrance direction.
    const cx = this.center.x
    const cz = this.center.z
    const entranceDir = Math.atan2(this.entrance.z - cz, this.entrance.x - cx)

    const addRing = (ringR, cR, n, openHalf) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const da = Math.abs(this._wrapAngle(a - entranceDir))
        if (da < openHalf) continue
        this._worldColliders.push({ x: cx + Math.cos(a) * ringR, z: cz + Math.sin(a) * ringR, r: cR })
      }
    }

    // Scaled to match the new mountain (icosahedron mound).
    addRing(22.5, 2.65, 36, 0.55)
    addRing(18.2, 2.45, 32, 0.50)
    addRing(14.2, 2.25, 28, 0.42)

    // Fill (prevent any gap between rings)
    const fill = [
      { x: cx + 5.0, z: cz + 5.0 },
      { x: cx + 6.5, z: cz - 4.0 },
      { x: cx - 4.5, z: cz + 6.0 },
      { x: cx - 5.5, z: cz - 5.5 },
      { x: cx + 0.0, z: cz + 7.0 },
      { x: cx + 0.0, z: cz - 7.0 },
    ]
    for (const p of fill) this._worldColliders.push({ x: p.x, z: p.z, r: 2.25 })

    // Entrance module: block the frame sides and guide into the portal.
    // Note: entrance faces outward from the mountain center.
    const dir = new THREE.Vector3(this.entrance.x - cx, 0, this.entrance.z - cz)
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0)
    dir.normalize()
    const right = new THREE.Vector3(-dir.z, 0, dir.x)

    // Side blockers near the mouth
    this._worldColliders.push({ x: this.entrance.x + right.x * 2.1, z: this.entrance.z + right.z * 2.1, r: 0.70 })
    this._worldColliders.push({ x: this.entrance.x - right.x * 2.1, z: this.entrance.z - right.z * 2.1, r: 0.70 })

    // Short corridor rails (helps funnel player into trigger)
    for (let k = 0; k < 5; k++) {
      const fwd = 0.8 + k * 0.9
      this._worldColliders.push({ x: this.entrance.x + dir.x * fwd + right.x * 3.0, z: this.entrance.z + dir.z * fwd + right.z * 3.0, r: 0.85 })
      this._worldColliders.push({ x: this.entrance.x + dir.x * fwd - right.x * 3.0, z: this.entrance.z + dir.z * fwd - right.z * 3.0, r: 0.85 })
    }
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
