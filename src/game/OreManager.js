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

    // Iron ore as "veins" on the wall (smaller, non-rotating).
    const hitGeo = new THREE.BoxGeometry(0.55, 0.8, 0.12)
    const hitMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 1.0,
      metalness: 0.0,
      transparent: true,
      opacity: 0.0,
    })

    const shardGeo = new THREE.BoxGeometry(0.24, 0.14, 0.08)
    const veinMat = new THREE.MeshStandardMaterial({
      color: 0x7a3b22,
      roughness: 0.75,
      metalness: 0.1,
      emissive: 0x4a2416,
      emissiveIntensity: 0.85,
    })

    for (let i = 0; i < points.length; i++) {
      const p = points[i]

      // Invisible hitbox mesh (raycast target)
      const mesh = new THREE.Mesh(hitGeo, hitMat)
      mesh.position.set(p.x, p.y, p.z)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.userData.oreId = String(i)

      // Orient to wall if normal provided.
      if (typeof p.nx === 'number' && typeof p.nz === 'number') {
        const n = new THREE.Vector3(p.nx, p.ny ?? 0, p.nz).normalize()
        // Normal points inward (towards tunnel center). Orient the vein to face inward,
        // and push the whole cluster slightly outward so it doesn't end up hidden inside the wall.
        const target = new THREE.Vector3(p.x + n.x, p.y + n.y, p.z + n.z)
        mesh.lookAt(target)
        mesh.position.addScaledVector(n, -0.10)
      } else {
        mesh.rotation.y = Math.random() * Math.PI * 2
      }

      // Visual vein shards attached to the hitbox
      const shards = 11
      for (let k = 0; k < shards; k++) {
        const s = new THREE.Mesh(shardGeo, veinMat)
        s.position.set(
          (Math.random() - 0.5) * 0.58,
          (Math.random() - 0.5) * 0.78,
          -(0.06 + Math.random() * 0.16)
        )
        s.rotation.set((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.85)
        s.scale.set(0.8 + Math.random() * 0.9, 0.8 + Math.random() * 0.9, 0.8 + Math.random() * 0.9)
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
        // No idle rotation (veins should feel embedded in the wall).
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
