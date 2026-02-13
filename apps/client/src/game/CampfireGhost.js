import * as THREE from 'three'

export class CampfireGhost {
  constructor() {
    const g = new THREE.Group()

    const baseGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.08, 12)
    const matOk = new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.28 })
    const matBad = new THREE.MeshBasicMaterial({ color: 0xff4a4a, transparent: true, opacity: 0.28 })

    const base = new THREE.Mesh(baseGeo, matOk)
    base.position.y = 0.04

    g.add(base)

    this.mesh = g
    this._matOk = matOk
    this._matBad = matBad
    this._usingOk = true

    this.mesh.visible = false
  }

  setVisible(v) {
    this.mesh.visible = !!v
  }

  setValid(v) {
    const ok = !!v
    if (ok === this._usingOk) return
    this._usingOk = ok
    for (const c of this.mesh.children) {
      if (c.isMesh) c.material = ok ? this._matOk : this._matBad
    }
  }

  setPos(x, z) {
    this.mesh.position.set(x, 0, z)
  }
}
