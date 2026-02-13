import * as THREE from 'three'

export class Renderer {
  /** @param {{canvas: HTMLCanvasElement}} params */
  constructor({ canvas }) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
  }

  setSize(w, h) {
    this.renderer.setSize(w, h, false)
  }

  render(scene, camera) {
    this.renderer.render(scene, camera)
  }
}
