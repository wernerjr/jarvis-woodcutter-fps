import * as THREE from 'three'

export class OreManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene

    this._nodes = new Map()
    this._ray = new THREE.Raycaster()

    this._group = new THREE.Group()
    this._group.name = 'OreNodes'
    this._visible = true

    this._t = 0
    this._respawnSeconds = 90

    this.oreHpMin = 22
    this.oreHpMax = 34
  }

  /** @param {boolean} v */
  setVisible(v) {
    this._visible = !!v
    if (this._group) this._group.visible = this._visible
  }

  /** @param {{seed?:number, points:{x:number,y:number,z:number,nx?:number,ny?:number,nz?:number}[]}} params */
  init({ points }) {
    this.resetAll()

    // Ensure group is attached (visibility is toggled by Game when entering/exiting mine).
    if (!this._group) {
      this._group = new THREE.Group()
      this._group.name = 'OreNodes'
    }
    this.scene.add(this._group)
    this._group.visible = this._visible

    // Iron ore as wall veins: use a clear, emissive decal-like card + an invisible hitbox.
    const hitGeo = new THREE.BoxGeometry(0.85, 0.75, 0.28)
    const hitMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 1.0,
      metalness: 0.0,
      transparent: true,
      opacity: 0.0,
      // Critical: do not write depth, otherwise this invisible hitbox occludes the visible vein card.
      depthWrite: false,
    })

    const cardGeo = new THREE.PlaneGeometry(1.05, 0.72)
    const cardMat = new THREE.MeshStandardMaterial({
      color: 0x6b331e,
      roughness: 0.85,
      metalness: 0.15,
      emissive: 0x6a2a16,
      emissiveIntensity: 1.25,
      side: THREE.DoubleSide,
    })

    const streakGeo = new THREE.BoxGeometry(0.18, 0.05, 0.03)
    const streakMat = new THREE.MeshStandardMaterial({
      color: 0x8a4424,
      roughness: 0.7,
      metalness: 0.2,
      emissive: 0x7a2f18,
      emissiveIntensity: 1.35,
    })

    for (let i = 0; i < points.length; i++) {
      const p = points[i]

      // Root: invisible hitbox mesh (raycast target)
      const mesh = new THREE.Mesh(hitGeo, hitMat)
      mesh.position.set(p.x, p.y, p.z)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.userData.oreId = String(i)

      // Orient to wall if normal provided.
      let n = null
      if (typeof p.nx === 'number' && typeof p.nz === 'number') {
        n = new THREE.Vector3(p.nx, p.ny ?? 0, p.nz).normalize()
        const target = new THREE.Vector3(p.x + n.x, p.y + n.y, p.z + n.z)
        mesh.lookAt(target)
        // Push slightly INWARD (towards tunnel center) so the card is visible on the inner wall.
        mesh.position.addScaledVector(n, 0.08)
      } else {
        mesh.rotation.y = Math.random() * Math.PI * 2
      }

      // Visible "vein card" + streaks
      const card = new THREE.Mesh(cardGeo, cardMat)
      // Place towards the tunnel interior (lookAt points -Z to the center).
      card.position.set(0, 0, -0.10)
      mesh.add(card)

      const streaks = 12
      for (let k = 0; k < streaks; k++) {
        const s = new THREE.Mesh(streakGeo, streakMat)
        s.position.set((Math.random() - 0.5) * 0.85, (Math.random() - 0.5) * 0.50, -0.12 - Math.random() * 0.14)
        s.rotation.set((Math.random() - 0.5) * 0.10, (Math.random() - 0.5) * 0.10, (Math.random() - 0.5) * 1.2)
        s.scale.set(0.8 + Math.random() * 1.8, 0.8 + Math.random() * 1.6, 1.0)
        mesh.add(s)
      }

      this._group.add(mesh)

      const maxHp = this._randInt(this.oreHpMin, this.oreHpMax)
      this._nodes.set(String(i), { mesh, hp: maxHp, maxHp, respawn: 0 })
    }
  }

  resetAll() {
    for (const n of this._nodes.values()) n.mesh.removeFromParent()
    this._nodes.clear()

    if (this._group) {
      this._group.removeFromParent()
      this._group = new THREE.Group()
      this._group.name = 'OreNodes'
      this._group.visible = this._visible
    }
  }

  /** @param {number} dt */
  update(dt) {
    if (dt <= 0) return
    if (!this._visible) return
    this._t += dt

    for (const n of this._nodes.values()) {
      if (n.hp > 0) {
        // No idle rotation.
        continue
      }

      if (n.respawn > 0) {
        n.respawn = Math.max(0, n.respawn - dt)
        if (n.respawn <= 0) {
          const maxHp = this._randInt(this.oreHpMin, this.oreHpMax)
          n.maxHp = maxHp
          n.hp = maxHp
          n.mesh.visible = true
          n.mesh.scale.set(1, 1, 1)
        }
      }
    }
  }

  /** @param {THREE.Camera} camera */
  raycastFromCamera(camera) {
    if (!this._visible) return null
    const origin = new THREE.Vector3()
    const dir = new THREE.Vector3()
    camera.getWorldPosition(origin)
    camera.getWorldDirection(dir)

    this._ray.set(origin, dir)
    this._ray.far = 3.2

    const meshes = []
    for (const n of this._nodes.values()) if (n.hp > 0 && n.mesh.visible) meshes.push(n.mesh)
    const hits = this._ray.intersectObjects(meshes, true)
    if (!hits.length) return null

    // climb to root ore mesh
    let obj = hits[0].object
    while (obj && !obj.userData.oreId && obj.parent) obj = obj.parent
    const oreId = obj?.userData?.oreId
    if (oreId == null) return null

    return { oreId: String(oreId), point: hits[0].point, distance: hits[0].distance }
  }

  /** @param {string} oreId @param {number} dmg */
  damage(oreId, dmg) {
    const n = this._nodes.get(String(oreId))
    if (!n) return null
    if (n.hp <= 0) return null

    n.hp = Math.max(0, n.hp - dmg)

    if (n.hp <= 0) {
      // "break" visual
      n.mesh.visible = false
      n.respawn = this._respawnSeconds
      return { broke: true }
    }

    return { broke: false }
  }

  _randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
}
