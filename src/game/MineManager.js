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

    this._lights = new THREE.Group()
    this._lights.name = 'MineLights'

    this._amb = new THREE.AmbientLight(0x2a2a36, 0.22)

    /** @type {THREE.CatmullRomCurve3|null} */
    this._curve = null

    // Tunables
    this._tunnelRadius = 2.9
    this._tunnelLen = 26
  }

  init() {
    // Clear previous
    this._group.removeFromParent()
    this._lights.removeFromParent()
    this._group = new THREE.Group()
    this._group.name = 'Mine'
    this._lights = new THREE.Group()
    this._lights.name = 'MineLights'

    // --- Mountain (low-poly, deformed cone) ---
    const mount = this._makeMountainMesh()
    this._group.add(mount)

    // --- Entrance (classic timber frame) ---
    const entrance = this._makeEntrance()
    this._group.add(entrance)

    // --- Curved tunnel interior ---
    const { tunnelMesh, curve } = this._makeTunnel()
    this._curve = curve
    this._group.add(tunnelMesh)

    // Entrance cut / dirt patch
    const mouth = this._makeMouthGround()
    this._group.add(mouth)

    // Interior supports + lights
    this._makeSupportsAndLamps(curve)

    this.scene.add(this._group)
    this.scene.add(this._lights)
    this.scene.add(this._amb)

    // --- Collision (XZ circles) ---
    this._colliders = []

    // Mountain perimeter with opening at entrance
    this._addMountainRingColliders()

    // Timber frame collision (posts)
    this._colliders.push({ x: this.entrance.x + 0.4, z: this.entrance.z + 2.0, r: 0.55 })
    this._colliders.push({ x: this.entrance.x + 0.4, z: this.entrance.z - 2.0, r: 0.55 })

    // Curved tunnel walls (sample along curve)
    this._addTunnelWallColliders(curve)
  }

  /** @returns {{x:number,z:number,r:number}[]} */
  getColliders() {
    return this._colliders
  }

  getOreSpawnPoints() {
    // Spawn on alternating sides of the tunnel, deeper inside.
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

  // ----------------- build helpers -----------------

  _makeMountainMesh() {
    // Base cone, then vertex jitter for silhouette.
    const geo = new THREE.ConeGeometry(16, 14, 10, 4)

    const pos = geo.attributes.position
    const v = new THREE.Vector3()

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)

      // Convert cone local coords: y in [-7..7]
      const h01 = (v.y + 7) / 14
      const r = Math.sqrt(v.x * v.x + v.z * v.z)
      const r01 = Math.min(1, r / 16)

      // deterministic-ish noise from position
      const n = Math.sin(v.x * 0.55 + v.z * 0.62) * 0.5 + Math.sin(v.x * 1.2 - v.z * 0.9) * 0.5

      // bigger variation near mid/top, less at base
      const amp = (0.15 + 0.55 * h01) * (1 - 0.35 * r01)

      v.x += n * amp * 1.2
      v.z += Math.cos(v.x * 0.7 + v.z * 0.45) * amp * 0.9

      // add ridges (low poly feel)
      v.y += Math.sin((v.x + v.z) * 0.35) * amp * 0.9

      pos.setXYZ(i, v.x, v.y, v.z)
    }

    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2b2a,
      roughness: 1.0,
      metalness: 0.0,
    })

    const m = new THREE.Mesh(geo, mat)

    // Place: shift so base touches ground
    m.position.set(this.center.x, 7.0, this.center.z)
    m.scale.set(1.25, 1.0, 1.05)
    m.rotation.y = 0.35

    return m
  }

  _makeEntrance() {
    const g = new THREE.Group()
    g.name = 'MineEntrance'

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1d, roughness: 1.0, metalness: 0.0 })
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x382114, roughness: 1.0, metalness: 0.0 })

    // Posts
    const postGeo = new THREE.BoxGeometry(0.5, 4.2, 0.5)
    const beamGeo = new THREE.BoxGeometry(4.8, 0.55, 0.55)

    const left = new THREE.Mesh(postGeo, woodMat)
    const right = new THREE.Mesh(postGeo, woodMat)
    left.position.set(this.entrance.x, 2.1, this.entrance.z + 2.1)
    right.position.set(this.entrance.x, 2.1, this.entrance.z - 2.1)

    // Top beam
    const top = new THREE.Mesh(beamGeo, woodMat)
    top.position.set(this.entrance.x, 4.05, this.entrance.z)

    // Diagonal braces
    const braceGeo = new THREE.BoxGeometry(0.4, 3.0, 0.4)
    const b1 = new THREE.Mesh(braceGeo, darkWoodMat)
    const b2 = new THREE.Mesh(braceGeo, darkWoodMat)
    b1.position.set(this.entrance.x + 0.35, 2.45, this.entrance.z + 1.4)
    b2.position.set(this.entrance.x + 0.35, 2.45, this.entrance.z - 1.4)
    b1.rotation.z = Math.PI / 4
    b2.rotation.z = -Math.PI / 4

    // Planks above opening (detail)
    const plankGeo = new THREE.BoxGeometry(4.6, 0.18, 0.5)
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(plankGeo, darkWoodMat)
      p.position.set(this.entrance.x + 0.15, 3.4 + i * 0.28, this.entrance.z)
      p.rotation.y = 0.06 * (i - 1)
      g.add(p)
    }

    // Rock cut (mouth shadow)
    const holeGeo = new THREE.BoxGeometry(3.8, 3.3, 4.7)
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 1.0 })
    const hole = new THREE.Mesh(holeGeo, holeMat)
    hole.position.set(this.entrance.x + 0.9, 1.75, this.entrance.z)

    g.add(left)
    g.add(right)
    g.add(top)
    g.add(b1)
    g.add(b2)
    g.add(hole)

    return g
  }

  _makeTunnel() {
    // Curve with 2 noticeable bends.
    const p0 = new THREE.Vector3(this.entrance.x + 0.8, 1.8, this.entrance.z)
    const p1 = new THREE.Vector3(this.entrance.x + 6.0, 1.9, this.entrance.z + 1.0)
    const p2 = new THREE.Vector3(this.entrance.x + 12.0, 2.0, this.entrance.z + 6.0)
    const p3 = new THREE.Vector3(this.entrance.x + 18.5, 2.1, this.entrance.z + 2.5)
    const p4 = new THREE.Vector3(this.entrance.x + 24.0, 2.15, this.entrance.z - 2.0)

    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4])
    curve.curveType = 'catmullrom'
    curve.tension = 0.35

    const tubularSegments = 70
    const radialSegments = 10
    const geo = new THREE.TubeGeometry(curve, tubularSegments, this._tunnelRadius, radialSegments, false)

    // Slight vertex noise to break perfect tube (keep cheap)
    const pos = geo.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const n = Math.sin(v.x * 0.9 + v.z * 1.1) * 0.12 + Math.sin(v.x * 2.1 - v.z * 1.7) * 0.06
      v.y += n
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      color: 0x131318,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.BackSide,
    })

    const tunnel = new THREE.Mesh(geo, mat)
    tunnel.name = 'MineTunnel'

    return { tunnelMesh: tunnel, curve }
  }

  _makeMouthGround() {
    const g = new THREE.Group()

    const dirtGeo = new THREE.CircleGeometry(5.2, 12)
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x1b1a16, roughness: 1.0 })
    const dirt = new THREE.Mesh(dirtGeo, dirtMat)
    dirt.rotation.x = -Math.PI / 2
    dirt.position.set(this.entrance.x + 1.2, 0.012, this.entrance.z)

    // A few stones at the mouth
    const stoneGeo = new THREE.DodecahedronGeometry(0.35, 0)
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 1.0 })
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(stoneGeo, stoneMat)
      s.position.set(
        this.entrance.x + 0.4 + Math.random() * 4.0,
        0.18,
        this.entrance.z + (Math.random() - 0.5) * 5.4
      )
      s.scale.setScalar(0.7 + Math.random() * 1.2)
      s.rotation.set(Math.random(), Math.random(), Math.random())
      g.add(s)
    }

    g.add(dirt)
    return g
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

    // repeat every ~4.5m
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
      this._group.add(frame)

      // Lamp on one side
      const lamp = new THREE.Mesh(lampGeo, lampMat)
      lamp.position.set(p.x + n.x * 1.1, 2.45, p.z + n.z * 1.1)
      this._group.add(lamp)

      const light = new THREE.PointLight(0xffb06a, 0.95, 16, 1.6)
      light.position.set(lamp.position.x, lamp.position.y, lamp.position.z)
      this._lights.add(light)
    }

    // A deeper fill light to avoid harsh dark at the end
    const end = curve.getPoint(0.98)
    const fill = new THREE.PointLight(0xffb88a, 0.55, 18, 1.4)
    fill.position.set(end.x, 2.6, end.z)
    this._lights.add(fill)
  }

  _addMountainRingColliders() {
    const cx = this.center.x
    const cz = this.center.z
    const ringR = 13.5
    const cR = 2.2
    const n = 22

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      // Entrance faces west (pi). Keep a wider opening now.
      const da = Math.abs(this._wrapAngle(a - Math.PI))
      if (da < 0.52) continue
      this._colliders.push({ x: cx + Math.cos(a) * ringR, z: cz + Math.sin(a) * ringR, r: cR })
    }
  }

  _addTunnelWallColliders(curve) {
    const samples = 18
    const wallR = 0.85
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const p = curve.getPoint(t)
      const tan = curve.getTangent(t)
      const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize()

      const off = this._tunnelRadius - 0.35
      this._colliders.push({ x: p.x + n.x * off, z: p.z + n.z * off, r: wallR })
      this._colliders.push({ x: p.x - n.x * off, z: p.z - n.z * off, r: wallR })
    }

    // End cap
    const end = curve.getPoint(1)
    this._colliders.push({ x: end.x, z: end.z, r: 2.0 })
  }

  _wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2
    while (a < -Math.PI) a += Math.PI * 2
    return a
  }
}
