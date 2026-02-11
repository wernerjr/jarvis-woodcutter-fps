import * as THREE from 'three'
import { ItemId } from './items.js'

export class ForgeManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    this._forges = new Map()
    this._t = 0
    this._ray = new THREE.Raycaster()

    // Balance
    this.fuelSeconds = {
      [ItemId.LOG]: 22,
      [ItemId.STICK]: 6,
      [ItemId.LEAF]: 2,
    }

    this.secondsPerIngot = 10

    this._torchMain = 1.0
  }

  resetAll() {
    for (const f of this._forges.values()) f.mesh.removeFromParent()
    this._forges.clear()
  }

  setTorchMain(v) {
    this._torchMain = v
  }

  _makeForgeMesh() {
    const g = new THREE.Group()

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2f, roughness: 1.0, metalness: 0.0 })
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x3c3c46, roughness: 0.55, metalness: 0.35 })
    const emberMat = new THREE.MeshStandardMaterial({
      color: 0x2a160a,
      roughness: 1.0,
      emissive: 0xff6a22,
      emissiveIntensity: 0.0,
      transparent: true,
      opacity: 0.9,
    })

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.7, 10), stoneMat)
    base.position.y = 0.35

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.85, 10), stoneMat)
    body.position.y = 0.95

    // Rim/plate
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.14, 10), metalMat)
    rim.position.y = 1.45

    // Opening glow
    const ember = new THREE.Mesh(new THREE.CircleGeometry(0.55, 10), emberMat)
    ember.rotation.x = -Math.PI / 2
    ember.position.y = 1.42

    g.add(base)
    g.add(body)
    g.add(rim)
    g.add(ember)

    g.userData.ember = ember

    return g
  }

  /** @param {{x:number,z:number}} pos */
  place(pos) {
    const id = crypto.randomUUID?.() ?? String(Math.random()).slice(2)
    const mesh = this._makeForgeMesh()
    mesh.position.set(pos.x, 0, pos.z)
    mesh.userData.forgeId = id

    // Light: warm point (small)
    const light = new THREE.PointLight(0xffb06a, 0.0, 10, 1.7)
    light.position.set(0, 1.55, 0)
    mesh.add(light)

    this.scene.add(mesh)

    this._forges.set(id, {
      id,
      mesh,
      light,
      // inventories
      fuel: [null, null],
      input: [null, null],
      output: [null, null],
      burn: 0,
      prog: 0,
      enabled: false,
    })

    return id
  }

  /** @returns {{x:number,z:number,r:number}[]} */
  getColliders() {
    const out = []
    for (const f of this._forges.values()) {
      out.push({ x: f.mesh.position.x, z: f.mesh.position.z, r: 1.15 })
    }
    return out
  }

  getNearest(pos, radius) {
    let best = null
    let bestD = Infinity
    for (const f of this._forges.values()) {
      const dx = f.mesh.position.x - pos.x
      const dz = f.mesh.position.z - pos.z
      const d = Math.hypot(dx, dz)
      if (d <= radius && d < bestD) {
        bestD = d
        best = f
      }
    }
    return best
  }

  /** @param {THREE.Camera} camera */
  raycastFromCamera(camera) {
    const origin = new THREE.Vector3()
    const dir = new THREE.Vector3()
    camera.getWorldPosition(origin)
    camera.getWorldDirection(dir)

    this._ray.set(origin, dir)
    this._ray.far = 3.0

    const meshes = []
    for (const f of this._forges.values()) meshes.push(f.mesh)

    const hits = this._ray.intersectObjects(meshes, true)
    if (!hits.length) return null

    let obj = hits[0].object
    while (obj && !obj.userData.forgeId && obj.parent) obj = obj.parent
    const forgeId = obj?.userData?.forgeId
    if (!forgeId) return null

    return { forgeId: String(forgeId), point: hits[0].point, distance: hits[0].distance }
  }

  /** @param {string} id */
  get(id) {
    return this._forges.get(String(id))
  }

  /** @param {number} dt */
  update(dt) {
    if (dt <= 0) return
    this._t += dt

    for (const f of this._forges.values()) {
      // burn down (only while enabled)
      if (f.enabled && f.burn > 0) f.burn = Math.max(0, f.burn - dt)

      // if we have burn and input ore and output has room -> progress
      const hasOre = f.input.some((s) => s && s.id === ItemId.IRON_ORE && s.qty > 0)
      const outSpace = this._outputHasSpace(f)

      if (f.enabled && f.burn > 0 && hasOre && outSpace) {
        f.prog += dt
        if (f.prog >= this.secondsPerIngot) {
          f.prog = 0
          this._consumeOneOre(f)
          this._addOutput(f, ItemId.IRON_INGOT, 1)
        }
      }

      // auto-consume fuel only when enabled (so player must explicitly start)
      if (f.enabled && (f.burn <= 0.1 || (f.burn > 0 && f.burn < 2.5 && hasOre)) && this._hasFuelItem(f)) {
        // consume one unit at a time to keep UX predictable
        this._consumeOneFuel(f)
      }

      // visuals
      const ember = f.mesh.userData.ember
      const flick = 0.9 + 0.1 * Math.sin(this._t * 7.2) + 0.06 * Math.sin(this._t * 11.9)
      const heat01 = Math.min(1, (f.enabled ? f.burn : 0) / 12)
      const I = this._torchMain * 1.4 * heat01 * flick

      f.light.intensity = I
      f.light.distance = 10

      if (ember?.material) {
        ember.material.emissiveIntensity = 0.2 + 1.6 * heat01 * flick
        ember.material.opacity = 0.55 + 0.35 * heat01
      }
    }
  }

  _hasFuelItem(f) {
    return f.fuel.some((s) => s && (s.id === ItemId.LOG || s.id === ItemId.STICK || s.id === ItemId.LEAF) && s.qty > 0)
  }

  _consumeOneFuel(f) {
    for (let i = 0; i < f.fuel.length; i++) {
      const s = f.fuel[i]
      if (!s) continue
      const add = this.fuelSeconds[s.id] || 0
      if (add <= 0) continue

      s.qty -= 1
      if (s.qty <= 0) f.fuel[i] = null

      f.burn += add
      // cap so it doesn't grow unbounded
      f.burn = Math.min(f.burn, 90)
      return true
    }
    return false
  }

  _consumeOneOre(f) {
    for (let i = 0; i < f.input.length; i++) {
      const s = f.input[i]
      if (!s || s.id !== ItemId.IRON_ORE) continue
      s.qty -= 1
      if (s.qty <= 0) f.input[i] = null
      return true
    }
    return false
  }

  _outputHasSpace(f) {
    for (const s of f.output) {
      if (!s) return true
      if (s.id === ItemId.IRON_INGOT && s.qty < 100) return true
    }
    return false
  }

  _addOutput(f, id, qty) {
    // merge first
    for (let i = 0; i < f.output.length; i++) {
      const s = f.output[i]
      if (s && s.id === id) {
        const space = 100 - s.qty
        const take = Math.min(space, qty)
        s.qty += take
        qty -= take
        if (qty <= 0) return true
      }
    }

    for (let i = 0; i < f.output.length; i++) {
      if (!f.output[i]) {
        const take = Math.min(100, qty)
        f.output[i] = { id, qty: take }
        qty -= take
        if (qty <= 0) return true
      }
    }

    return qty <= 0
  }
}
