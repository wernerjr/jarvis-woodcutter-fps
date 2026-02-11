import * as THREE from 'three'
import { Renderer } from './Renderer.js'
import { World } from './World.js'
import { Player } from './Player.js'
import { TreeManager } from './TreeManager.js'
import { RockManager } from './RockManager.js'
import { CampfireManager } from './CampfireManager.js'
import { MineManager } from './MineManager.js'
import { OreManager } from './OreManager.js'
import { Sfx } from './Sfx.js'
import { clamp } from './util.js'
import { Inventory } from './Inventory.js'
import { ITEMS, ItemId } from './items.js'
import { TimeSystem } from './TimeSystem.js'
import { Perf } from './Perf.js'
import { DamageNumbers } from './DamageNumbers.js'
import { RECIPES, DURABILITY } from './recipes.js'
import { CampfireGhost } from './CampfireGhost.js'
import { raycastGround } from './raycastGround.js'

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
    this.mine = new MineManager({ scene: this.scene })
    this.ores = new OreManager({ scene: this.scene })
    this.sfx = new Sfx()

    this.pickaxeDamage = 10

    this.inventory = new Inventory({ slots: 20, maxStack: 100 })
    this.time = new TimeSystem({ startHours: 9.0 })
    this.perf = new Perf()
    this.perfEnabled = false

    this.damageNumbers = new DamageNumbers({ container: document.querySelector('#floaters') })

    this.axeDamage = 12

    this._placingCampfire = false
    this._ghost = new CampfireGhost()
    this.scene.add(this._ghost.mesh)
    this._ghostX = 0
    this._ghostZ = 0
    this._ghostValid = false

    // Tool durability state
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

    // Hotbar items (separate container). Slot 0 is fixed hand.
    this.hotbar = Array.from({ length: 10 }, (_, i) => (i === 0 ? { id: 'hand', qty: 1 } : null))
    this.hotbarActive = 0

    this.tool = 'axe'

    this._actionHeld = false
    this._actionCooldown = 0

    this._baseFov = 75

    this._pendingDeleteIdx = null
    this._pendingDeleteUntil = 0

    this._pendingRelockUntil = 0

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

    this.mine.init()
    this.ores.init({ points: this.mine.getOreSpawnPoints() })

    // Swing impacts trigger hit detection in a narrow window.
    this.player.onImpact(() => {
      if (this.state !== 'playing') return
      if (document.pointerLockElement !== this.canvas) return

      if (this.tool === 'axe') this._tryChop()
      else if (this.tool === 'pickaxe') this._tryMine()
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

    // If lock is lost while playing (native ESC), pause and show pause menu.
    if (!locked && this.state === 'playing') {
      this.pause('pointerlock')
      return
    }
  }

  _onKeyDownAny(e) {
    // Hotbar slots (1-0 => idx 0-9)
    if (e.code === 'Digit1') return void this.selectHotbar(0)
    if (e.code === 'Digit2') return void this.selectHotbar(1)
    if (e.code === 'Digit3') return void this.selectHotbar(2)
    if (e.code === 'Digit4') return void this.selectHotbar(3)
    if (e.code === 'Digit5') return void this.selectHotbar(4)
    if (e.code === 'Digit6') return void this.selectHotbar(5)
    if (e.code === 'Digit7') return void this.selectHotbar(6)
    if (e.code === 'Digit8') return void this.selectHotbar(7)
    if (e.code === 'Digit9') return void this.selectHotbar(8)
    if (e.code === 'Digit0') return void this.selectHotbar(9)

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
      // ESC from pause-controls returns directly to gameplay.
      this.resume()
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

    // ESC does not close "modals" (inventory/crafting/controls). Use buttons.
    if (this.state === 'inventory' || this.state === 'crafting' || this.state === 'controls-menu' || this.state === 'controls-pause') {
      return
    }
  }

  _onMouseDownAny(e) {
    if (this.state !== 'playing') return
    if (document.pointerLockElement !== this.canvas) return

    // Left mouse: campfire placement hold
    if (e.button === 0) {
      if (this.tool === 'campfire' && this.hotbarActive !== 0) {
        this._placingCampfire = true
        this._ghost.setVisible(true)
        return
      }
    }

    if (e.button !== 0) return
    this._actionHeld = true
  }

  _onMouseUpAny(e) {
    if (this.state !== 'playing') return

    if (e.button === 0 && this._placingCampfire) {
      this._placingCampfire = false
      this._ghost.setVisible(false)
      if (this._ghostValid) this._placeCampfireAtGhost()
      return
    }

    if (e.button !== 0) return
    this._actionHeld = false
  }

  _tryMine() {
    const hit = this.ores.raycastFromCamera(this.camera)
    if (!hit) {
      this.sfx.click()
      return
    }

    if (hit.distance > 3.0) {
      this.ui.toast('Muito longe.')
      this.sfx.click()
      return
    }

    const slot = this.hotbar[this.hotbarActive]
    const meta = slot?.meta
    if (!slot || slot.id !== ItemId.PICKAXE || !meta || meta.dur <= 0) {
      this.ui.toast('Sua picareta quebrou.', 1100)
      this.hotbar[this.hotbarActive] = null
      this._cleanupHotbarBroken(ItemId.PICKAXE, this.hotbarActive)
      return
    }

    const dmg = this.pickaxeDamage
    const r = this.ores.damage(hit.oreId, dmg)
    if (!r) return

    meta.dur = Math.max(0, meta.dur - 1)
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
    if (meta.dur <= 0) {
      this.ui.toast('Picareta quebrou!', 1200)
      this.hotbar[this.hotbarActive] = null
      this._cleanupHotbarBroken(ItemId.PICKAXE, this.hotbarActive)
    }

    const p = hit.point
    p.y += 0.18
    this.damageNumbers.spawn(p, `-${dmg}`)

    this.sfx.mine()

    if (!r.broke) return

    const overflow = this.inventory.add(ItemId.IRON_ORE, 2)
    if (overflow) {
      this.ui.toast('Inventário cheio: minério descartado.', 1200)
      this.sfx.click()
    } else {
      this.ui.toast('Loot: +2 minério de ferro', 1100)
      this.sfx.pickup()
      if (this.state === 'inventory') this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
    }
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
    // Durability: consume 1 per valid hit that deals damage (equipped axe).
    const axeSlot = this.hotbar[this.hotbarActive]
    const meta = axeSlot?.meta
    if (!axeSlot || axeSlot.id !== ItemId.AXE || !meta || meta.dur <= 0) {
      this.ui.toast('Seu machado quebrou.', 1100)
      this.hotbar[this.hotbarActive] = null
      this._cleanupHotbarBroken(ItemId.AXE, this.hotbarActive)
      return
    }

    const dmg = this.axeDamage
    const dmgResult = this.trees.damage(hit.treeId, dmg, this.player.position)
    if (!dmgResult) return

    meta.dur = Math.max(0, meta.dur - 1)
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
    if (meta.dur <= 0) {
      this.ui.toast('Machado quebrou!', 1200)
      this.hotbar[this.hotbarActive] = null
      this._cleanupHotbarBroken(ItemId.AXE, this.hotbarActive)
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

    // Start with one axe equipped in hotbar slot 2.
    this.hotbar[1] = { id: ItemId.AXE, qty: 1, meta: { dur: DURABILITY.AXE_MAX, maxDur: DURABILITY.AXE_MAX } }

    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

    this.trees.resetAll()
    this.rocks?.resetAll?.()
    this.fires.resetAll()
    this.ores.resetAll()
    this.ores.init({ points: this.mine.getOreSpawnPoints() })
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

    // Show cursor by opening UI (not by ESC directly)
    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    this.ui.showPause()
    if (reason === 'pointerlock') this.ui.toast('Pausado (mouse destravado).')
  }

  async returnToGameMode() {
    // Centralized UI exit -> gameplay, with best-effort pointer lock restore.
    this.state = 'playing'

    this.ui.hideInventory?.()
    this.ui.hideCrafting?.()
    this.ui.showHUD()

    await this.sfx.enable()

    // ESC can make browsers picky; retry quickly and also arm a fallback on next click.
    this._pendingRelockUntil = performance.now() + 1200
    this._attemptRelock()
    setTimeout(() => this._attemptRelock(), 50)
    setTimeout(() => this._attemptRelock(), 250)
  }

  async resume() {
    if (this.state !== 'paused') return
    await this.returnToGameMode()
  }

  restart() {
    // Restart from pause: reset score + world and keep in playing state.
    this.score = 0
    this.ui.setScore(0)
    this.inventory.clear()

    this.hotbar = Array.from({ length: 10 }, (_, i) => (i === 0 ? { id: 'hand', qty: 1 } : null))
    this.hotbar[1] = { id: ItemId.AXE, qty: 1, meta: { dur: DURABILITY.AXE_MAX, maxDur: DURABILITY.AXE_MAX } }
    this.hotbarActive = 0

    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

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

    this.hotbar = Array.from({ length: 10 }, (_, i) => (i === 0 ? { id: 'hand', qty: 1 } : null))
    this.hotbar[1] = { id: ItemId.AXE, qty: 1, meta: { dur: DURABILITY.AXE_MAX, maxDur: DURABILITY.AXE_MAX } }
    this.hotbarActive = 0

    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

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

  async relock() {
    // Called from relock overlay button.
    if (this.state !== 'relock') return
    await this.returnToGameMode()
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

    // Show cursor by opening UI
    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
    this.ui.showInventory()
  }

  openCrafting() {
    if (this.state !== 'playing') return
    this.state = 'crafting'

    // Show cursor by opening UI
    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    this.ui.renderCrafting(RECIPES, (id) => this.inventory.count(id), (id) => ITEMS[id], (rid) => this.craft(rid))
    this.ui.showCrafting()
  }

  async closeCrafting() {
    if (this.state !== 'crafting') return
    await this.returnToGameMode()
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
    await this.returnToGameMode()
  }

  tryClose() {
    // Best-effort: browsers usually block window.close if not opened by script.
    window.close()
    this.ui.toast('Se não fechar, use a aba do navegador para sair.', 1800)
  }

  _attemptRelock() {
    if (this.state !== 'playing') return
    if (document.pointerLockElement === this.canvas) return

    this.canvas.focus()
    try {
      this.canvas.requestPointerLock()
    } catch {
      // ignore
    }
  }

  async _lockPointer() {
    this._attemptRelock()
  }

  _getHotbarItemDef(id) {
    if (id === 'hand') return { icon: '✋', stackable: false }
    return ITEMS[id]
  }

  setTool(tool) {
    this.tool = tool
    const modelTool = tool === 'campfire' ? 'hand' : tool
    this.player.setTool(modelTool)
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
  }

  selectHotbar(idx) {
    if (idx < 0 || idx >= this.hotbar.length) return
    this.hotbarActive = idx

    if (idx === 0) {
      this.setTool('hand')
      return
    }

    const s = this.hotbar[idx]
    if (!s) {
      this.setTool('hand')
      return
    }

    // Tool resolution
    if (s.id === ItemId.AXE) this.setTool('axe')
    else if (s.id === ItemId.PICKAXE) this.setTool('pickaxe')
    else if (s.id === ItemId.TORCH) this.setTool('torch')
    else if (s.id === ItemId.CAMPFIRE) this.setTool('campfire')
    else this.setTool('hand')

    if (this.state === 'playing') {
      const msg = this.tool === 'axe' ? 'Machado equipado.' : this.tool === 'pickaxe' ? 'Picareta equipada.' : this.tool === 'torch' ? 'Tocha equipada.' : this.tool === 'campfire' ? 'Fogueira selecionada.' : 'Mão equipada.'
      this.ui.toast(msg, 900)
    }
  }

  /**
   * Move items between inventory and hotbar.
   * @param {{from:'inv'|'hot', idx:number}} from
   * @param {{to:'inv'|'hot', idx:number}} to
   */
  moveItem(from, to) {
    if (!from || !to) return

    const get = (loc) => {
      if (loc === 'inv') return this.inventory.slots
      return this.hotbar
    }

    const srcArr = get(from.from)
    const dstArr = get(to.to)
    const sIdx = from.idx
    const dIdx = to.idx

    if (from.from === 'hot' && sIdx === 0) return
    if (to.to === 'hot' && dIdx === 0) return

    const src = srcArr[sIdx]
    if (!src) return

    const dst = dstArr[dIdx]

    // No-op if same.
    if (srcArr === dstArr && sIdx === dIdx) return

    const srcDef = this._getHotbarItemDef(src.id)
    const dstDef = dst ? this._getHotbarItemDef(dst.id) : null

    // Merge stackables if same id and destination has room.
    if (dst && src.id === dst.id && srcDef?.stackable) {
      const space = this.inventory.maxStack - dst.qty
      if (space > 0) {
        const take = Math.min(space, src.qty)
        dst.qty += take
        src.qty -= take
        if (src.qty <= 0) srcArr[sIdx] = null
        this._postMoveUpdate(sIdx, dIdx)
        return
      }
    }

    // Swap
    srcArr[sIdx] = dst || null
    dstArr[dIdx] = src

    this._postMoveUpdate(sIdx, dIdx)
  }

  _postMoveUpdate() {
    // Keep hand fixed.
    this.hotbar[0] = { id: 'hand', qty: 1 }

    // Re-render if inventory open.
    if (this.state === 'inventory') {
      this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
      this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
    } else {
      this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
    }

    // If active slot is now empty, fallback to hand.
    if (this.hotbarActive !== 0 && !this.hotbar[this.hotbarActive]) {
      this.selectHotbar(0)
    } else {
      this.selectHotbar(this.hotbarActive)
    }
  }

  _updateCampfireGhost() {
    const p = raycastGround(this.camera)
    if (!p) {
      this._ghostValid = false
      this._ghost.setValid(false)
      return
    }

    // Snap slightly
    const x = Math.round(p.x * 10) / 10
    const z = Math.round(p.z * 10) / 10
    this._ghostX = x
    this._ghostZ = z

    // Validity rules: not too close to player or other fires.
    const dx = x - this.player.position.x
    const dz = z - this.player.position.z
    const d = Math.hypot(dx, dz)

    const nearFire = this.fires.getNearest({ x, z }, 1.2)

    const ok = d >= 1.0 && !nearFire
    this._ghostValid = ok
    this._ghost.setValid(ok)
    this._ghost.setPos(x, z)
  }

  _placeCampfireAtGhost() {
    const slot = this.hotbar[this.hotbarActive]
    if (!slot || slot.id !== ItemId.CAMPFIRE) return

    this.fires.place({ x: this._ghostX, y: 0, z: this._ghostZ })

    // Consume only the currently selected hotbar stack.
    slot.qty = Math.max(0, (slot.qty ?? 1) - 1)
    if (slot.qty <= 0) this.hotbar[this.hotbarActive] = null

    this.ui.toast('Fogueira colocada.', 900)
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

    // Do not clear other campfires bound to other slots.
    if (!this.hotbar[this.hotbarActive]) this.selectHotbar(0)
  }

  _cleanupHotbarBroken(itemId, onlyIdx = null) {
    if (typeof onlyIdx === 'number') {
      if (onlyIdx !== 0 && this.hotbar[onlyIdx]?.id === itemId) this.hotbar[onlyIdx] = null
    } else {
      for (let i = 1; i < this.hotbar.length; i++) {
        if (this.hotbar[i]?.id === itemId) this.hotbar[i] = null
      }
    }
    this._postMoveUpdate()
  }

  _handleFireAction() {
    if (this.state !== 'playing') return
    if (document.pointerLockElement !== this.canvas) return

    // Campfire placement is now mouse-hold + ghost; F only toggles light/extinguish.
    if (this.tool === 'campfire') {
      this.ui.toast('Segure o botão direito para posicionar a fogueira.', 1100)
      return
    }

    // Otherwise interact with nearest placed fire.
    const near = this.fires.getNearest({ x: this.player.position.x, z: this.player.position.z }, 2.0)
    if (!near) {
      this.ui.toast('Nenhuma fogueira perto.', 800)
      return
    }

    if (this.tool === 'torch') {
      // Need equipped torch that isn't broken.
      const tslot = this.hotbar[this.hotbarActive]
      const tmeta = tslot?.meta
      if (!tslot || tslot.id !== ItemId.TORCH || !tmeta || tmeta.dur <= 0) {
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

    // Ghost placement update
    if (simDt > 0 && this._placingCampfire) {
      this._updateCampfireGhost()
    }

    const colliders = this.state === 'playing' ? this.trees.getTrunkColliders().concat(this.mine.getColliders()) : []

    this.player.update(simDt, colliders)

    // Torch durability + light intensity (mainly useful at night)
    const night = 1 - this.time.getDayFactor()
    const torchOn = this.tool === 'torch'

    // Durability drains while equipped.
    if (simDt > 0 && torchOn) {
      this._torchTick += simDt
      if (this._torchTick >= 1.0) {
        this._torchTick = 0
        const tslot = this.hotbar[this.hotbarActive]
        const tmeta = tslot?.meta
        if (!tslot || tslot.id !== ItemId.TORCH || !tmeta || tmeta.dur <= 0) {
          this.ui.toast('Tocha apagou (quebrou).', 1300)
          this.hotbar[this.hotbarActive] = null
          this._cleanupHotbarBroken(ItemId.TORCH, this.hotbarActive)
        } else {
          tmeta.dur = Math.max(0, tmeta.dur - 1)
          this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
          if (tmeta.dur <= 0) {
            this.ui.toast('Tocha apagou (quebrou).', 1300)
            this.hotbar[this.hotbarActive] = null
            this._cleanupHotbarBroken(ItemId.TORCH, this.hotbarActive)
          }
        }
      }
    }

    const flicker = 0.90 + 0.10 * Math.sin(performance.now() * 0.018) + 0.05 * Math.sin(performance.now() * 0.041)

    // Torch baseline brightness signal (used for campfire target = 3x).
    const torchMain = (1.6 + night * 3.0) * flicker

    const targetSpot = torchOn ? torchMain : 0.0
    const targetPoint = torchOn ? torchMain * 0.55 : 0.0

    this.torchSpot.intensity += (targetSpot - this.torchSpot.intensity) * (simDt > 0 ? 0.25 : 0.0)
    this.torchPoint.intensity += (targetPoint - this.torchPoint.intensity) * (simDt > 0 ? 0.25 : 0.0)

    // Provide baseline to campfire (so it can be ~3x torch brightness).
    this.fires.setTorchMain(torchMain)

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
      } else if (this.tool === 'axe' || this.tool === 'pickaxe') {
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
    this.ores.update(simDt)

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
