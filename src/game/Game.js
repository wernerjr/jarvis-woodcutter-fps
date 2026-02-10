import * as THREE from 'three'
import { Renderer } from './Renderer.js'
import { World } from './World.js'
import { Player } from './Player.js'
import { TreeManager } from './TreeManager.js'
import { RockManager } from './RockManager.js'
import { Sfx } from './Sfx.js'
import { clamp } from './util.js'
import { Inventory } from './Inventory.js'
import { ITEMS, ItemId } from './items.js'
import { TimeSystem } from './TimeSystem.js'
import { Perf } from './Perf.js'

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

    // Torch light (attached to camera)
    this.torchLight = new THREE.PointLight(0xffa24a, 0.0, 12, 2)
    this.torchLight.position.set(0.25, -0.15, -0.35)
    this.camera.add(this.torchLight)
    this.trees = new TreeManager({ scene: this.scene })
    this.rocks = new RockManager({ scene: this.scene })
    this.sfx = new Sfx()

    this.inventory = new Inventory({ slots: 20, maxStack: 100 })
    this.time = new TimeSystem({ startHours: 9.0 })
    this.perf = new Perf()
    this.perfEnabled = false

    this.score = 0
    this._running = false

    /** @type {'menu'|'playing'|'paused'|'inventory'|'controls-menu'|'controls-pause'} */
    this.state = 'menu'

    this._onResize = () => this._resize()
    this._onPointerLockChange = () => this._onPlockChange()
    this._onMouseDown = (e) => this._onMouseDownAny(e)
    this._onMouseUp = (e) => this._onMouseUpAny(e)
    this.tool = 'axe'

    this._actionHeld = false
    this._actionCooldown = 0

    this._baseFov = 75

    this._pendingDeleteIdx = null
    this._pendingDeleteUntil = 0

    this._onKeyDown = (e) => this._onKeyDownAny(e)
  }

  start() {
    this._resize()
    window.addEventListener('resize', this._onResize)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
    window.addEventListener('keydown', this._onKeyDown)

    // Mouse button: hold-to-act
    this.canvas.addEventListener('mousedown', this._onMouseDown)
    window.addEventListener('mouseup', this._onMouseUp)
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    this.world.init()
    // Player rig (yaw->pitch->camera)
    this.scene.add(this.player.yaw)

    this.trees.init({ seed: 1337, count: 42, radius: 42 })
    this.rocks.init({ seed: 2026, count: 32, radius: 45 })

    // Swing impacts trigger hit detection in a narrow window.
    this.player.onImpact(() => {
      if (this.state !== 'playing') return
      if (document.pointerLockElement !== this.canvas) return
      if (this.tool !== 'axe') return
      this._tryChop()
    })

    this._running = true
    this._loop()

    this.setTool('axe')
    this.ui.toast('Play para começar.')
  }

  stop() {
    this._running = false
    window.removeEventListener('resize', this._onResize)
    document.removeEventListener('pointerlockchange', this._onPointerLockChange)
    window.removeEventListener('keydown', this._onKeyDown)
    this.canvas.removeEventListener('mousedown', this._onMouseDown)
    window.removeEventListener('mouseup', this._onMouseUp)
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
    // Tool hotkeys
    if (e.code === 'Digit1') {
      this.setTool('axe')
      return
    }
    if (e.code === 'Digit2') {
      this.setTool('hand')
      return
    }
    if (e.code === 'Digit3') {
      this.setTool('torch')
      return
    }

    // Jump
    if (e.code === 'Space') {
      if (this.state === 'playing') {
        e.preventDefault?.()
        this.player.jump()
      }
      return
    }

    // Interact (hand)
    // (E kept as alternative interact)
    if (e.code === 'KeyE') {
      if (this.state === 'playing') this._tryInteract()
      return
    }

    // Inventory toggle (in-game only)
    if (e.code === 'KeyI') {
      if (this.state === 'playing') {
        this.openInventory()
      } else if (this.state === 'inventory') {
        this.closeInventory()
      }
      return
    }

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
    if (this.state === 'inventory') {
      this.closeInventory()
      return
    }
  }

  _onMouseDownAny(e) {
    if (e.button !== 0) return
    if (this.state !== 'playing') return
    if (document.pointerLockElement !== this.canvas) return

    this._actionHeld = true
  }

  _onMouseUpAny(e) {
    if (e.button !== 0) return
    this._actionHeld = false
  }

  _tryChop() {
    const hit = this.trees.raycastFromCamera(this.camera)
    if (!hit) {
      this.sfx.click()
      return
    }

    const dist = hit.distance
    if (dist > 3.0) {
      this.ui.toast('Muito longe.')
      this.sfx.click()
      return
    }

    const result = this.trees.chop(hit.treeId, this.player.position)
    if (!result) return

    // Score increments exactly when chop() succeeds.
    this.score += 1
    this.ui.setScore(this.score)

    // Loot rule (fixed): 1 log, 2–5 sticks, 10–20 leaves.
    const sticks = this._randInt(2, 5)
    const leaves = this._randInt(10, 20)

    const dropped = []
    const overflowLog = this.inventory.add(ItemId.LOG, 1)
    const overflowStick = this.inventory.add(ItemId.STICK, sticks)
    const overflowLeaf = this.inventory.add(ItemId.LEAF, leaves)

    if (overflowLog) dropped.push(`${overflowLog} ${ITEMS[ItemId.LOG].name}`)
    if (overflowStick) dropped.push(`${overflowStick} ${ITEMS[ItemId.STICK].name}`)
    if (overflowLeaf) dropped.push(`${overflowLeaf} ${ITEMS[ItemId.LEAF].name}`)

    // Overflow behavior: discard excedente (inventário cheio) e notificar.
    const msg = dropped.length
      ? `Loot: +1 tronco, +${sticks} galhos, +${leaves} folhas (excedente descartado)`
      : `Loot: +1 tronco, +${sticks} galhos, +${leaves} folhas`

    this.sfx.chop()
    this.ui.toast(msg, 1400)

    // If inventory is open, refresh it.
    if (this.state === 'inventory') this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
  }

  _randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  async playFromMenu() {
    this.score = 0
    this.ui.setScore(0)
    this.inventory.clear()
    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])

    this.trees.resetAll()
    this.rocks?.resetAll?.()
    this.player.reset()

    this.setTool('axe')

    this.state = 'playing'
    this.ui.showHUD()

    await this.sfx.enable()
    await this._lockPointer()

    this.ui.toast('Corte árvores! (I inventário • 1/2/3 ferramenta • Shift correr • Espaço pular)')
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
    this.inventory.clear()
    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])

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
    this.inventory.clear()
    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])

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

  openInventory() {
    if (this.state !== 'playing') return
    this.state = 'inventory'

    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
    this.ui.showInventory()
  }

  requestRemoveInventorySlot(idx) {
    // Two-step confirm to avoid accidents.
    const t = performance.now()
    if (this._pendingDeleteIdx === idx && t < (this._pendingDeleteUntil ?? 0)) {
      this.inventory.removeSlot(idx)
      this._pendingDeleteIdx = null
      this._pendingDeleteUntil = 0
      this.ui.toast('Item removido.', 900)
      if (this.state === 'inventory') this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
      return
    }

    this._pendingDeleteIdx = idx
    this._pendingDeleteUntil = t + 2200
    this.ui.toast('Clique direito de novo para confirmar remoção.', 1400)
  }

  togglePerf() {
    this.perfEnabled = !this.perfEnabled
    this.perf.setEnabled(this.perfEnabled)
    this.ui.setPerfVisible(this.perfEnabled)

    const btn = document.querySelector('#btnPerfToggle')
    if (btn) btn.textContent = `Performance: ${this.perfEnabled ? 'ON' : 'OFF'}`
  }

  async closeInventory() {
    if (this.state !== 'inventory') return
    this.state = 'playing'

    this.ui.hideInventory()
    this.ui.showHUD()

    await this.sfx.enable()
    await this._lockPointer()
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

  setTool(tool) {
    if (tool !== 'axe' && tool !== 'hand' && tool !== 'torch') return
    this.tool = tool
    this.player.setTool(tool)
    this.ui.setHotbarActive(tool)

    if (this.state === 'playing') {
      const msg = tool === 'axe' ? 'Machado equipado.' : tool === 'hand' ? 'Mão equipada.' : 'Tocha equipada.'
      this.ui.toast(msg)
    }
  }

  _tryInteract() {
    if (this.state !== 'playing') return
    if (document.pointerLockElement !== this.canvas) return

    if (this.tool !== 'hand') {
      this.ui.toast('Equipe a mão (2) para coletar pedras.', 1100)
      return
    }

    const hit = this.rocks.raycastFromCamera(this.camera)
    if (!hit || hit.distance > 2.0) {
      this.ui.toast('Nenhuma pedra perto.', 800)
      return
    }

    const ok = this.rocks.collect(hit.rockId)
    if (!ok) return

    const overflow = this.inventory.add(ItemId.STONE, 1)
    if (overflow) {
      this.ui.toast('Inventário cheio: pedra descartada.', 1200)
      this.sfx.click()
    } else {
      this.ui.toast('Pegou: +1 pedra', 900)
      this.sfx.pickup()
      if (this.state === 'inventory') this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
    }
  }

  _loop = () => {
    if (!this._running) return

    const dt = clamp(this.clock.getDelta(), 0, 0.033)

    // Perf overlay updates even in pause/menus (cheap).
    this.perf.update(dt)
    this.ui.setPerf({ fps: this.perf.fps, frameMs: this.perf.frameMs, memMB: this.perf.memMB })

    // Freeze simulation when not playing (pause/inventory/menus).
    const simDt = this.state === 'playing' ? dt : 0

    const colliders = this.state === 'playing' ? this.trees.getTrunkColliders() : []

    this.player.update(simDt, colliders)

    // Torch light intensity (mainly useful at night)
    const night = 1 - this.time.getDayFactor()
    const torchOn = this.tool === 'torch'
    const flicker = 0.90 + 0.10 * Math.sin(performance.now() * 0.018) + 0.05 * Math.sin(performance.now() * 0.041)
    const targetTorch = torchOn ? (0.6 + night * 1.2) * flicker : 0.0
    this.torchLight.intensity += (targetTorch - this.torchLight.intensity) * (simDt > 0 ? 0.25 : 0.0)

    // Sprint FOV (subtle)
    const targetFov = this.player.isSprinting ? 80 : this._baseFov
    this.camera.fov += (targetFov - this.camera.fov) * (simDt > 0 ? 0.10 : 0.0)
    this.camera.updateProjectionMatrix()

    // Hold-to-act with cooldown.
    this._actionCooldown = Math.max(0, this._actionCooldown - simDt)
    if (simDt > 0 && this._actionHeld && this._actionCooldown === 0 && document.pointerLockElement === this.canvas) {
      if (this.tool === 'hand') {
        this.player.handAction()
        this._tryInteract()
        this._actionCooldown = 0.22
      } else if (this.tool === 'axe') {
        if (!this.player.isSwinging()) {
          this.player.swing()
          this.sfx.swing()
          this._actionCooldown = this.player.getSwingDuration()
        } else {
          // wait until swing ends
          this._actionCooldown = 0.05
        }
      } else {
        // torch: neutral action (no chop / no pickup)
        this.player.torchAction()
        this._actionCooldown = 0.25
      }
    }

    // Time freezes when not playing (we pass simDt).
    this.time.update(simDt)

    this.world.update(simDt, { camera: this.camera, player: this.player, time: this.time })
    this.trees.update(simDt)
    this.rocks.update(simDt)

    this.ui.setTime({
      hhmm: this.time.getHHMM(),
      norm: this.time.norm,
      dayFactor: this.time.getDayFactor(),
      proximity: this.time.getTransitionProximity(),
    })

    this.ui.update()

    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this._loop)
  }
}
