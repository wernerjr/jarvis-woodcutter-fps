import * as THREE from 'three'

export class OreManager {
  /** @param {{scene: THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene

    this._nodes = new Map()
    this._ray = new THREE.Raycaster()

    this._t = 0
    this._respawnSeconds = 90

    this.oreHpMin = 22
    this.oreHpMax = 34
  }

  /** @param {{seed?:number, points:{x:number,y:number,z:number}[]}} params */
  init({ points }) {
    this.resetAll()

    const geo = new THREE.DodecahedronGeometry(0.95, 0)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2f2f35,
      roughness: 1.0,
      metalness: 0.0,
      emissive: 0x101018,
      emissiveIntensity: 0.25,
    })

    const veinGeo = new THREE.IcosahedronGeometry(0.28, 0)
    const veinMat = new THREE.MeshStandardMaterial({
      color: 0x7a3b22,
      roughness: 0.8,
      metalness: 0.1,
      emissive: 0x3a1a10,
      emissiveIntensity: 0.55,
    })

    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(p.x, p.y, p.z)
      mesh.rotation.y = Math.random() * Math.PI * 2
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.userData.oreId = String(i)

      // add a few "veins"
      for (let k = 0; k < 4; k++) {
        const v = new THREE.Mesh(veinGeo, veinMat)
        v.position.set((Math.random() - 0.5) * 1.2, 0.15 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2)
        v.scale.setScalar(0.8 + Math.random() * 0.7)
        mesh.add(v)
      }

      this.scene.add(mesh)

      const maxHp = this._randInt(this.oreHpMin, this.oreHpMax)
      this._nodes.set(String(i), { mesh, hp: maxHp, maxHp, respawn: 0 })
    }
  }

  resetAll() {
    for (const n of this._nodes.values()) n.mesh.removeFromParent()
    this._nodes.clear()
  }

  /** @param {number} dt */
  update(dt) {
    if (dt <= 0) return
    this._t += dt

    for (const n of this._nodes.values()) {
      if (n.hp > 0) {
        // subtle idle wobble
        n.mesh.rotation.y += dt * 0.35
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
