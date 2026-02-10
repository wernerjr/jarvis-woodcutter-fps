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

    this.position = new THREE.Vector3(0, 1.65, 6)
    this.velocity = new THREE.Vector3()

    this.moveSpeed = 6.0
    this.lookSpeed = 0.002

    this._swingDuration = 0.42

    this._keys = new Set()
    this._locked = false

    this._bobT = 0
    this._bobFactor = 1

    // Simple "axe" in view (Jarvis the lumberjack robot)
    this._swingT = 0
    this._axe = this._makeAxe()
    this.camera.add(this._axe)

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
  }

  reset() {
    this.position.set(0, 1.65, 6)
    this.velocity.set(0, 0, 0)
    this.yaw.rotation.y = Math.PI
    this.pitch.rotation.x = 0
    this._swingT = 0
  }

  update(dt) {
    // Correct FPS convention: W forward, S backward.
    // (Three.js camera faces -Z; we map forward to -Z.)
    const forward = Number(this._keys.has('KeyS')) - Number(this._keys.has('KeyW'))
    const strafe = Number(this._keys.has('KeyD')) - Number(this._keys.has('KeyA'))

    const dir = new THREE.Vector3(strafe, 0, forward)
    if (dir.lengthSq() > 0) dir.normalize()

    // move in yaw space
    const yawMat = new THREE.Matrix4().makeRotationY(this.yaw.rotation.y)
    dir.applyMatrix4(yawMat)

    const speed = this.moveSpeed
    this.velocity.x = dir.x * speed
    this.velocity.z = dir.z * speed

    // integrate
    this.position.x += this.velocity.x * dt
    this.position.z += this.velocity.z * dt

    // keep on ground at fixed height
    this.position.y = 1.65

    // camera bob
    const moving = dir.lengthSq() > 0
    if (moving) this._bobT += dt * 10
    else this._bobT = 0

    const bob = moving ? Math.sin(this._bobT) * 0.03 * this._bobFactor : 0
    this.pitch.position.y = bob

    // swing animation (slower + easing, framerate independent)
    if (this._swingT > 0) this._swingT = Math.max(0, this._swingT - dt)

    const dur = this._swingDuration
    const p = this._swingT > 0 ? (1 - this._swingT / dur) : 0

    // easeInOutCubic
    const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    const swing = Math.sin(ease * Math.PI)

    this._axe.rotation.z = -0.45 - swing * 0.90
    this._axe.rotation.x = -0.25 + swing * 0.45

    this._applyTransforms()
  }

  _makeAxe() {
    const group = new THREE.Group()

    const handleGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.75, 8)
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x3e2a18, roughness: 1 })
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.position.set(0.25, -0.18, -0.55)
    handle.rotation.z = 0.15

    const headGeo = new THREE.BoxGeometry(0.18, 0.12, 0.08)
    const headMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.35, metalness: 0.8 })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(0.25, 0.12, -0.55)

    const bladeGeo = new THREE.BoxGeometry(0.06, 0.14, 0.24)
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcbd2d8, roughness: 0.25, metalness: 1.0 })
    const blade = new THREE.Mesh(bladeGeo, bladeMat)
    blade.position.set(0.33, 0.12, -0.55)

    group.add(handle)
    group.add(head)
    group.add(blade)

    // base pose
    group.position.set(0.15, -0.1, -0.05)
    group.rotation.set(-0.25, 0.25, -0.45)

    return group
  }

  _applyTransforms() {
    this.yaw.position.copy(this.position)
  }
}
