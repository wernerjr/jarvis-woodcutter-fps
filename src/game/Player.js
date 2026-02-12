import * as THREE from 'three'
import { clamp } from './util.js'

export class Player {
  /**
   * @param {{camera: THREE.PerspectiveCamera, domElement: HTMLElement}} params
   */
  constructor({ camera, domElement }) {
    this.camera = camera
    this.domElement = domElement

    this.yaw = new THREE.Object3D()
    this.pitch = new THREE.Object3D()
    this.yaw.add(this.pitch)
    this.pitch.add(this.camera)

    this.camera.position.set(0, 0, 0)

    this.eyeHeight = 1.65
    this.position = new THREE.Vector3(0, this.eyeHeight, 6)
    this.velocity = new THREE.Vector3()

    this.gravity = -18
    this.jumpSpeed = 6.4
    this._vy = 0
    this._onGround = true

    this.baseSpeed = 6.0
    this.sprintMultiplier = 1.65
    this.lookSpeed = 0.002

    this.isSprinting = false

    this._swingDuration = 0.42

    // Collision capsule approximation (XZ circle)
    this.radius = 0.35

    this._swingActive = false
    this._impactDone = false
    this._onImpact = null

    this._keys = new Set()
    this._locked = false

    this._bobT = 0
    this._bobFactor = 1

    // Simple "axe" in view (Jarvis the lumberjack robot)
    this._swingT = 0
    this._handT = 0
    this._torchT = 0
    // Tool models in view
    this._toolPivot = new THREE.Group()
    this._toolPivot.position.set(0.22, -0.22, -0.38)
    this._toolPivot.rotation.set(-0.35, 0.10, -0.20)
    this.camera.add(this._toolPivot)

    // Back-compat: swing animation code rotates _axePivot.
    this._axePivot = this._toolPivot

    this._toolModels = {
      axe_stone: this._makeStoneAxe(),
      axe_metal: this._makeMetalAxe(),
      pickaxe_stone: this._makeStonePickaxe(),
      pickaxe_metal: this._makeMetalPickaxe(),
    }

    for (const m of Object.values(this._toolModels)) {
      m.visible = false
      this._toolPivot.add(m)
    }

    this._hand = this._makeHand()
    this.camera.add(this._hand)
    this._hand.visible = false

    const { torch, flame } = this._makeTorch()
    this._torch = torch
    this._torchFlame = flame
    this._torchFlicker = 1
    this._torchHeat = 0
    this.camera.add(this._torch)
    this._torch.visible = false

    this._onKeyDown = (e) => this._keys.add(e.code)
    this._onKeyUp = (e) => this._keys.delete(e.code)
    this._onMouseMove = (e) => this._onMouseMoveAny(e)

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('mousemove', this._onMouseMove)

    // seed orientation
    this.yaw.rotation.y = Math.PI
    this.pitch.rotation.x = 0

    this._applyTransforms()
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('mousemove', this._onMouseMove)
  }

  setLocked(v) {
    this._locked = v
  }

  setBobFactor(v) {
    this._bobFactor = v
  }

  _onMouseMoveAny(e) {
    if (!this._locked) return

    this.yaw.rotation.y -= e.movementX * this.lookSpeed
    this.pitch.rotation.x -= e.movementY * this.lookSpeed
    this.pitch.rotation.x = clamp(this.pitch.rotation.x, -1.25, 1.25)
  }

  swing() {
    this._swingT = this._swingDuration
    this._swingActive = true
    this._impactDone = false
  }

  handAction() {
    this._handT = 0.16
  }

  torchAction() {
    this._torchT = 0.18
  }

  setTorchFlicker(f, heat01) {
    this._torchFlicker = f
    this._torchHeat = heat01

    // Flame visibility follows heat.
    if (this._torchFlame) this._torchFlame.visible = heat01 > 0.01
  }

  isSwinging() {
    return this._swingT > 0
  }

  getSwingDuration() {
    return this._swingDuration
  }

  reset() {
    this.position.set(0, this.eyeHeight, 6)
    this.velocity.set(0, 0, 0)
    this._vy = 0
    this._onGround = true
    this.yaw.rotation.y = Math.PI
    this.pitch.rotation.x = 0
    this._swingT = 0
    this._swingActive = false
    this._impactDone = false
  }

  jump() {
    if (!this._onGround) return
    this._vy = this.jumpSpeed
    this._onGround = false
  }

  /** @param {( )=>void} fn */
  onImpact(fn) {
    this._onImpact = fn
  }

  /**
   * @param {number} dt
   * @param {{x:number,z:number,r:number}[]} colliders
   * @param {(x:number,z:number)=>number} [groundYFn] world-space ground height (y) at XZ
   */
  update(dt, colliders = [], groundYFn = null) {
    // Correct FPS convention: W forward, S backward.
    // (Three.js camera faces -Z; we map forward to -Z.)
    const forward = Number(this._keys.has('KeyS')) - Number(this._keys.has('KeyW'))
    const strafe = Number(this._keys.has('KeyD')) - Number(this._keys.has('KeyA'))

    const dir = new THREE.Vector3(strafe, 0, forward)
    if (dir.lengthSq() > 0) dir.normalize()

    // move in yaw space
    const yawMat = new THREE.Matrix4().makeRotationY(this.yaw.rotation.y)
    dir.applyMatrix4(yawMat)

    const sprint = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight')
    this.isSprinting = sprint && dir.lengthSq() > 0

    const speed = this.baseSpeed * (this.isSprinting ? this.sprintMultiplier : 1.0)
    this.velocity.x = dir.x * speed
    this.velocity.z = dir.z * speed

    // integrate (XZ)
    const next = this.position.clone()
    next.x += this.velocity.x * dt
    next.z += this.velocity.z * dt
    next.y = this.position.y

    this._resolveCollisions(next, colliders)

    // vertical motion (jump + gravity)
    this._vy += this.gravity * dt
    next.y = this.position.y + this._vy * dt

    const groundY = typeof groundYFn === 'function' ? (groundYFn(next.x, next.z) || 0) : 0
    const floorY = groundY + this.eyeHeight

    if (next.y <= floorY) {
      next.y = floorY
      this._vy = 0
      this._onGround = true
    } else {
      this._onGround = false
    }

    // Apply final position.
    this.position.copy(next)

    // camera bob
    const moving = dir.lengthSq() > 0
    if (moving) this._bobT += dt * 10
    else this._bobT = 0

    const bob = moving ? Math.sin(this._bobT) * 0.03 * this._bobFactor : 0
    const jumpBob = this._onGround ? 0 : -0.03
    this.pitch.position.y = bob + jumpBob

    // swing animation (slower + easing, framerate independent)
    if (this._swingT > 0) this._swingT = Math.max(0, this._swingT - dt)

    const dur = this._swingDuration
    const p = this._swingT > 0 ? (1 - this._swingT / dur) : 0

    // Impact window: call once around the peak.
    if (this._swingActive) {
      const impactP = 0.58
      if (!this._impactDone && p >= impactP) {
        this._impactDone = true
        this._onImpact?.()
      }
      if (p >= 1) this._swingActive = false
    }

    // easeInOutCubic
    const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    const swing = Math.sin(ease * Math.PI)

    // Rotate around a plausible hand/grip pivot.
    this._axePivot.rotation.z = -0.20 - swing * 0.95
    this._axePivot.rotation.x = -0.35 + swing * 0.55
    this._axePivot.rotation.y = 0.10 + swing * 0.10

    // Hand action animation
    if (this._handT > 0) this._handT = Math.max(0, this._handT - dt)
    const hp = this._handT > 0 ? 1 - this._handT / 0.16 : 0
    const hSwing = hp > 0 ? Math.sin(hp * Math.PI) : 0
    if (this._hand) {
      this._hand.position.z = -0.42 - hSwing * 0.06
      this._hand.rotation.x = -0.05 - hSwing * 0.30
    }

    // Torch action (small bob) + flame flicker
    if (this._torchT > 0) this._torchT = Math.max(0, this._torchT - dt)
    const tp = this._torchT > 0 ? 1 - this._torchT / 0.18 : 0
    const tBob = tp > 0 ? Math.sin(tp * Math.PI) : 0
    if (this._torch) {
      this._torch.position.y = 0 + tBob * 0.02
      this._torch.rotation.z = 0.05 - tBob * 0.15
    }

    if (this._torchFlame) {
      const f = this._torchFlicker || 1
      const heat = this._torchHeat || 0
      const s = 0.85 + 0.35 * (f - 0.9) + heat * 0.25
      this._torchFlame.scale.set(1, 1.1 + (s - 0.85), 1)
      this._torchFlame.material.opacity = 0.55 + heat * 0.35
      this._torchFlame.material.emissiveIntensity = 0.9 + heat * 1.8 + (f - 0.9) * 2.2
    }

    this._applyTransforms()
  }

  _makeStoneAxe() {
    const model = new THREE.Group()

    const handleGeo = new THREE.CylinderGeometry(0.03, 0.045, 0.78, 8)
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x3e2a18, roughness: 1.0 })
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.rotation.z = 0.12
    handle.position.set(0, 0.34, 0)

    // Stone head: chunky + matte
    const headGeo = new THREE.BoxGeometry(0.22, 0.14, 0.10)
    const headMat = new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 1.0, metalness: 0.0 })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(0.10, 0.68, 0)

    const lashGeo = new THREE.BoxGeometry(0.10, 0.06, 0.16)
    const lashMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1.0 })
    const lash = new THREE.Mesh(lashGeo, lashMat)
    lash.position.set(0.02, 0.66, 0)

    // Edge: a slightly different stone tint
    const edgeGeo = new THREE.BoxGeometry(0.06, 0.12, 0.26)
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.95, metalness: 0.0 })
    const edge = new THREE.Mesh(edgeGeo, edgeMat)
    edge.position.set(0.16, 0.68, 0)

    model.add(handle)
    model.add(head)
    model.add(edge)
    model.add(lash)

    // FX anchor at blade edge
    const fxAnchor = new THREE.Object3D()
    fxAnchor.name = 'fxAnchor'
    fxAnchor.position.set(0.22, 0.68, 0)
    model.add(fxAnchor)
    model.userData.fxAnchor = fxAnchor

    model.position.set(0.0, -0.12, -0.02)
    model.rotation.set(-0.35, 0.55, 0.10)
    return model
  }

  _makeMetalAxe() {
    const model = new THREE.Group()

    const handleGeo = new THREE.CylinderGeometry(0.028, 0.042, 0.80, 8)
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 1.0 })
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.rotation.z = 0.10
    handle.position.set(0, 0.34, 0)

    // Metal head: slimmer + shinier
    const headGeo = new THREE.BoxGeometry(0.20, 0.11, 0.07)
    const headMat = new THREE.MeshStandardMaterial({ color: 0xbfc7cf, roughness: 0.25, metalness: 1.0 })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(0.10, 0.68, 0)

    const bladeGeo = new THREE.BoxGeometry(0.05, 0.14, 0.30)
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe3e8ee, roughness: 0.18, metalness: 1.0 })
    const blade = new THREE.Mesh(bladeGeo, bladeMat)
    blade.position.set(0.16, 0.68, 0)

    const spikeGeo = new THREE.BoxGeometry(0.04, 0.08, 0.16)
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xcdd5dd, roughness: 0.22, metalness: 1.0 })
    const spike = new THREE.Mesh(spikeGeo, spikeMat)
    spike.position.set(0.05, 0.68, 0.13)

    model.add(handle)
    model.add(head)
    model.add(blade)
    model.add(spike)

    // FX anchor at blade edge
    const fxAnchor = new THREE.Object3D()
    fxAnchor.name = 'fxAnchor'
    fxAnchor.position.set(0.22, 0.68, 0)
    model.add(fxAnchor)
    model.userData.fxAnchor = fxAnchor

    model.position.set(0.0, -0.12, -0.02)
    model.rotation.set(-0.35, 0.55, 0.10)
    return model
  }

  _makeStonePickaxe() {
    const model = new THREE.Group()

    const handleGeo = new THREE.CylinderGeometry(0.03, 0.045, 0.86, 8)
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x3e2a18, roughness: 1.0 })
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.position.set(0, 0.34, 0)
    handle.rotation.z = 0.08

    const headGeo = new THREE.BoxGeometry(0.52, 0.10, 0.10)
    const headMat = new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 1.0, metalness: 0.0 })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(0.05, 0.68, 0)

    const tipGeo = new THREE.BoxGeometry(0.16, 0.08, 0.18)
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.95, metalness: 0.0 })
    const tipL = new THREE.Mesh(tipGeo, tipMat)
    const tipR = new THREE.Mesh(tipGeo, tipMat)
    tipL.position.set(-0.22, 0.68, 0)
    tipR.position.set(0.32, 0.68, 0)
    tipL.rotation.y = 0.55
    tipR.rotation.y = -0.55

    model.add(handle)
    model.add(head)
    model.add(tipL)
    model.add(tipR)

    // FX anchor at right tip
    const fxAnchor = new THREE.Object3D()
    fxAnchor.name = 'fxAnchor'
    fxAnchor.position.set(0.40, 0.68, 0)
    model.add(fxAnchor)
    model.userData.fxAnchor = fxAnchor

    model.position.set(0.0, -0.12, -0.02)
    model.rotation.set(-0.28, 0.40, 0.12)
    return model
  }

  _makeMetalPickaxe() {
    const model = new THREE.Group()

    const handleGeo = new THREE.CylinderGeometry(0.028, 0.042, 0.88, 8)
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 1.0 })
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.position.set(0, 0.34, 0)
    handle.rotation.z = 0.06

    const headGeo = new THREE.BoxGeometry(0.56, 0.08, 0.08)
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd7dee6, roughness: 0.22, metalness: 1.0 })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(0.05, 0.69, 0)

    const tipGeo = new THREE.BoxGeometry(0.18, 0.06, 0.20)
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xf0f4f8, roughness: 0.16, metalness: 1.0 })
    const tipL = new THREE.Mesh(tipGeo, tipMat)
    const tipR = new THREE.Mesh(tipGeo, tipMat)
    tipL.position.set(-0.24, 0.69, 0)
    tipR.position.set(0.34, 0.69, 0)
    tipL.rotation.y = 0.62
    tipR.rotation.y = -0.62

    model.add(handle)
    model.add(head)
    model.add(tipL)
    model.add(tipR)

    // FX anchor at right tip
    const fxAnchor = new THREE.Object3D()
    fxAnchor.name = 'fxAnchor'
    fxAnchor.position.set(0.42, 0.69, 0)
    model.add(fxAnchor)
    model.userData.fxAnchor = fxAnchor

    model.position.set(0.0, -0.12, -0.02)
    model.rotation.set(-0.28, 0.40, 0.12)
    return model
  }

  setTool(toolId, toolItemId = null) {
    // Show models based on tool.
    if (this._toolPivot) this._toolPivot.visible = toolId === 'axe' || toolId === 'pickaxe'

    for (const [id, m] of Object.entries(this._toolModels || {})) {
      m.visible = !!toolItemId && id === toolItemId
    }

    if (this._hand) this._hand.visible = toolId === 'hand'
    if (this._torch) this._torch.visible = toolId === 'torch'
    if (this._torchFlame) this._torchFlame.visible = toolId === 'torch'
  }

  _makeTorch() {
    const torch = new THREE.Group()

    const stickGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.55, 8)
    const stickMat = new THREE.MeshStandardMaterial({ color: 0x3e2a18, roughness: 1 })
    const stick = new THREE.Mesh(stickGeo, stickMat)
    stick.position.set(0.28, -0.22, -0.42)
    stick.rotation.z = 0.12

    const headGeo = new THREE.SphereGeometry(0.07, 10, 8)
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a10,
      roughness: 1.0,
      metalness: 0.0,
      emissive: 0xff7a18,
      emissiveIntensity: 0.6,
    })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(0.30, -0.45, -0.50)

    // FX anchor (same pattern as tools): attach to the torch stick tip.
    const fxAnchor = new THREE.Object3D()
    fxAnchor.name = 'fxAnchor'
    // stick is centered; top is +len/2 (=0.275)
    fxAnchor.position.set(0, 0.275, 0)
    stick.add(fxAnchor)

    // Flame (simple emissive cone) animated in update()
    const flameGeo = new THREE.ConeGeometry(0.07, 0.18, 10)
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xffb24a,
      emissive: 0xff6a00,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.95,
    })
    const flame = new THREE.Mesh(flameGeo, flameMat)
    // Cone points up (+Y). The cone is centered; lift it so its base starts at the anchor.
    flame.position.set(0, 0.09, 0)
    flame.visible = false
    fxAnchor.add(flame)

    torch.add(stick)
    torch.add(head)
    torch.rotation.set(-0.15, 0.25, 0.05)

    return { torch, flame }
  }

  _makeHand() {
    const g = new THREE.Group()
    const palmGeo = new THREE.BoxGeometry(0.12, 0.10, 0.18)
    const palmMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.55, metalness: 0.25 })
    const palm = new THREE.Mesh(palmGeo, palmMat)
    palm.position.set(0.28, -0.26, -0.42)

    const fingerGeo = new THREE.BoxGeometry(0.10, 0.05, 0.12)
    const fingerMat = new THREE.MeshStandardMaterial({ color: 0xcbd2d8, roughness: 0.5, metalness: 0.35 })
    const fingers = new THREE.Mesh(fingerGeo, fingerMat)
    fingers.position.set(0.32, -0.30, -0.50)

    g.add(palm)
    g.add(fingers)
    g.rotation.set(-0.05, 0.35, 0.05)
    return g
  }

  _resolveCollisions(nextPos, colliders) {
    // Simple stable circle-vs-circle push-out in XZ.
    // Iterate a few times to handle multiple overlaps (prevents "diagonal squeezing" through dense collider fields).
    for (let iter = 0; iter < 6; iter++) {
      let any = false
      for (const c of colliders) {
        const dx = nextPos.x - c.x
        const dz = nextPos.z - c.z
        const rr = this.radius + c.r
        const d2 = dx * dx + dz * dz
        if (d2 >= rr * rr || d2 === 0) continue

        const d = Math.sqrt(d2)
        const pen = rr - d
        const nx = dx / d
        const nz = dz / d

        nextPos.x += nx * pen
        nextPos.z += nz * pen
        any = true
      }
      if (!any) break
    }
  }

  _applyTransforms() {
    this.yaw.position.copy(this.position)
  }
}
