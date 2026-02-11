import * as THREE from 'three'

export class ForgeGhost {
  constructor() {
    this.mesh = new THREE.Group()

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2f, roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0.55 })
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x3c3c46, roughness: 0.6, metalness: 0.25, transparent: true, opacity: 0.55 })

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.7, 10), stoneMat)
    base.position.y = 0.35

    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.85, 10), stoneMat)
    body.position.y = 0.95

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.14, 10), metalMat)
    rim.position.y = 1.45

    this.mesh.add(base)
    this.mesh.add(body)
    this.mesh.add(rim)

    this.mesh.visible = false
    this.setValid(false)
  }

  setVisible(v) {
    this.mesh.visible = !!v
  }

  setValid(v) {
    const col = v ? 0x9ff5a8 : 0xff7a7a
    for (const ch of this.mesh.children) {
      if (ch.material) ch.material.color.setHex(col)
    }
  }
}
