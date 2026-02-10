import * as THREE from 'three'
import { Renderer } from './Renderer.js'
import { World } from './World.js'
import { Player } from './Player.js'
import { TreeManager } from './TreeManager.js'
import { Sfx } from './Sfx.js'
import { clamp } from './util.js'

export class Game {
  /**
   * @param {{canvas: HTMLCanvasElement, ui: import('./UI.js').UI}} params
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

    /** @type {'menu'|'playing'|'paused'|'controls-menu'|'controls-pause'} */
    this.state = 'menu'

    this._onResize = () => this._resize()
    this._onPointerLockChange = () => this._onPlockChange()
    this._onClick = (e) => this._onClickAny(e)
    this._onKeyDown = (e) => this._onKeyDownAny(e)
  }

  start() {
    this._resize()
    window.addEventListener('resize', this._onResize)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
    window.addEventListener('keydown', this._onKeyDown)

    // Click canvas: attempt chop (only when playing + locked)
    this.canvas.addEventListener('click', this._onClick)
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    this.world.init()
    // Player rig (yaw->pitch->camera)
    this.scene.add(this.player.yaw)

    this.trees.init({ seed: 1337, count: 42, radius: 42 })

    this._running = true
    this._loop()

    this.ui.toast('Play para começar.')
  }

  stop() {
    this._running = false
    window.removeEventListener('resize', this._onResize)
    document.removeEventListener('pointerlockchange', this._onPointerLockChange)
    window.removeEventListener('keydown', this._onKeyDown)
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

    // If we were playing and pointer lock is lost, pause.
    if (!locked && this.state === 'playing') {
      this.pause('pointerlock')
    }
  }

  _onKeyDownAny(e) {
    if (e.code !== 'Escape') return

    // In menus, ESC closes controls.
    if (this.state === 'controls-menu') {
      this.closeControls()
      return
    }
    if (this.state === 'controls-pause') {
      this.closeControls()
      return
    }

    // In-game: ESC toggles pause/resume.
    if (this.state === 'playing') {
      this.pause('esc')
      return
    }
    if (this.state === 'paused') {
      this.resume()
      return
    }
  }

  async _onClickAny(e) {
    // Only chop during play + locked.
    if (this.state !== 'playing') return
    if (document.pointerLockElement !== this.canvas) return

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

    // Swing + score increments exactly when chop() succeeds.
    this.player.swing()

    this.score += 1
    this.ui.setScore(this.score)

    this.sfx.chop()
    this.ui.toast('Árvore cortada! (+1)')
  }

  async playFromMenu() {
    this.score = 0
    this.ui.setScore(0)
    this.trees.resetAll()
    this.player.reset()

    this.state = 'playing'
    this.ui.showHUD()

    await this.sfx.enable()
    await this._lockPointer()

    this.ui.toast('Corte árvores!')
  }

  pause(reason = 'esc') {
    if (this.state !== 'playing') return
    this.state = 'paused'

    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    this.ui.showPause()
    if (reason === 'pointerlock') this.ui.toast('Pausado (mouse destravado).')
  }

  async resume() {
    if (this.state !== 'paused') return
    this.state = 'playing'
    this.ui.showHUD()

    await this.sfx.enable()
    await this._lockPointer()
  }

  restart() {
    // Restart from pause: reset score + world and keep in playing state.
    this.score = 0
    this.ui.setScore(0)
    this.trees.resetAll()
    this.player.reset()

    this.state = 'playing'
    this.ui.showHUD()
    this._lockPointer()
    this.ui.toast('Reiniciado.')
  }

  quitToMenu() {
    // Quit resets progress.
    this.score = 0
    this.ui.setScore(0)
    this.trees.resetAll()
    this.player.reset()

    this.state = 'menu'
    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    this.ui.showMenu()
  }

  openControls(from) {
    if (from === 'pause') this.state = 'controls-pause'
    else this.state = 'controls-menu'
    this.ui.showControls()
  }

  closeControls() {
    if (this.state === 'controls-pause') {
      this.state = 'paused'
      this.ui.showPause()
      return
    }

    this.state = 'menu'
    this.ui.showMenu()
  }

  tryClose() {
    // Best-effort: browsers usually block window.close if not opened by script.
    window.close()
    this.ui.toast('Se não fechar, use a aba do navegador para sair.', 1800)
  }

  async _lockPointer() {
    if (document.pointerLockElement === this.canvas) return
    this.canvas.focus()
    try {
      this.canvas.requestPointerLock()
    } catch {
      // ignore
    }
  }

  _loop = () => {
    if (!this._running) return

    const dt = clamp(this.clock.getDelta(), 0, 0.033)

    // Freeze simulation when not playing.
    const simDt = this.state === 'playing' ? dt : 0

    this.player.update(simDt)
    this.world.update(simDt, { camera: this.camera, player: this.player })
    this.trees.update(simDt)
    this.ui.update()

    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this._loop)
  }
}
