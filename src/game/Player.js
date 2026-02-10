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
    const { pivot, model } = this._makeAxe()
    this._axePivot = pivot
    this._axeModel = model
    this.camera.add(this._axePivot)

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
   */
  update(dt, colliders = []) {
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

    if (next.y <= this.eyeHeight) {
      next.y = this.eyeHeight
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

  _makeAxe() {
    // Pivot is placed near the robot "hand"; the model is offset so the grip sits at the pivot.
    const pivot = new THREE.Group()
    const model = new THREE.Group()

    // handle
    const handleGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.75, 8)
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x3e2a18, roughness: 1 })
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.rotation.z = 0.12

    // head + blade
    const headGeo = new THREE.BoxGeometry(0.18, 0.12, 0.08)
    const headMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.35, metalness: 0.8 })
    const head = new THREE.Mesh(headGeo, headMat)

    const bladeGeo = new THREE.BoxGeometry(0.06, 0.14, 0.24)
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcbd2d8, roughness: 0.25, metalness: 1.0 })
    const blade = new THREE.Mesh(bladeGeo, bladeMat)

    // Arrange along local Y then rotate model into camera-space.
    handle.position.set(0, 0.33, 0)
    head.position.set(0.08, 0.67, 0)
    blade.position.set(0.14, 0.67, 0)

    model.add(handle)
    model.add(head)
    model.add(blade)

    // Move model so the grip/base is at pivot origin.
    model.position.set(0.0, -0.12, -0.02)

    // Place pivot in view.
    pivot.position.set(0.22, -0.22, -0.38)
    pivot.rotation.set(-0.35, 0.10, -0.20)

    // Rotate model so it reads like an axe held forward.
    model.rotation.set(-0.35, 0.55, 0.10)

    pivot.add(model)
    return { pivot, model }
  }

  setTool(toolId) {
    // Show models based on tool.
    if (this._axePivot) this._axePivot.visible = toolId === 'axe'
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
    flame.position.set(0.30, -0.56, -0.50)
    flame.rotation.x = Math.PI
    flame.visible = false

    torch.add(stick)
    torch.add(head)
    torch.add(flame)
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
    // Iterate a couple times to handle multiple overlaps.
    for (let iter = 0; iter < 2; iter++) {
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
