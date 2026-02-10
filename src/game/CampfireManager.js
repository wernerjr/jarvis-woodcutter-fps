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
  flame.position.set(0, 0.40, 0)
  flame.rotation.x = Math.PI

  g.add(base)
  g.add(ember)
  g.add(flame)

  g.userData.ember = ember
  g.userData.flame = flame
  return g
}

export class CampfireManager {
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
  place(pos) {
    const id = String(this._idCounter++)
    const mesh = makeCampfireMesh()
    mesh.position.set(pos.x, 0, pos.z)

    const light = new THREE.PointLight(0xffa24a, 0.0, 16, 1.2)
    light.position.set(0, 0.65, 0)
    mesh.add(light)

    this.scene.add(mesh)
    this._fires.set(id, { mesh, light, lit: false })
    mesh.userData.id = id

    return id
  }

  resetAll() {
    for (const { mesh } of this._fires.values()) mesh.removeFromParent()
    this._fires.clear()
    this._idCounter = 1
  }

  update(dt) {
    const t = performance.now() * 0.001
    for (const f of this._fires.values()) {
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

      // gentle flicker (reuse torch main scale to keep ~3x brightness)
      const flick = 0.9 + 0.1 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 12.7)
      const I = this._torchMain * 3.0 * flick

      f.light.intensity = I
      f.light.distance = 16

      if (ember?.material) ember.material.emissiveIntensity = 0.45 + 0.35 * flick
      if (flame?.material) {
        flame.material.opacity = 0.55 + 0.25 * flick
        flame.material.emissiveIntensity = 1.1 + 1.3 * flick
        flame.scale.set(1, 0.9 + 0.35 * flick, 1)
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
    f.light.intensity = f.lit ? this._torchMain * 3.0 : 0.0
    const ember = f.mesh.userData.ember
    const flame = f.mesh.userData.flame
    if (ember?.material) ember.material.emissiveIntensity = f.lit ? 0.8 : 0.0
    if (flame?.material) flame.material.opacity = f.lit ? 0.7 : 0.0
    return true
  }

  isLit(id) {
    return !!this._fires.get(String(id))?.lit
  }
}
