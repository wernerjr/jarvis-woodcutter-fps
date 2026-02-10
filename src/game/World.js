import * as THREE from 'three'

export class World {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    this._t = 0

    this._sun = new THREE.DirectionalLight(0xfff1d6, 1.15)
    this._moon = new THREE.DirectionalLight(0x9bbcff, 0.35)
    this._amb = new THREE.AmbientLight(0x587058, 0.45)

    this._ground = null
    this._sky = null
    this._stars = null
    this._sunMesh = null
    this._moonMesh = null
  }

  init() {
    // Lights
    this._sun.position.set(8, 14, 6)
    this._sun.castShadow = false
    this.scene.add(this._sun)

    this._moon.position.set(-8, 10, -6)
    this._moon.castShadow = false
    this.scene.add(this._moon)

    this.scene.add(this._amb)

    // Simple sky dome
    const skyGeo = new THREE.SphereGeometry(160, 24, 16)
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x1a2a44, side: THREE.BackSide })
    this._sky = new THREE.Mesh(skyGeo, skyMat)
    this.scene.add(this._sky)

    // Sun/Moon visible discs
    const sunGeo = new THREE.SphereGeometry(2.6, 16, 12)
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff0b3, transparent: true, opacity: 1.0 })
    this._sunMesh = new THREE.Mesh(sunGeo, sunMat)
    this.scene.add(this._sunMesh)

    const moonGeo = new THREE.SphereGeometry(2.2, 16, 12)
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xd6e6ff, transparent: true, opacity: 1.0 })
    this._moonMesh = new THREE.Mesh(moonGeo, moonMat)
    this.scene.add(this._moonMesh)

    // Stars (points)
    const pts = new THREE.BufferGeometry()
    const count = 420
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 120 + Math.random() * 30
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.cos(phi)
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    pts.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pmat = new THREE.PointsMaterial({ color: 0xe6f2ff, size: 0.22, transparent: true, opacity: 0.0 })
    this._stars = new THREE.Points(pts, pmat)
    this.scene.add(this._stars)

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
    const fpts = new THREE.BufferGeometry()
    const fcount = 120
    const fpos = new Float32Array(fcount * 3)
    for (let i = 0; i < fcount; i++) {
      fpos[i * 3 + 0] = (Math.random() - 0.5) * 110
      fpos[i * 3 + 1] = 0.6 + Math.random() * 5.5
      fpos[i * 3 + 2] = (Math.random() - 0.5) * 110
    }
    fpts.setAttribute('position', new THREE.BufferAttribute(fpos, 3))
    const fmat = new THREE.PointsMaterial({ color: 0xcfffcf, size: 0.05, transparent: true, opacity: 0.45 })
    const p = new THREE.Points(fpts, fmat)
    this.scene.add(p)

    // Start camera height
    // (Player controls will keep it anchored.)
  }

  /**
   * @param {number} dt
   * @param {{camera: THREE.Camera, player: any, time: import('./TimeSystem.js').TimeSystem}} ctx
   */
  update(dt, { camera, player, time }) {
    this._t += dt

    const day = time.getDayFactor()
    const night = 1 - day

    // Trajectory for sun/moon
    const a = time.norm * Math.PI * 2 - Math.PI
    const alt = Math.cos(a) // 1 noon .. -1 midnight
    const x = Math.sin(a)

    this._sun.position.set(20 * x, 22 * Math.max(-0.2, alt), 14)
    this._moon.position.set(-20 * x, 18 * Math.max(-0.2, -alt), -14)

    // Visible sun/moon placed on sky dome around camera.
    const skyR = 125
    const sunDir = new THREE.Vector3(0.9 * x, Math.max(-0.15, alt), 0.35).normalize()
    const moonDir = new THREE.Vector3(-0.9 * x, Math.max(-0.15, -alt), -0.35).normalize()

    if (this._sunMesh) {
      this._sunMesh.position.copy(camera.position).addScaledVector(sunDir, skyR)
      this._sunMesh.visible = alt > -0.05
    }
    if (this._moonMesh) {
      this._moonMesh.position.copy(camera.position).addScaledVector(moonDir, skyR)
      this._moonMesh.visible = alt < 0.05
    }

    // Light tuning
    this._sun.intensity = 0.15 + day * 1.25
    this._sun.color.setHex(0xfff1d6)

    this._moon.intensity = 0.05 + night * 0.35
    this._moon.color.setHex(0x9bbcff)

    this._amb.intensity = 0.10 + day * 0.55
    this._amb.color.setHex(day > 0.5 ? 0x5d7a5d : 0x2a3a52)

    // Sky + fog blending
    const skyDay = new THREE.Color(0x86bff0)
    const skyDusk = new THREE.Color(0x2f3f6b)
    const skyNight = new THREE.Color(0x071014)

    const dusk = 1 - Math.abs(day * 2 - 1) // peak at transitions

    const sky = skyNight.clone().lerp(skyDusk, Math.min(1, dusk * 1.15)).lerp(skyDay, day)
    this._sky.material.color.copy(sky)

    // Stars visible at night
    if (this._stars) {
      this._stars.material.opacity = night * night * 0.9
      this._stars.position.copy(camera.position)
    }

    // Fade sun/moon brightness a bit with day/night
    if (this._sunMesh) this._sunMesh.material.opacity = 0.25 + day * 0.75
    if (this._moonMesh) this._moonMesh.material.opacity = 0.35 + night * 0.65

    // Fog density slightly higher at night
    const fogColor = sky.clone().multiplyScalar(0.75)
    this.scene.fog.color.copy(fogColor)
    this.scene.fog.density = 0.020 + night * 0.010

    // Keep sky centered on camera
    if (this._sky) this._sky.position.copy(camera.position)

    player.setBobFactor(1.0)
  }
}
