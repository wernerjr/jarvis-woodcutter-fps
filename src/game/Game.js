import * as THREE from 'three'
import { Renderer } from './Renderer.js'
import { World } from './World.js'
import { Player } from './Player.js'
import { TreeManager } from './TreeManager.js'
import { RockManager } from './RockManager.js'
import { CampfireManager } from './CampfireManager.js'
import { Sfx } from './Sfx.js'
import { clamp } from './util.js'
import { Inventory } from './Inventory.js'
import { ITEMS, ItemId } from './items.js'
import { TimeSystem } from './TimeSystem.js'
import { Perf } from './Perf.js'
import { DamageNumbers } from './DamageNumbers.js'
import { RECIPES, DURABILITY } from './recipes.js'

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

    // Torch lights (attached to camera): spot for ground/forward + point for local fill.
    this.torchPoint = new THREE.PointLight(0xffa24a, 0.0, 18, 1.2)
    this.torchPoint.position.set(0.25, -0.10, -0.25)
    this.camera.add(this.torchPoint)

    this.torchTarget = new THREE.Object3D()
    this.torchTarget.position.set(0, -0.35, -2.0)
    this.camera.add(this.torchTarget)

    this.torchSpot = new THREE.SpotLight(0xffb06a, 0.0, 26, Math.PI / 4.5, 0.55, 1.2)
    this.torchSpot.position.set(0.15, -0.05, -0.10)
    this.torchSpot.target = this.torchTarget
    this.camera.add(this.torchSpot)
    this.trees = new TreeManager({ scene: this.scene })
    this.rocks = new RockManager({ scene: this.scene })
    this.fires = new CampfireManager({ scene: this.scene })
    this.sfx = new Sfx()

    this.inventory = new Inventory({ slots: 20, maxStack: 100 })
    this.time = new TimeSystem({ startHours: 9.0 })
    this.perf = new Perf()
    this.perfEnabled = false

    this.damageNumbers = new DamageNumbers({ container: document.querySelector('#floaters') })

    this.axeDamage = 12

    // Tool durability state (mirrors first inventory instance)
    this._axeBroken = false
    this._torchBroken = false
    this._torchTick = 0

    this.score = 0
    this._running = false

    /** @type {'menu'|'playing'|'paused'|'inventory'|'crafting'|'controls-menu'|'controls-pause'} */
    this.state = 'menu'

    this._onResize = () => this._resize()
    this._onPointerLockChange = () => this._onPlockChange()
    this._onMouseDown = (e) => this._onMouseDownAny(e)
    this._onMouseUp = (e) => this._onMouseUpAny(e)

    // Hotbar bindings (inventory items). 'hand' is virtual.
    this.hotbar = [{ itemId: ItemId.AXE }, { itemId: 'hand' }, { itemId: ItemId.TORCH }]
    this.hotbarActive = 0

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

    this.selectHotbar(0)
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
    // Hotbar slots
    if (e.code === 'Digit1') {
      this.selectHotbar(0)
      return
    }
    if (e.code === 'Digit2') {
      this.selectHotbar(1)
      return
    }
    if (e.code === 'Digit3') {
      this.selectHotbar(2)
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

    // Fire interaction / placement
    if (e.code === 'KeyF') {
      if (this.state === 'playing') this._handleFireAction()
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

    // Crafting toggle
    if (e.code === 'KeyC') {
      if (this.state === 'playing') {
        this.openCrafting()
      } else if (this.state === 'crafting') {
        this.closeCrafting()
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
    if (this.state === 'crafting') {
      this.closeCrafting()
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

    // Apply damage per-swing (TreeManager ignores falling/cut).
    // Durability: consume 1 per valid hit that deals damage.
    const meta = this.inventory.getFirstMeta(ItemId.AXE)
    if (!meta || meta.dur <= 0) {
      this.ui.toast('Seu machado quebrou.', 1100)
      this.inventory.removeOne(ItemId.AXE)
      this.setTool('hand')
      this._cleanupHotbarBroken(ItemId.AXE)
      return
    }

    const dmg = this.axeDamage
    const dmgResult = this.trees.damage(hit.treeId, dmg, this.player.position)
    if (!dmgResult) return

    this.inventory.setFirstMeta(ItemId.AXE, { dur: Math.max(0, meta.dur - 1) })
    if (meta.dur - 1 <= 0) {
      this.ui.toast('Machado quebrou!', 1200)
      this.inventory.removeOne(ItemId.AXE)
      this.setTool('hand')
      this._cleanupHotbarBroken(ItemId.AXE)
    }

    // Floating damage number near impact point.
    const p = hit.point
    p.y += 0.25
    this.damageNumbers.spawn(p, `-${dmg}`)

    // Only when HP reaches 0: count as cut + loot.
    if (!dmgResult.cut) return

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

    const msg = dropped.length
      ? `Loot: +1 tronco, +${sticks} galhos, +${leaves} folhas (excedente descartado)`
      : `Loot: +1 tronco, +${sticks} galhos, +${leaves} folhas`

    this.sfx.chop()
    this.ui.toast(msg, 1400)

    if (this.state === 'inventory') this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
  }

  _randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  async playFromMenu() {
    this.score = 0
    this.ui.setScore(0)
    this.inventory.clear()

    // Start with one axe so the game is playable; torch comes from crafting.
    this.inventory.add(ItemId.AXE, 1, { dur: DURABILITY.AXE_MAX, maxDur: DURABILITY.AXE_MAX })

    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

    this.trees.resetAll()
    this.rocks?.resetAll?.()
    this.fires.resetAll()
    this.player.reset()

    this.selectHotbar(0)

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
    this.inventory.add(ItemId.AXE, 1, { dur: DURABILITY.AXE_MAX, maxDur: DURABILITY.AXE_MAX })
    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])

    this.trees.resetAll()
    this.fires.resetAll()
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
    this.inventory.add(ItemId.AXE, 1, { dur: DURABILITY.AXE_MAX, maxDur: DURABILITY.AXE_MAX })
    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])

    this.trees.resetAll()
    this.fires.resetAll()
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

  openCrafting() {
    if (this.state !== 'playing') return
    this.state = 'crafting'

    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    this.ui.renderCrafting(RECIPES, (id) => this.inventory.count(id), (id) => ITEMS[id], (rid) => this.craft(rid))
    this.ui.showCrafting()
  }

  closeCrafting() {
    if (this.state !== 'crafting') return
    this.state = 'playing'

    this.ui.hideCrafting()
    this.ui.showHUD()

    this._lockPointer()
  }

  craft(recipeId) {
    const r = RECIPES.find((x) => x.id === recipeId)
    if (!r) return

    const can = r.cost.every((c) => this.inventory.count(c.id) >= c.qty)
    if (!can) {
      this.ui.toast('Faltam recursos.', 900)
      return
    }

    // debit
    for (const c of r.cost) this.inventory.remove(c.id, c.qty)

    // add output
    const overflow = this.inventory.add(r.output.id, r.output.qty, r.output.meta)
    if (overflow) {
      this.ui.toast('Inventário cheio: item descartado.', 1200)
    } else {
      this.ui.toast(`Construído: ${r.name}`, 1000)
    }

    // refresh crafting/inventory UIs
    if (this.state === 'crafting') {
      this.ui.renderCrafting(RECIPES, (id) => this.inventory.count(id), (id) => ITEMS[id], (rid) => this.craft(rid))
    }
    if (this.state === 'inventory') this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])

    // If crafted a tool, allow equipping.
    this.ui.setHotbarActive(this.tool)
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

  _getHotbarItemDef(id) {
    if (id === 'hand') return { icon: '✋', stackable: false }
    return ITEMS[id]
  }

  setTool(tool) {
    // Direct tool switch (used by break logic). Does not change hotbar bindings.
    this.tool = tool
    const modelTool = tool === 'campfire' ? 'hand' : tool
    this.player.setTool(modelTool)
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
  }

  selectHotbar(idx) {
    if (idx < 0 || idx >= this.hotbar.length) return
    this.hotbarActive = idx

    const itemId = this.hotbar[idx]?.itemId
    let tool = 'hand'
    if (itemId === ItemId.AXE) tool = 'axe'
    else if (itemId === ItemId.TORCH) tool = 'torch'
    else if (itemId === ItemId.CAMPFIRE) tool = 'campfire'

    // Validate inventory for bound items.
    if (tool === 'axe' && this.inventory.count(ItemId.AXE) <= 0) tool = 'hand'
    if (tool === 'torch' && this.inventory.count(ItemId.TORCH) <= 0) tool = 'hand'
    if (tool === 'campfire' && this.inventory.count(ItemId.CAMPFIRE) <= 0) tool = 'hand'

    this.setTool(tool)

    if (this.state === 'playing') {
      const msg = tool === 'axe' ? 'Machado equipado.' : tool === 'torch' ? 'Tocha equipada.' : tool === 'campfire' ? 'Fogueira selecionada.' : 'Mão equipada.'
      this.ui.toast(msg, 900)
    }
  }

  bindHotbar(hotIdx, invIdx) {
    const s = this.inventory.slots[invIdx]
    if (!s) return

    const def = ITEMS[s.id]
    if (def?.stackable) {
      this.ui.toast('Arraste um item (ferramenta) não-stackável.', 1100)
      return
    }

    if (hotIdx < 0 || hotIdx >= this.hotbar.length) return
    this.hotbar[hotIdx] = { itemId: s.id }

    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
  }

  _cleanupHotbarBroken(itemId) {
    for (let i = 0; i < this.hotbar.length; i++) {
      if (this.hotbar[i]?.itemId === itemId) this.hotbar[i] = null
    }
    if (this.hotbar[this.hotbarActive] == null) {
      // fallback to hand slot if exists
      this.tool = 'hand'
      this.player.setTool('hand')
    }
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
  }

  _handleFireAction() {
    if (this.state !== 'playing') return
    if (document.pointerLockElement !== this.canvas) return

    // If campfire selected: place it.
    if (this.tool === 'campfire') {
      if (this.inventory.count(ItemId.CAMPFIRE) <= 0) {
        this.ui.toast('Você não tem uma fogueira.', 900)
        return
      }

      // Place in front of player on ground (y=0 plane).
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
      const p = this.player.position
      const pos = { x: p.x + dir.x * 1.4, y: 0, z: p.z + dir.z * 1.4 }

      this.fires.place(pos)
      this.inventory.removeOne(ItemId.CAMPFIRE)
      this.ui.toast('Fogueira colocada.', 900)

      if (this.inventory.count(ItemId.CAMPFIRE) <= 0) this._cleanupHotbarBroken(ItemId.CAMPFIRE)
      return
    }

    // Otherwise interact with nearest placed fire.
    const near = this.fires.getNearest({ x: this.player.position.x, z: this.player.position.z }, 2.0)
    if (!near) {
      this.ui.toast('Nenhuma fogueira perto.', 800)
      return
    }

    if (this.tool === 'torch') {
      // Need torch that isn't broken.
      const tmeta = this.inventory.getFirstMeta(ItemId.TORCH)
      if (!tmeta || tmeta.dur <= 0) {
        this.ui.toast('Sua tocha apagou.', 900)
        return
      }
      if (this.fires.isLit(near.id)) {
        this.ui.toast('Já está acesa.', 800)
        return
      }
      this.fires.setLit(near.id, true)
      this.ui.toast('Fogueira acesa.', 900)
      return
    }

    if (this.tool === 'hand') {
      if (!this.fires.isLit(near.id)) {
        this.ui.toast('Já está apagada.', 800)
        return
      }
      this.fires.setLit(near.id, false)
      this.ui.toast('Fogueira apagada.', 900)
      return
    }

    this.ui.toast('Use tocha para acender, mão para apagar.', 1100)
  }

  _tryInteract() {
    if (this.state !== 'playing') return
    if (document.pointerLockElement !== this.canvas) return

    if (this.tool !== 'hand') {
      this.ui.toast('Equipe a mão (hotbar) para coletar pedras.', 1100)
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

    // Torch durability + light intensity (mainly useful at night)
    const night = 1 - this.time.getDayFactor()
    const torchOn = this.tool === 'torch'

    // Durability drains while equipped.
    if (simDt > 0 && torchOn) {
      this._torchTick += simDt
      if (this._torchTick >= 1.0) {
        this._torchTick = 0
        const tmeta = this.inventory.getFirstMeta(ItemId.TORCH)
        if (!tmeta || tmeta.dur <= 0) {
          this.ui.toast('Tocha apagou (quebrou).', 1300)
          this.inventory.removeOne(ItemId.TORCH)
          this.setTool('hand')
          this._cleanupHotbarBroken(ItemId.TORCH)
        } else {
          this.inventory.setFirstMeta(ItemId.TORCH, { dur: Math.max(0, tmeta.dur - 1) })
        }
      }
    }

    const flicker = 0.90 + 0.10 * Math.sin(performance.now() * 0.018) + 0.05 * Math.sin(performance.now() * 0.041)

    const targetSpot = torchOn ? (1.0 + night * 2.2) * flicker : 0.0
    const targetPoint = torchOn ? (0.25 + night * 0.85) * flicker : 0.0

    this.torchSpot.intensity += (targetSpot - this.torchSpot.intensity) * (simDt > 0 ? 0.25 : 0.0)
    this.torchPoint.intensity += (targetPoint - this.torchPoint.intensity) * (simDt > 0 ? 0.25 : 0.0)

    // Sync flame visuals with the same flicker signal.
    this.player.setTorchFlicker(flicker, torchOn ? night : 0)

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
    this.fires.update(simDt)

    this.ui.setTime({
      hhmm: this.time.getHHMM(),
      norm: this.time.norm,
      dayFactor: this.time.getDayFactor(),
      proximity: this.time.getTransitionProximity(),
    })

    this.damageNumbers.update(simDt, this.camera)

    this.ui.update()

    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this._loop)
  }
}
