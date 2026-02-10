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
    this._clouds = null
    this._cloudT = 0
  }

  _makeCloudTexture() {
    const size = 512
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')

    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, size, size)

    // soft blobs
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = 18 + Math.random() * 64
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      const a = 0.08 + Math.random() * 0.18
      g.addColorStop(0, `rgba(255,255,255,${a})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // contrast curve
    const img = ctx.getImageData(0, 0, size, size)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] / 255
      const vv = Math.pow(v, 1.2)
      d[i] = d[i + 1] = d[i + 2] = 255
      d[i + 3] = Math.floor(vv * 255)
    }
    ctx.putImageData(img, 0, 0)

    const tex = new THREE.CanvasTexture(c)
    tex.anisotropy = 2
    return tex
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

    // Sky dome (shader gradient for contrast)
    const skyGeo = new THREE.SphereGeometry(160, 32, 20)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x1a2a44) },
        bottomColor: { value: new THREE.Color(0x0b160b) },
        offset: { value: 10.0 },
        exponent: { value: 0.65 },
      },
      vertexShader: `varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          float t = pow(max(h, 0.0), exponent);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }`,
    })
    this._sky = new THREE.Mesh(skyGeo, skyMat)
    this._sky.renderOrder = 0
    this.scene.add(this._sky)

    // Clouds layer (procedural canvas texture)
    const cloudTex = this._makeCloudTexture()
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping
    cloudTex.repeat.set(1.6, 1.2)
    const cloudGeo = new THREE.SphereGeometry(155, 32, 20)
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    })
    this._clouds = new THREE.Mesh(cloudGeo, cloudMat)
    this._clouds.renderOrder = 1
    this.scene.add(this._clouds)

    // Sun/Moon visible discs (additive for contrast)
    const sunGeo = new THREE.SphereGeometry(3.2, 20, 14)
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffc84a,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    this._sunMesh = new THREE.Mesh(sunGeo, sunMat)
    this._sunMesh.renderOrder = 2
    this._sunMesh.frustumCulled = false
    this.scene.add(this._sunMesh)

    const moonGeo = new THREE.SphereGeometry(2.6, 20, 14)
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xe8f2ff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    this._moonMesh = new THREE.Mesh(moonGeo, moonMat)
    this._moonMesh.renderOrder = 2
    this._moonMesh.frustumCulled = false
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
      this._sunMesh.lookAt(camera.position)
    }
    if (this._moonMesh) {
      this._moonMesh.position.copy(camera.position).addScaledVector(moonDir, skyR)
      this._moonMesh.visible = alt < 0.05
      this._moonMesh.lookAt(camera.position)
    }

    // Light tuning
    this._sun.intensity = 0.15 + day * 1.25
    this._sun.color.setHex(0xfff1d6)

    this._moon.intensity = 0.05 + night * 0.35
    this._moon.color.setHex(0x9bbcff)

    this._amb.intensity = 0.10 + day * 0.55
    this._amb.color.setHex(day > 0.5 ? 0x5d7a5d : 0x2a3a52)

    // Sky + fog blending
    const skyDayTop = new THREE.Color(0x5aa6ff)
    const skyDayBottom = new THREE.Color(0xbfe7ff)
    const skyDuskTop = new THREE.Color(0x2b3a7a)
    const skyDuskBottom = new THREE.Color(0xffb07a)
    const skyNightTop = new THREE.Color(0x070b18)
    const skyNightBottom = new THREE.Color(0x0b1626)

    const dusk = 1 - Math.abs(day * 2 - 1) // peak at transitions

    const top = skyNightTop.clone().lerp(skyDuskTop, Math.min(1, dusk * 1.2)).lerp(skyDayTop, day)
    const bottom = skyNightBottom.clone().lerp(skyDuskBottom, Math.min(1, dusk * 1.25)).lerp(skyDayBottom, day)

    this._sky.material.uniforms.topColor.value.copy(top)
    this._sky.material.uniforms.bottomColor.value.copy(bottom)

    // Stars visible at night
    if (this._stars) {
      this._stars.material.opacity = night * night * 0.9
      this._stars.position.copy(camera.position)
    }

    // Clouds drift slowly, tint with sky
    if (this._clouds) {
      this._cloudT += dt
      const tex = this._clouds.material.map
      tex.offset.x = (this._cloudT * 0.002) % 1
      tex.offset.y = (this._cloudT * 0.001) % 1

      // More visible in day/dusk, faint at night
      this._clouds.material.opacity = 0.08 + day * 0.22 + dusk * 0.06
      this._clouds.material.color.copy(bottom.clone().lerp(top, 0.4))
      this._clouds.position.copy(camera.position)
    }

    // Fade sun/moon brightness a bit with day/night
    if (this._sunMesh) this._sunMesh.material.opacity = 0.15 + day * 0.95
    if (this._moonMesh) this._moonMesh.material.opacity = 0.22 + night * 0.78

    // Fog density slightly higher at night
    const fogColor = sky.clone().multiplyScalar(0.75)
    this.scene.fog.color.copy(fogColor)
    this.scene.fog.density = 0.020 + night * 0.010

    // Keep sky centered on camera
    if (this._sky) this._sky.position.copy(camera.position)

    player.setBobFactor(1.0)
  }
}
