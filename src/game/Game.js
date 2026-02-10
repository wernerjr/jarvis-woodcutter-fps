import * as THREE from 'three'
import { Renderer } from './Renderer.js'
import { World } from './World.js'
import { Player } from './Player.js'
import { TreeManager } from './TreeManager.js'
import { Sfx } from './Sfx.js'
import { clamp, nowMs } from './util.js'

export class Game {
  /**
   * @param {{canvas: HTMLCanvasElement, ui: {score: HTMLElement, hint: HTMLElement, toast: HTMLElement}}} params
   */
  constructor({ canvas, ui }) {
    this.canvas = canvas
    this.ui = ui

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x0b160b, 0.022)

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 250)

    this.clock = new THREE.Clock()
    this.renderer = new Renderer({ canvas })

    this.world = new World({ scene: this.scene })
    this.player = new Player({ camera: this.camera, domElement: canvas })
    this.trees = new TreeManager({ scene: this.scene })
    this.sfx = new Sfx()

    this.score = 0
    this._running = false

    this._onResize = () => this._resize()
    this._onPointerLockChange = () => this._onPlockChange()
    this._onClick = (e) => this._onClickAny(e)

    this._toastTimer = 0
  }

  start() {
    this._resize()
    window.addEventListener('resize', this._onResize)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)

    // User gesture: click canvas to pointer-lock + enable audio.
    this.canvas.addEventListener('click', this._onClick)
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    this.world.init()
    // Player rig (yaw->pitch->camera)
    this.scene.add(this.player.yaw)

    this.trees.init({ seed: 1337, count: 42, radius: 42 })

    this._running = true
    this._loop()

    this._toast('Clique para começar (capturar mouse).')
  }

  stop() {
    this._running = false
    window.removeEventListener('resize', this._onResize)
    document.removeEventListener('pointerlockchange', this._onPointerLockChange)
    this.canvas.removeEventListener('click', this._onClick)
  }

  _resize() {
    const { innerWidth: w, innerHeight: h } = window
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  _onPlockChange() {
    const locked = document.pointerLockElement === this.canvas
    this.player.setLocked(locked)
    this.ui.hint.textContent = locked ? 'ESC para liberar o mouse' : 'Clique para capturar o mouse (Pointer Lock)'
  }

  async _onClickAny(e) {
    // First click: request pointer lock. Subsequent clicks: chop.
    if (document.pointerLockElement !== this.canvas) {
      this.canvas.focus()
      this.canvas.requestPointerLock()
      await this.sfx.enable()
      return
    }

    if (e.button !== 0) return
    this._tryChop()
  }

  _tryChop() {
    const hit = this.trees.raycastFromCamera(this.camera)
    if (!hit) {
      this.sfx.click()
      return
    }

    const dist = hit.distance
    if (dist > 3.0) {
      this._toast('Muito longe.')
      this.sfx.click()
      return
    }

    const result = this.trees.chop(hit.treeId)
    if (!result) return

    this.player.swing()

    this.score += 1
    this.ui.score.textContent = String(this.score)

    this.sfx.chop()
    this._toast(`Árvore cortada! (+1)`)
  }

  _toast(text) {
    this.ui.toast.textContent = text
    this.ui.toast.classList.add('show')
    this._toastTimer = nowMs() + 1100
  }

  _loop = () => {
    if (!this._running) return

    const dt = clamp(this.clock.getDelta(), 0, 0.033)

    this.player.update(dt)
    this.world.update(dt, { camera: this.camera, player: this.player })
    this.trees.update(dt)

    if (this._toastTimer && nowMs() > this._toastTimer) {
      this._toastTimer = 0
      this.ui.toast.classList.remove('show')
    }

    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this._loop)
  }
}
