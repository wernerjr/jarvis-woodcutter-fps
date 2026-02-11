import * as THREE from 'three'
import { ItemId } from './items.js'

function makeRadialTexture({ inner = 'rgba(255,140,40,1)', outer = 'rgba(255,140,40,0)', size = 128 } = {}) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 1
  tex.needsUpdate = true
  return tex
}

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

    // Shared lightweight textures for fire/smoke sprites.
    this._texFire = makeRadialTexture({ inner: 'rgba(255,180,80,1)', outer: 'rgba(255,120,20,0)', size: 128 })
    this._texSmoke = makeRadialTexture({ inner: 'rgba(140,140,160,0.55)', outer: 'rgba(20,20,25,0)', size: 128 })
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

    // Simple chimney
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 0.55, 8), metalMat)
    chim.position.set(-0.55, 1.75, -0.15)
    chim.rotation.z = 0.05

    // Fire sprite group (very low count)
    const fireGroup = new THREE.Group()
    fireGroup.position.set(0.0, 1.45, 0.0)

    const fireMat = new THREE.MeshBasicMaterial({
      map: this._texFire,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const firePlanes = []
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), fireMat.clone())
      m.position.set((Math.random() - 0.5) * 0.18, 0.05 + Math.random() * 0.10, (Math.random() - 0.5) * 0.18)
      m.rotation.y = (i / 3) * Math.PI * 0.9
      fireGroup.add(m)
      firePlanes.push(m)
    }

    // Smoke pool (planes) attached near chimney top
    const smokeGroup = new THREE.Group()
    smokeGroup.position.copy(chim.position).add(new THREE.Vector3(0, 0.35, 0))

    const smokeMat = new THREE.MeshBasicMaterial({
      map: this._texSmoke,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    })

    const smokePlanes = []
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), smokeMat.clone())
      m.visible = false
      smokeGroup.add(m)
      smokePlanes.push(m)
    }

    g.add(base)
    g.add(body)
    g.add(rim)
    g.add(ember)
    g.add(chim)
    g.add(fireGroup)
    g.add(smokeGroup)

    g.userData.ember = ember
    g.userData.firePlanes = firePlanes
    g.userData.smokePlanes = smokePlanes

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
      dirty: true,

      // VFX state
      vfx: {
        activeUntil: 0,
        smokeSpawnAcc: 0,
        smoke: (mesh.userData.smokePlanes || []).map(() => ({
          alive: false,
          age: 0,
          life: 1.6,
          vx: 0,
          vy: 0,
          vz: 0,
        })),
      },
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

  remove(id) {
    const f = this._forges.get(String(id))
    if (!f) return false
    f.mesh.removeFromParent()
    this._forges.delete(String(id))
    return true
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
          f.dirty = true
        }
      }

      // auto-consume fuel only when enabled (so player must explicitly start)
      if (f.enabled && (f.burn <= 0.1 || (f.burn > 0 && f.burn < 2.5 && hasOre)) && this._hasFuelItem(f)) {
        // consume one unit at a time to keep UX predictable
        if (this._consumeOneFuel(f)) f.dirty = true
      }

      // visuals + VFX
      const ember = f.mesh.userData.ember
      const firePlanes = f.mesh.userData.firePlanes || []
      const smokePlanes = f.mesh.userData.smokePlanes || []

      const flick = 0.9 + 0.1 * Math.sin(this._t * 7.2) + 0.06 * Math.sin(this._t * 11.9)
      const heat01 = Math.min(1, (f.enabled ? f.burn : 0) / 12)
      const I = this._torchMain * 1.4 * heat01 * flick

      f.light.intensity = I
      f.light.distance = 10

      if (ember?.material) {
        ember.material.emissiveIntensity = 0.2 + 1.6 * heat01 * flick
        ember.material.opacity = 0.55 + 0.35 * heat01
      }

      // Active only while processing is actually happening
      const isActive = f.enabled && f.burn > 0 && hasOre && outSpace
      if (isActive) f.vfx.activeUntil = this._t + 1.6

      const vfxOn = this._t < (f.vfx.activeUntil || 0)

      // Fire: few additive planes, billboard-ish
      for (let i = 0; i < firePlanes.length; i++) {
        const p = firePlanes[i]
        p.lookAt(0, p.position.y, 2)
        const wob = 0.85 + 0.25 * Math.sin(this._t * (6.5 + i))
        p.scale.set(1, wob, 1)
        p.material.opacity = vfxOn ? (0.55 + 0.25 * flick) * Math.min(1, f.burn / 6) : 0.0
      }

      // Smoke: pooled quads rising from chimney
      if (vfxOn) {
        f.vfx.smokeSpawnAcc += dt * 1.6 // ~1.6 puffs/sec
        while (f.vfx.smokeSpawnAcc >= 1) {
          f.vfx.smokeSpawnAcc -= 1
          // find dead
          let idx = -1
          for (let k = 0; k < f.vfx.smoke.length; k++) {
            if (!f.vfx.smoke[k].alive) {
              idx = k
              break
            }
          }
          if (idx < 0 || !smokePlanes[idx]) break

          const s = f.vfx.smoke[idx]
          const m = smokePlanes[idx]
          s.alive = true
          s.age = 0
          s.life = 1.4 + Math.random() * 0.8
          s.vx = (Math.random() - 0.5) * 0.18
          s.vy = 0.55 + Math.random() * 0.35
          s.vz = (Math.random() - 0.5) * 0.18

          m.visible = true
          m.position.set((Math.random() - 0.5) * 0.16, 0, (Math.random() - 0.5) * 0.16)
          m.rotation.y = Math.random() * Math.PI
          m.scale.setScalar(0.55 + Math.random() * 0.35)
          m.material.opacity = 0.22
        }
      }

      for (let i = 0; i < f.vfx.smoke.length; i++) {
        const s = f.vfx.smoke[i]
        const m = smokePlanes[i]
        if (!s.alive || !m) continue
        s.age += dt

        m.position.x += s.vx * dt
        m.position.y += s.vy * dt
        m.position.z += s.vz * dt

        // slow drift
        s.vx *= 0.98
        s.vz *= 0.98

        const p = Math.min(1, s.age / s.life)
        m.lookAt(0, m.position.y, 2)
        m.scale.setScalar((m.scale.x || 1) * (1.0 + dt * 0.15))
        m.material.opacity = (1 - p) * 0.22

        if (s.age >= s.life || m.material.opacity <= 0.01) {
          s.alive = false
          m.visible = false
          m.material.opacity = 0
          m.position.set(0, 0, 0)
        }
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
      f.dirty = true
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
      f.dirty = true
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
        f.dirty = true
        if (qty <= 0) return true
      }
    }

    for (let i = 0; i < f.output.length; i++) {
      if (!f.output[i]) {
        const take = Math.min(100, qty)
        f.output[i] = { id, qty: take }
        qty -= take
        f.dirty = true
        if (qty <= 0) return true
      }
    }

    return qty <= 0
  }
}
