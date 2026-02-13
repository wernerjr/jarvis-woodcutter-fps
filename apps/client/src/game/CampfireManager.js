import * as THREE from 'three'

function makeCampfireMesh() {
  const g = new THREE.Group()

  const baseGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.08, 12)
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 1.0, metalness: 0.0 })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.y = 0.04

  const stickMat = new THREE.MeshStandardMaterial({ color: 0x3e2a18, roughness: 1.0 })
  for (let i = 0; i < 5; i++) {
    const sGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.55, 8)
    const s = new THREE.Mesh(sGeo, stickMat)
    s.position.set(0, 0.10, 0)
    s.rotation.set(Math.PI / 2, 0, (i / 5) * Math.PI)
    s.rotation.z += (i % 2) * 0.2
    g.add(s)
  }

  const emberGeo = new THREE.SphereGeometry(0.08, 10, 8)
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x1a0b06,
    emissive: 0xff5a1a,
    emissiveIntensity: 0.0,
    roughness: 1.0,
  })
  const ember = new THREE.Mesh(emberGeo, emberMat)
  ember.position.set(0, 0.12, 0)

  // Flame (bigger than torch) - only visible when lit
  const flameGeo = new THREE.ConeGeometry(0.16, 0.45, 12)
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xffb24a,
    emissive: 0xff6a00,
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.0,
  })
  const flame = new THREE.Mesh(flameGeo, flameMat)
  // Cone points up (+Y). Place so base sits near embers/logs.
  flame.position.set(0, 0.35, 0)

  g.add(base)
  g.add(ember)
  g.add(flame)

  g.userData.ember = ember
  g.userData.flame = flame
  return g
}

export class CampfireManager {
  _ray = new THREE.Raycaster()
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    /** @type {Map<string, {mesh:THREE.Group, light:THREE.PointLight, lit:boolean}>} */
    this._fires = new Map()
    this._idCounter = 1

    // Provided by Game each frame (so campfire can be ~3x torch brightness).
    this._torchMain = 1.0
  }

  /** @param {{x:number,y:number,z:number}} pos */
  place(pos, id = null) {
    const assigned = id ? String(id) : String(this._idCounter++)
    const mesh = makeCampfireMesh()
    mesh.position.set(pos.x, 0, pos.z)

    const light = new THREE.PointLight(0xffa24a, 0.0, 20, 1.15)
    light.position.set(0, 0.65, 0)
    mesh.add(light)

    this.scene.add(mesh)
    this._fires.set(assigned, { mesh, light, lit: false, ttl: 0 })
    mesh.userData.id = assigned

    return assigned
  }

  resetAll() {
    for (const { mesh } of this._fires.values()) mesh.removeFromParent()
    this._fires.clear()
    this._idCounter = 1
  }

  update(dt) {
    const t = performance.now() * 0.001
    for (const [id, f] of this._fires.entries()) {
      const ember = f.mesh.userData.ember
      const flame = f.mesh.userData.flame

      if (!f.lit) {
        f.light.intensity = 0
        if (ember?.material) ember.material.emissiveIntensity = 0
        if (flame?.material) {
          flame.material.opacity = 0
          flame.material.emissiveIntensity = 0.2
        }
        continue
      }

      // Lifetime countdown (3 min while lit)
      f.ttl = Math.max(0, (f.ttl ?? 0) - dt)

      // Fade in last 30s
      const fade = f.ttl <= 30 ? Math.max(0, f.ttl / 30) : 1

      // gentle flicker (campfire stays stronger than torch)
      const flick = 0.9 + 0.1 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 12.7)
      const I = this._torchMain * 3.6 * flick * fade

      f.light.intensity = I
      f.light.distance = 20

      if (ember?.material) ember.material.emissiveIntensity = (0.45 + 0.35 * flick) * fade
      if (flame?.material) {
        flame.material.opacity = (0.55 + 0.25 * flick) * fade
        flame.material.emissiveIntensity = (1.1 + 1.3 * flick) * fade
        flame.scale.set(1, (0.9 + 0.35 * flick) * (0.6 + 0.4 * fade), 1)
      }

      if (f.ttl <= 0) {
        // Remove fire cleanly
        f.mesh.removeFromParent()
        this._fires.delete(id)
      }
    }
  }

  /** @param {number} torchMain */
  setTorchMain(torchMain) {
    this._torchMain = torchMain
  }

  /** @param {{x:number,z:number}} p */
  getNearest(p, maxDist = 2.0) {
    let best = null
    let bestD2 = maxDist * maxDist
    for (const [id, f] of this._fires.entries()) {
      const dx = f.mesh.position.x - p.x
      const dz = f.mesh.position.z - p.z
      const d2 = dx * dx + dz * dz
      if (d2 <= bestD2) {
        bestD2 = d2
        best = { id, fire: f, dist: Math.sqrt(d2) }
      }
    }
    return best
  }

  setLit(id, lit) {
    const f = this._fires.get(String(id))
    if (!f) return false
    f.lit = !!lit
    if (f.lit) f.ttl = 180
    f.light.intensity = f.lit ? this._torchMain * 3.6 : 0.0
    const ember = f.mesh.userData.ember
    const flame = f.mesh.userData.flame
    if (ember?.material) ember.material.emissiveIntensity = f.lit ? 0.8 : 0.0
    if (flame?.material) flame.material.opacity = f.lit ? 0.7 : 0.0
    return true
  }

  isLit(id) {
    return !!this._fires.get(String(id))?.lit
  }

  /** @param {THREE.Camera} camera */
  raycastFromCamera(camera) {
    const origin = new THREE.Vector3()
    const dir = new THREE.Vector3()
    camera.getWorldPosition(origin)
    camera.getWorldDirection(dir)

    this._ray.set(origin, dir)
    this._ray.far = 3.0

    const roots = []
    for (const f of this._fires.values()) roots.push(f.mesh)

    const hits = this._ray.intersectObjects(roots, true)
    if (!hits.length) return null

    let obj = hits[0].object
    while (obj && !obj.userData.id && obj.parent) obj = obj.parent
    const campfireId = obj?.userData?.id
    if (!campfireId) return null

    return { campfireId: String(campfireId), point: hits[0].point, distance: hits[0].distance }
  }

  get(id) {
    return this._fires.get(String(id))
  }

  remove(id) {
    const f = this._fires.get(String(id))
    if (!f) return false
    f.mesh.removeFromParent()
    this._fires.delete(String(id))
    return true
  }
}

