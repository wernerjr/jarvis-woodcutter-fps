import * as THREE from 'three'

export class ForgeTableGhost {
  constructor() {
    this.mesh = new THREE.Group()

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x9ff5a8, roughness: 1.0, transparent: true, opacity: 0.45 })

    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 1.2), woodMat)
    top.position.y = 1.02

    const legGeo = new THREE.BoxGeometry(0.14, 1.0, 0.14)
    const legs = [
      [-0.95, 0.5, -0.45],
      [0.95, 0.5, -0.45],
      [-0.95, 0.5, 0.45],
      [0.95, 0.5, 0.45],
    ]
    for (const [x, y, z] of legs) {
      const l = new THREE.Mesh(legGeo, woodMat)
      l.position.set(x, y, z)
      this.mesh.add(l)
    }

    this.mesh.add(top)
    this.mesh.visible = false
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
