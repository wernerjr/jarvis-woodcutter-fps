import * as THREE from 'three'

export class World {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    this._t = 0

    this._sun = new THREE.DirectionalLight(0xe8ffe8, 1.15)
    this._amb = new THREE.AmbientLight(0x587058, 0.45)

    this._ground = null
    this._sky = null
  }

  init() {
    // Lights
    this._sun.position.set(8, 14, 6)
    this._sun.castShadow = false
    this.scene.add(this._sun)
    this.scene.add(this._amb)

    // Simple sky dome
    const skyGeo = new THREE.SphereGeometry(160, 24, 16)
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x071207, side: THREE.BackSide })
    this._sky = new THREE.Mesh(skyGeo, skyMat)
    this.scene.add(this._sky)

    // Ground
    const gGeo = new THREE.PlaneGeometry(220, 220, 1, 1)
    const gMat = new THREE.MeshStandardMaterial({
      color: 0x143014,
      roughness: 1.0,
      metalness: 0.0,
    })
    this._ground = new THREE.Mesh(gGeo, gMat)
    this._ground.rotation.x = -Math.PI / 2
    this._ground.position.y = 0
    this.scene.add(this._ground)

    // Slight emissive "fireflies" points for depth
    const pts = new THREE.BufferGeometry()
    const count = 120
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 110
      pos[i * 3 + 1] = 0.6 + Math.random() * 5.5
      pos[i * 3 + 2] = (Math.random() - 0.5) * 110
    }
    pts.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pmat = new THREE.PointsMaterial({ color: 0xcfffcf, size: 0.05, transparent: true, opacity: 0.55 })
    const p = new THREE.Points(pts, pmat)
    this.scene.add(p)

    // Start camera height
    // (Player controls will keep it anchored.)
  }

  update(dt, { camera, player }) {
    this._t += dt

    // Subtle sun movement
    const a = this._t * 0.08
    this._sun.position.x = 10 * Math.cos(a)
    this._sun.position.z = 10 * Math.sin(a)

    // Keep sky centered on camera
    if (this._sky) this._sky.position.copy(camera.position)

    // Very simple "robot body" hint: a small HUD bob.
    player.setBobFactor(1.0)
  }
}
