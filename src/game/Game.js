import * as THREE from 'three'
import { Renderer } from './Renderer.js'
import { World } from './World.js'
import { Player } from './Player.js'
import { TreeManager } from './TreeManager.js'
import { RockManager } from './RockManager.js'
import { GrassManager } from './GrassManager.js'
import { RiverManager } from './RiverManager.js'
import { LakeManager } from './LakeManager.js'
import { CampfireManager } from './CampfireManager.js'
import { ForgeManager } from './ForgeManager.js'
import { ForgeTableManager } from './ForgeTableManager.js'
import { MineManager } from './MineManager.js'
import { OreManager } from './OreManager.js'
import { Sfx } from './Sfx.js'
import { clamp } from './util.js'
import { Inventory } from './Inventory.js'
import { ITEMS, ItemId } from './items.js'
import { TimeSystem } from './TimeSystem.js'
import { Perf } from './Perf.js'
import { DamageNumbers } from './DamageNumbers.js'
import { RECIPES, DURABILITY, FORGE_TABLE_RECIPES, TOOL_STATS } from './recipes.js'
import { CampfireGhost } from './CampfireGhost.js'
import { ForgeGhost } from './ForgeGhost.js'
import { ForgeTableGhost } from './ForgeTableGhost.js'
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
    this.grass = new GrassManager({ scene: this.scene })
    this.river = new RiverManager({ scene: this.scene })
    this.lake = new LakeManager({ scene: this.scene })

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
    this.forges = new ForgeManager({ scene: this.scene })
    this.forgeTables = new ForgeTableManager({ scene: this.scene })
    this.mine = new MineManager({ scene: this.scene })
    this.ores = new OreManager({ scene: this.scene })

    this._inMine = false
    this._fadeEl = null
    this._fade = { active: false, t: 0, dur: 0.22, phase: 'in' }
    this.sfx = new Sfx()

    this.pickaxeDamage = 10

    this.inventory = new Inventory({ slots: 20, maxStack: 100 })
    this.time = new TimeSystem({ startHours: 9.0 })
    this.perf = new Perf()
    this.perfEnabled = false

    this.damageNumbers = new DamageNumbers({ container: document.querySelector('#floaters') })

    this.axeDamage = 12

    this._placingCampfire = false
    this._placingForge = false
    this._placingForgeTable = false

    this._activeForgeId = null
    this._activeForgeTableId = null

    this._ghost = new CampfireGhost()
    this._forgeGhost = new ForgeGhost()
    this._forgeTableGhost = new ForgeTableGhost()

    this.scene.add(this._ghost.mesh)
    this.scene.add(this._forgeGhost.mesh)
    this.scene.add(this._forgeTableGhost.mesh)

    this._ghostX = 0
    this._ghostZ = 0
    this._ghostValid = false

    // Tool durability state
    this._axeBroken = false
    this._torchBroken = false
    this._torchTick = 0

    this.score = 0
    this._running = false

    /** @type {'menu'|'playing'|'paused'|'inventory'|'crafting'|'forge'|'forgeTable'|'wheel'|'controls-menu'|'controls-pause'} */
    this.state = 'menu'

    this._onResize = () => this._resize()
    this._onPointerLockChange = () => this._onPlockChange()
    this._onMouseDown = (e) => this._onMouseDownAny(e)
    this._onMouseUp = (e) => this._onMouseUpAny(e)
    this._onCanvasClick = (e) => this._onCanvasClickAny(e)

    this._suppressMouseDownUntil = 0

    // Hotbar items (separate container). Slot 0 is fixed hand.
    this.hotbar = Array.from({ length: 10 }, (_, i) => (i === 0 ? { id: 'hand', qty: 1 } : null))
    this.hotbarActive = 0

    this.tool = 'hand'

    this._actionHeld = false
    this._actionCooldown = 0

    this._baseFov = 75

    this._pendingDeleteIdx = null
    this._pendingDeleteUntil = 0

    this._pendingRelockUntil = 0

    // F interaction (tap vs hold wheel)
    this._fDown = false
    this._fDownAt = 0
    this._fHoldTimer = 0
    this._wheelOpen = false
    this._wheelAction = null
    this._wheelTarget = null
    this._wheelActions = []

    this._onKeyDown = (e) => this._onKeyDownAny(e)
    this._onKeyUp = (e) => this._onKeyUpAny(e)
    this._onMouseMoveUI = (e) => this._onMouseMoveUIAny(e)
  }

  start() {
    this._resize()
    window.addEventListener('resize', this._onResize)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('mousemove', this._onMouseMoveUI)

    // Mouse button: hold-to-act
    this.canvas.addEventListener('mousedown', this._onMouseDown)
    window.addEventListener('mouseup', this._onMouseUp)

    // UX: if we're in playing mode but pointer lock is not active (cursor visible),
    // a single click should re-enter the game (request pointer lock).
    this.canvas.addEventListener('click', this._onCanvasClick)
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    this.world.init()
    // Player rig (yaw->pitch->camera)
    this.scene.add(this.player.yaw)

    this.trees.init({ seed: 1337, count: 42, radius: 42 })
    this.rocks.init({ seed: 2026, count: 32, radius: 45 })

    this.mine.init()
    // Hide interior while in the world (prevents reaching it by walking out of bounds).
    this.mine.setInteriorVisible(false)

    this.ores.init({ points: this.mine.getOreSpawnPoints() })
    // Ores belong to the mine interior; hide them while outside.
    this.ores.setVisible(false)

    this.grass.init({ seed: 909, radius: 92 })
    this.river.init({ radius: 96, width: 8, segments: 240 })
    // Lake patch near the river seam to remove the perceived "end" of the river.
    // Keep it small (close to river width) and slightly organic.
    this.lake.init({ center: { x: 102, z: 0 }, baseR: 6.2 })

    this._ensureFadeOverlay()

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
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('mousemove', this._onMouseMoveUI)
    this.canvas.removeEventListener('mousedown', this._onMouseDown)
    window.removeEventListener('mouseup', this._onMouseUp)
    this.canvas.removeEventListener('click', this._onCanvasClick)
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

    // Interaction wheel (tap/hold)
    if (e.code === 'KeyF') {
      this._onFDown(e)
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

    if (this.state === 'wheel') {
      // Close wheel safely (no action)
      this._closeWheel(false)
      return
    }

    // ESC does not close "modals" (inventory/crafting/forge/forgeTable/wheel/controls). Use buttons.
    if (
      this.state === 'inventory' ||
      this.state === 'crafting' ||
      this.state === 'forge' ||
      this.state === 'forgeTable' ||
      this.state === 'wheel' ||
      this.state === 'controls-menu' ||
      this.state === 'controls-pause'
    ) {
      return
    }
  }

  _onKeyUpAny(e) {
    if (e.code === 'KeyF') {
      this._onFUp(e)
    }
  }

  _onMouseMoveUIAny(e) {
    if (!this._wheelOpen) return
    this._updateWheelSelectionFromMouse(e.clientX, e.clientY)
  }

  _onFDown(e) {
    if (this._fDown) return
    if (this.state !== 'playing') return
    if (document.pointerLockElement !== this.canvas) return

    const t = this._getInteractTarget()
    if (!t) return

    this._fDown = true
    this._fDownAt = performance.now()
    this._wheelTarget = t
    this._wheelAction = null

    // Hold threshold: open wheel (only if still aiming at a valid target).
    this._fHoldTimer = window.setTimeout(() => {
      if (!this._fDown) return
      if (this.state !== 'playing') return
      const nowT = this._getInteractTarget()
      if (!nowT || nowT.kind !== t.kind || nowT.id !== t.id) return
      this._openWheel(nowT)
    }, 360)

    e.preventDefault?.()
  }

  _onFUp(e) {
    if (!this._fDown) return
    this._fDown = false
    if (this._fHoldTimer) {
      clearTimeout(this._fHoldTimer)
      this._fHoldTimer = 0
    }

    // If wheel is open, execute selection.
    if (this._wheelOpen) {
      this._closeWheel(true)
      e.preventDefault?.()
      return
    }

    // If we released F without still aiming at the target, do nothing.
    const target = this._wheelTarget
    const nowT = this._getInteractTarget()
    this._wheelTarget = null
    if (!target || !nowT || nowT.kind !== target.kind || nowT.id !== target.id) {
      e.preventDefault?.()
      return
    }

    // Tap: primary action.
    if (this.state === 'playing') this._interactPrimary(nowT)

    e.preventDefault?.()
  }

  _wheelActionsFor(target) {
    if (!target) return []

    if (target.kind === 'campfire') {
      const lit = this.fires.isLit(target.id)
      // No pickup for campfire.
      return [
        { id: 'primary', label: lit ? 'Apagar' : 'Acender' },
        { id: 'destroy', label: 'Destruir', danger: true },
      ]
    }

    // forge / forgeTable
    return [
      { id: 'open', label: 'Abrir' },
      { id: 'pickup', label: 'Recolher' },
      { id: 'destroy', label: 'Destruir', danger: true },
    ]
  }

  _openWheel(target) {
    const actions = this._wheelActionsFor(target)
    if (!actions.length) return

    this._wheelActions = actions

    this._wheelOpen = true
    this.state = 'wheel'

    // Release pointer lock so we can use mouse position.
    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    this.ui.setWheelActions?.(actions)
    this.ui.showWheel?.()
    this.ui.setInteractHint('Solte F em uma opção')

    // Default selection.
    this._wheelAction = null
  }

  _closeWheel(runAction) {
    const target = this._wheelTarget
    const action = this._wheelAction

    this._wheelOpen = false
    this._wheelAction = null
    this._wheelTarget = null
    this._wheelActions = []

    this.ui.hideWheel?.()
    this.ui.setInteractHint(null)

    // Back to game first (relock), then run action (may open UI).
    if (this.state === 'wheel') this.state = 'playing'

    if (runAction && target && action) {
      this._runWheelAction(target, action)
      return
    }

    // no action: return to game mode
    this.returnToGameMode()
  }

  _updateWheelSelectionFromMouse(x, y) {
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    const dx = x - cx
    const dy = y - cy

    // Selection is purely angular (radius ignored): any point within the slice selects it.
    // Degenerate case: exactly at center -> treat as pointing up.
    const d = Math.hypot(dx, dy)
    let ndx = dx
    let ndy = dy
    if (d < 0.001) {
      ndx = 0
      ndy = -1
    }

    const actions = this._wheelActions || []
    const n = actions.length
    if (!n) {
      this._wheelAction = null
      this.ui.setWheelActive?.(null)
      return
    }

    // Equal segments: 360 / N. Angle 0 = up.
    const ang = Math.atan2(ndy, ndx) // radians, 0 at right
    let deg = (ang * 180) / Math.PI
    deg = (deg + 450) % 360 // shift so 0 is up

    const step = 360 / n
    const idx = Math.floor(deg / step)
    const actionId = actions[idx]?.id || null

    this._wheelAction = actionId
    this.ui.setWheelActive?.(this._wheelAction)
  }

  _getInteractTarget() {
    if (this.state !== 'playing') return null
    if (document.pointerLockElement !== this.canvas) return null

    // Prefer raycast under reticle.
    let best = null

    const trySet = (kind, id, dist, primaryLabel) => {
      if (!id) return
      if (!best || dist < best.dist) best = { kind, id, dist, primaryLabel }
    }

    // Forge table
    if (!this._inMine) {
      const ft = this.forgeTables.raycastFromCamera(this.camera)
      if (ft && ft.distance <= 2.8) trySet('forgeTable', ft.forgeTableId, ft.distance, 'Abrir')

      const f = this.forges.raycastFromCamera(this.camera)
      if (f && f.distance <= 2.6) trySet('forge', f.forgeId, f.distance, 'Abrir')

      const c = this.fires.raycastFromCamera?.(this.camera)
      if (c && c.distance <= 2.6) {
        const lit = this.fires.isLit(c.campfireId)
        trySet('campfire', c.campfireId, c.distance, lit ? 'Apagar' : 'Acender')
      }
    }

    return best ? { kind: best.kind, id: best.id, primaryLabel: best.primaryLabel } : null
  }

  _interactPrimary(t) {
    if (!t) return
    if (t.kind === 'forge') return this.openForge(t.id)
    if (t.kind === 'forgeTable') return this.openForgeTable(t.id)
    if (t.kind === 'campfire') return this._campfireToggle(t.id)
  }

  _runWheelAction(t, action) {
    if (action === 'open') return this._interactPrimary(t)
    if (action === 'primary') {
      this._interactPrimary(t)
      // Campfire primary must keep gameplay mode (relock).
      if (t.kind === 'campfire') this.returnToGameMode()
      return
    }

    if (action === 'pickup') {
      const ok = this._pickupStructure(t)
      if (ok) this.returnToGameMode()
      return
    }

    if (action === 'destroy') {
      this._destroyStructure(t)
      this.returnToGameMode()
    }
  }

  _pickupStructure(t) {
    if (!t) return false
    if (t.kind === 'campfire') return false

    const itemId = t.kind === 'forge' ? ItemId.FORGE : t.kind === 'forgeTable' ? ItemId.FORGE_TABLE : null
    if (!itemId) return false

    const overflow = this.inventory.add(itemId, 1)
    if (overflow) {
      this.ui.toast('Inventário cheio.', 1000)
      return false
    }

    const removed = t.kind === 'forge' ? this.forges.remove(t.id) : t.kind === 'forgeTable' ? this.forgeTables.remove(t.id) : this.fires.remove(t.id)
    if (!removed) {
      // rollback add (best-effort)
      this.inventory.remove(itemId, 1)
      this.ui.toast('Falha ao recolher.', 1000)
      return false
    }

    this.ui.toast('Recolhido.', 900)
    return true
  }

  _destroyStructure(t) {
    if (!t) return
    if (t.kind === 'forge') this.forges.remove(t.id)
    else if (t.kind === 'forgeTable') this.forgeTables.remove(t.id)
    else if (t.kind === 'campfire') this.fires.remove(t.id)
    this.ui.toast('Destruído.', 900)
  }

  _campfireToggle(id) {
    // Light if holding torch, otherwise extinguish if lit.
    const lit = this.fires.isLit(id)

    if (!lit) {
      if (this.tool !== 'torch') {
        this.ui.toast('Equipe a tocha para acender.', 1100)
        return
      }
      const tslot = this.hotbar[this.hotbarActive]
      const tmeta = tslot?.meta
      if (!tslot || tslot.id !== ItemId.TORCH || !tmeta || tmeta.dur <= 0) {
        this.ui.toast('Sua tocha apagou.', 900)
        return
      }
      this.fires.setLit(id, true)
      this.ui.toast('Fogueira acesa.', 900)
      return
    }

    this.fires.setLit(id, false)
    this.ui.toast('Fogueira apagada.', 900)
  }

  _onCanvasClickAny(e) {
    if (this.state !== 'playing') return

    // Only relock when no modal/menu is open (state===playing), and we're currently unlocked.
    if (document.pointerLockElement === this.canvas) return

    // Request pointer lock (browser may require user gesture => click).
    this._attemptRelock()

    // Prevent this same click from also triggering a swing/place action via mousedown.
    this._suppressMouseDownUntil = performance.now() + 160

    e.preventDefault?.()
  }

  _onMouseDownAny(e) {
    if (this.state !== 'playing') return
    if (performance.now() < (this._suppressMouseDownUntil || 0)) return
    if (document.pointerLockElement !== this.canvas) return

    // Left mouse: placement hold
    if (e.button === 0) {
      if (this.tool === 'campfire' && this.hotbarActive !== 0) {
        this._placingCampfire = true
        this._ghost.setVisible(true)
        return
      }
      if (this.tool === 'forge' && this.hotbarActive !== 0 && !this._inMine) {
        this._placingForge = true
        this._forgeGhost.setVisible(true)
        return
      }
      if (this.tool === 'forgeTable' && this.hotbarActive !== 0 && !this._inMine) {
        this._placingForgeTable = true
        this._forgeTableGhost.setVisible(true)
        return
      }
    }

    if (e.button !== 0) return
    this._actionHeld = true
  }

  _onMouseUpAny(e) {
    // Always clear held action on mouseup, even when a UI is open.
    if (e.button === 0) this._actionHeld = false

    // Placement finalize only happens while playing.
    if (this.state !== 'playing') return

    if (e.button === 0 && this._placingCampfire) {
      this._placingCampfire = false
      this._ghost.setVisible(false)
      if (this._ghostValid) this._placeCampfireAtGhost()
      return
    }

    if (e.button === 0 && this._placingForge) {
      this._placingForge = false
      this._forgeGhost.setVisible(false)
      if (this._ghostValid) this._placeForgeAtGhost()
      return
    }

    if (e.button === 0 && this._placingForgeTable) {
      this._placingForgeTable = false
      this._forgeTableGhost.setVisible(false)
      if (this._ghostValid) this._placeForgeTableAtGhost()
      return
    }
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
    const isPick = slot?.id === ItemId.PICKAXE_STONE || slot?.id === ItemId.PICKAXE_METAL
    if (!slot || !isPick || !meta || meta.dur <= 0) {
      this.ui.toast('Sua picareta quebrou.', 1100)
      this.hotbar[this.hotbarActive] = null
      if (slot?.id) this._cleanupHotbarBroken(slot.id, this.hotbarActive)
      return
    }

    const dmg = Number(meta?.dmg ?? this.pickaxeDamage)
    const r = this.ores.damage(hit.oreId, dmg)
    if (!r) return

    meta.dur = Math.max(0, meta.dur - 1)
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
    if (meta.dur <= 0) {
      this.ui.toast('Picareta quebrou!', 1200)
      this.hotbar[this.hotbarActive] = null
      this._cleanupHotbarBroken(slot.id, this.hotbarActive)
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
    const isAxe = axeSlot?.id === ItemId.AXE_STONE || axeSlot?.id === ItemId.AXE_METAL
    if (!axeSlot || !isAxe || !meta || meta.dur <= 0) {
      this.ui.toast('Seu machado quebrou.', 1100)
      this.hotbar[this.hotbarActive] = null
      if (axeSlot?.id) this._cleanupHotbarBroken(axeSlot.id, this.hotbarActive)
      return
    }

    const dmg = Number(meta?.dmg ?? this.axeDamage)
    const dmgResult = this.trees.damage(hit.treeId, dmg, this.player.position)
    if (!dmgResult) return

    meta.dur = Math.max(0, meta.dur - 1)
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
    if (meta.dur <= 0) {
      this.ui.toast('Machado quebrou!', 1200)
      this.hotbar[this.hotbarActive] = null
      this._cleanupHotbarBroken(axeSlot.id, this.hotbarActive)
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

    // Start with one stone axe equipped in hotbar slot 2.
    this.hotbar[1] = {
      id: ItemId.AXE_STONE,
      qty: 1,
      meta: { tool: 'axe', tier: 'stone', dmg: TOOL_STATS.axe_stone.dmg, dur: TOOL_STATS.axe_stone.maxDur, maxDur: TOOL_STATS.axe_stone.maxDur },
    }

    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

    this.trees.resetAll()
    this.rocks?.resetAll?.()
    this.fires.resetAll()
    this.forges.resetAll()
    this.ores.resetAll()
    this.ores.init({ points: this.mine.getOreSpawnPoints() })
    this.ores.setVisible(false)
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
    this.ui.hideForge?.()
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
    this.hotbar[1] = {
      id: ItemId.AXE_STONE,
      qty: 1,
      meta: { tool: 'axe', tier: 'stone', dmg: TOOL_STATS.axe_stone.dmg, dur: TOOL_STATS.axe_stone.maxDur, maxDur: TOOL_STATS.axe_stone.maxDur },
    }
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
    this.hotbar[1] = {
      id: ItemId.AXE_STONE,
      qty: 1,
      meta: { tool: 'axe', tier: 'stone', dmg: TOOL_STATS.axe_stone.dmg, dur: TOOL_STATS.axe_stone.maxDur, maxDur: TOOL_STATS.axe_stone.maxDur },
    }
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

  openForge(forgeId) {
    if (this.state !== 'playing') return
    const f = this.forges.get(forgeId)
    if (!f) return

    this.state = 'forge'
    this._activeForgeId = forgeId

    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    this.ui.showForge()
    this.ui.renderForgeInventory(this.inventory.slots, (id) => ITEMS[id])
    this.ui.renderForge(f, (id) => ITEMS[id], { secondsPerIngot: this.forges.secondsPerIngot })
  }

  openForgeTable(forgeTableId) {
    if (this.state !== 'playing') return
    const t = this.forgeTables.get(forgeTableId)
    if (!t) return

    this.state = 'forgeTable'
    this._activeForgeTableId = forgeTableId

    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    this.ui.showForgeTable()
    this.ui.renderForgeTable(FORGE_TABLE_RECIPES, (id) => this.inventory.count(id), (id) => ITEMS[id], (rid) => this.craftForgeTable(rid))
  }

  async closeForgeTable() {
    if (this.state !== 'forgeTable') return
    this._activeForgeTableId = null
    await this.returnToGameMode()
  }

  craftForgeTable(recipeId) {
    const r = FORGE_TABLE_RECIPES.find((x) => x.id === recipeId)
    if (!r) return

    const can = r.cost.every((c) => this.inventory.count(c.id) >= c.qty)
    if (!can) {
      this.ui.toast('Faltam recursos.', 900)
      return
    }

    for (const c of r.cost) this.inventory.remove(c.id, c.qty)

    const overflow = this.inventory.add(r.output.id, r.output.qty, r.output.meta)
    if (overflow) {
      this.ui.toast('Inventário cheio: item descartado.', 1200)
    } else {
      this.ui.toast(`Forjado: ${r.name}`, 1000)
    }

    if (this.state === 'forgeTable') {
      this.ui.renderForgeTable(FORGE_TABLE_RECIPES, (id) => this.inventory.count(id), (id) => ITEMS[id], (rid) => this.craftForgeTable(rid))
    }
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

  async closeForge() {
    if (this.state !== 'forge') return
    this._activeForgeId = null
    await this.returnToGameMode()
  }

  forgeQuickAddFromInventory(invIdx) {
    if (this.state !== 'forge') return
    const f = this._activeForgeId ? this.forges.get(this._activeForgeId) : null
    if (!f) return

    const s = this.inventory.slots[invIdx]
    if (!s) return

    // Prefer fuel if item is fuel, otherwise input if ore.
    if (s.id === ItemId.LOG || s.id === ItemId.STICK || s.id === ItemId.LEAF) {
      const empty = f.fuel.findIndex((x) => !x)
      if (empty >= 0) return void this.moveItem({ from: 'inv', idx: invIdx }, { to: 'forge', kind: 'fuel', idx: empty })
    }

    if (s.id === ItemId.IRON_ORE) {
      const empty = f.input.findIndex((x) => !x)
      if (empty >= 0) return void this.moveItem({ from: 'inv', idx: invIdx }, { to: 'forge', kind: 'in', idx: empty })
    }
  }

  toggleForgeEnabled() {
    if (this.state !== 'forge') return
    const f = this._activeForgeId ? this.forges.get(this._activeForgeId) : null
    if (!f) return

    const hasFuel = (f.fuel || []).some((s) => s && s.qty > 0)
    const hasOre = (f.input || []).some((s) => s && s.qty > 0)

    if (!hasFuel || !hasOre) {
      this.ui.toast('Adicione combustível e minério.', 1000)
      return
    }

    f.enabled = !f.enabled
    this.ui.toast(f.enabled ? 'Forja ligada.' : 'Forja desligada.', 900)
    this._postMoveUpdate()
  }

  forgeSlotClick(kind, idx) {
    if (this.state !== 'forge') return
    const f = this._activeForgeId ? this.forges.get(this._activeForgeId) : null
    if (!f) return

    if (kind === 'out') {
      // click-to-collect one stack
      const s = f.output[idx]
      if (!s) return
      const overflow = this.inventory.add(s.id, s.qty)
      const moved = s.qty - (overflow || 0)
      if (moved > 0) {
        s.qty -= moved
        if (s.qty <= 0) f.output[idx] = null
        this.ui.toast(`Coletou: +${moved} ${ITEMS[s.id]?.name ?? s.id}`, 900)
        this._postMoveUpdate()
      } else {
        this.ui.toast('Inventário cheio.', 900)
      }
      return
    }

    // Clicking fuel/input slot pulls back to inventory.
    const arr = kind === 'fuel' ? f.fuel : f.input
    const s = arr[idx]
    if (!s) return

    const overflow = this.inventory.add(s.id, s.qty)
    const moved = s.qty - (overflow || 0)
    if (moved > 0) {
      s.qty -= moved
      if (s.qty <= 0) arr[idx] = null
      this._postMoveUpdate()
    } else {
      this.ui.toast('Inventário cheio.', 900)
    }
  }

  collectAllForgeOutput() {
    if (this.state !== 'forge') return
    const f = this._activeForgeId ? this.forges.get(this._activeForgeId) : null
    if (!f) return

    let total = 0
    for (let i = 0; i < f.output.length; i++) {
      const s = f.output[i]
      if (!s) continue
      const overflow = this.inventory.add(s.id, s.qty)
      const moved = s.qty - (overflow || 0)
      if (moved > 0) {
        total += moved
        s.qty -= moved
        if (s.qty <= 0) f.output[i] = null
      }
    }

    this._postMoveUpdate()
    if (total > 0) this.ui.toast(`Coletou: +${total} barras`, 1000)
    else this.ui.toast('Nada para coletar (ou inventário cheio).', 1000)
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

  _ensureFadeOverlay() {
    if (this._fadeEl) return
    const el = document.createElement('div')
    el.id = 'mineFade'
    el.style.position = 'fixed'
    el.style.left = '0'
    el.style.top = '0'
    el.style.right = '0'
    el.style.bottom = '0'
    el.style.background = '#000'
    el.style.opacity = '0'
    el.style.pointerEvents = 'none'
    el.style.transition = 'opacity 120ms linear'
    el.style.zIndex = '9999'
    document.body.appendChild(el)
    this._fadeEl = el
  }

  _startFadeTeleport(toMine) {
    if (this._fade.active) return
    this._fade.active = true
    this._fade.t = 0
    this._fade.phase = 'out'
    this._fade.toMine = !!toMine

    if (this._fadeEl) this._fadeEl.style.opacity = '1'
  }

  _updateMinePortal(dt) {
    // Update fade state if active
    if (this._fade.active) {
      this._fade.t += dt

      if (this._fade.phase === 'out' && this._fade.t >= this._fade.dur) {
        // Teleport at full black
        this._fade.phase = 'in'
        this._fade.t = 0

        if (this._fade.toMine) {
          this._inMine = true
          this.mine.setInteriorVisible(true)
          this.ores.setVisible(true)
          this.player.position.copy(this.mine.spawnMine)
          this.player.velocity.set(0, 0, 0)
        } else {
          this._inMine = false
          this.mine.setInteriorVisible(false)
          this.ores.setVisible(false)
          this.player.position.copy(this.mine.spawnWorld)
          this.player.velocity.set(0, 0, 0)
        }
      }

      if (this._fade.phase === 'in' && this._fade.t >= this._fade.dur) {
        this._fade.active = false
        this._fade.t = 0
        if (this._fadeEl) this._fadeEl.style.opacity = '0'
      }

      return
    }

    // Only trigger when not already fading.
    const p = this.player.position
    if (!this._inMine) {
      const dx = p.x - this.mine.portalEnter.x
      const dz = p.z - this.mine.portalEnter.z
      if (dx * dx + dz * dz <= this.mine.portalEnter.r * this.mine.portalEnter.r) {
        this._startFadeTeleport(true)
      }
    } else {
      const dx = p.x - this.mine.portalExit.x
      const dz = p.z - this.mine.portalExit.z
      if (dx * dx + dz * dz <= this.mine.portalExit.r * this.mine.portalExit.r) {
        this._startFadeTeleport(false)
      }
    }
  }

  _getHotbarItemDef(id) {
    if (id === 'hand') return { icon: '✋', stackable: false }
    return ITEMS[id]
  }

  _describeToolMeta(meta) {
    if (!meta) return ''
    const dur = typeof meta.dur === 'number' && typeof meta.maxDur === 'number' ? `${meta.dur}/${meta.maxDur}` : null
    const dmg = typeof meta.dmg === 'number' ? meta.dmg : null
    if (dur && dmg != null) return `Dur: ${dur} • Dmg: ${dmg}`
    if (dur) return `Dur: ${dur}`
    if (dmg != null) return `Dmg: ${dmg}`
    return ''
  }

  setTool(tool) {
    this.tool = tool

    // Determine which in-hand model to show.
    const s = this.hotbar[this.hotbarActive]
    const toolItemId = s?.id

    const modelTool = tool === 'campfire' || tool === 'forge' || tool === 'forgeTable' ? 'hand' : tool
    const modelItem = modelTool === 'axe' ? (toolItemId === ItemId.AXE_METAL ? 'axe_metal' : 'axe_stone')
      : modelTool === 'pickaxe' ? (toolItemId === ItemId.PICKAXE_METAL ? 'pickaxe_metal' : 'pickaxe_stone')
        : null

    this.player.setTool(modelTool, modelItem)
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
    if (s.id === ItemId.AXE_STONE || s.id === ItemId.AXE_METAL) this.setTool('axe')
    else if (s.id === ItemId.PICKAXE_STONE || s.id === ItemId.PICKAXE_METAL) this.setTool('pickaxe')
    else if (s.id === ItemId.TORCH) this.setTool('torch')
    else if (s.id === ItemId.CAMPFIRE) this.setTool('campfire')
    else if (s.id === ItemId.FORGE) this.setTool('forge')
    else if (s.id === ItemId.FORGE_TABLE) this.setTool('forgeTable')
    else this.setTool('hand')

    if (this.state === 'playing') {
      const msg =
        this.tool === 'axe'
          ? (this.hotbar[idx]?.id === ItemId.AXE_METAL ? 'Machado de metal equipado.' : 'Machado de pedra equipado.')
          : this.tool === 'pickaxe'
            ? (this.hotbar[idx]?.id === ItemId.PICKAXE_METAL ? 'Picareta de metal equipada.' : 'Picareta de pedra equipada.')
            : this.tool === 'torch'
              ? 'Tocha equipada.'
              : this.tool === 'campfire'
                ? 'Fogueira selecionada.'
                : this.tool === 'forge'
                  ? 'Forja selecionada.'
                  : this.tool === 'forgeTable'
                    ? 'Mesa de forja selecionada.'
                    : 'Mão equipada.'
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

    const forge = this._activeForgeId ? this.forges.get(this._activeForgeId) : null

    const get = (loc, kind = null) => {
      if (loc === 'inv') return this.inventory.slots
      if (loc === 'hot') return this.hotbar
      if (loc === 'forge') {
        if (!forge) return null
        if (kind === 'fuel') return forge.fuel
        if (kind === 'in') return forge.input
        if (kind === 'out') return forge.output
        return null
      }
      return null
    }

    const srcArr = get(from.from, from.kind)
    const dstArr = get(to.to, to.kind)
    if (!srcArr || !dstArr) return

    const sIdx = from.idx
    const dIdx = to.idx

    if (from.from === 'hot' && sIdx === 0) return
    if (to.to === 'hot' && dIdx === 0) return

    const src = srcArr[sIdx]
    if (!src) return

    // Forge slot rules
    if (to.to === 'forge') {
      if (to.kind === 'out') return
      if (to.kind === 'fuel') {
        const ok = src.id === ItemId.LOG || src.id === ItemId.STICK || src.id === ItemId.LEAF
        if (!ok) return
      }
      if (to.kind === 'in') {
        const ok = src.id === ItemId.IRON_ORE
        if (!ok) return
      }
    }

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

    // Re-render if inventory/forge open.
    if (this.state === 'inventory' || this.state === 'forge') {
      if (this.state === 'inventory') this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id])

      if (this.state === 'forge') {
        this.ui.renderForgeInventory(this.inventory.slots, (id) => ITEMS[id])
        if (this._activeForgeId) {
          const f = this.forges.get(this._activeForgeId)
          if (f) this.ui.renderForge(f, (id) => ITEMS[id], { secondsPerIngot: this.forges.secondsPerIngot })
        }
      }

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

  // ----------------- tool helpers -----------------

  _isAxeId(id) {
    return id === ItemId.AXE_STONE || id === ItemId.AXE_METAL
  }

  _isPickaxeId(id) {
    return id === ItemId.PICKAXE_STONE || id === ItemId.PICKAXE_METAL
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

  _updateForgeGhost() {
    const p = raycastGround(this.camera)
    if (!p) {
      this._ghostValid = false
      this._forgeGhost.setValid(false)
      return
    }

    const x = Math.round(p.x * 10) / 10
    const z = Math.round(p.z * 10) / 10
    this._ghostX = x
    this._ghostZ = z

    const dx = x - this.player.position.x
    const dz = z - this.player.position.z
    const d = Math.hypot(dx, dz)

    const nearFire = this.fires.getNearest({ x, z }, 1.4)
    const nearForge = this._getNearestForge({ x, z }, 1.6)

    const ok = d >= 1.2 && !nearFire && !nearForge
    this._ghostValid = ok
    this._forgeGhost.setValid(ok)
    this._forgeGhost.mesh.position.set(x, 0, z)
  }

  _getNearestForge(pos, radius) {
    return this.forges.getNearest(pos, radius)
  }

  _updateForgeTableGhost() {
    const p = raycastGround(this.camera)
    if (!p) {
      this._ghostValid = false
      this._forgeTableGhost.setValid(false)
      return
    }

    const x = Math.round(p.x * 10) / 10
    const z = Math.round(p.z * 10) / 10
    this._ghostX = x
    this._ghostZ = z

    const dx = x - this.player.position.x
    const dz = z - this.player.position.z
    const d = Math.hypot(dx, dz)

    const nearFire = this.fires.getNearest({ x, z }, 1.8)
    const nearForge = this._getNearestForge({ x, z }, 2.0)
    const nearTable = this.forgeTables.getColliders().some((c) => Math.hypot(c.x - x, c.z - z) < 2.2)

    const ok = d >= 1.4 && !nearFire && !nearForge && !nearTable
    this._ghostValid = ok
    this._forgeTableGhost.setValid(ok)
    this._forgeTableGhost.mesh.position.set(x, 0, z)
  }

  _placeForgeTableAtGhost() {
    const slot = this.hotbar[this.hotbarActive]
    if (!slot || slot.id !== ItemId.FORGE_TABLE) return

    this.forgeTables.place({ x: this._ghostX, z: this._ghostZ })

    // Consume current hotbar stack
    slot.qty = Math.max(0, (slot.qty ?? 1) - 1)
    if (slot.qty <= 0) this.hotbar[this.hotbarActive] = null

    // Unlock metal recipes in UI sense (station gating).
    this._hasForgeTableBuilt = true

    this.ui.toast('Mesa de forja colocada.', 900)
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

    if (!this.hotbar[this.hotbarActive]) this.selectHotbar(0)
  }

  _placeForgeAtGhost() {
    const slot = this.hotbar[this.hotbarActive]
    if (!slot || slot.id !== ItemId.FORGE) return

    this.forges.place({ x: this._ghostX, z: this._ghostZ })

    // Consume current hotbar stack
    slot.qty = Math.max(0, (slot.qty ?? 1) - 1)
    if (slot.qty <= 0) this.hotbar[this.hotbarActive] = null

    this.ui.toast('Forja colocada.', 900)
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

    if (!this.hotbar[this.hotbarActive]) this.selectHotbar(0)
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

  // Legacy campfire interaction removed: all placed-structure interaction is via F (tap/hold wheel).

  _tryInteract() {
    if (this.state !== 'playing') return
    if (document.pointerLockElement !== this.canvas) return

    // Only used for rock pickup; placed-structure interaction is via F.
    if (this.tool !== 'hand') {
      this.ui.toast('Equipe a mão (hotbar) para interagir.', 1100)
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

    // Contextual interaction hint (only when playing + locked).
    if (this.state === 'playing' && document.pointerLockElement === this.canvas) {
      const t = this._getInteractTarget()
      if (t) this.ui.setInteractHint(`F: ${t.primaryLabel} • Segure F: mais opções`)
      else this.ui.setInteractHint(null)
    } else if (this.state !== 'wheel') {
      this.ui.setInteractHint(null)
    }

    // Hard-guard: never leave wheel visuals around unless the wheel is actually open.
    if (this.state === 'playing' && !this._wheelOpen) this.ui.hideWheel?.()

    // Freeze most simulation when not playing (pause/inventory/menus).
    // Forge continues processing while its UI is open.
    const simDt = this.state === 'playing' ? dt : 0
    const forgeDt = this.state === 'playing' || this.state === 'forge' ? dt : 0

    // Ghost placement update
    if (simDt > 0 && this._placingCampfire) {
      this._updateCampfireGhost()
    }
    if (simDt > 0 && this._placingForge) {
      this._updateForgeGhost()
    }
    if (simDt > 0 && this._placingForgeTable) {
      this._updateForgeTableGhost()
    }

    const colliders = this.state === 'playing'
      ? this.trees
          .getTrunkColliders()
          .concat(this._inMine ? this.mine.getMineColliders() : this.mine.getWorldColliders())
          .concat(this._inMine ? [] : this.forges.getColliders())
          .concat(this._inMine ? [] : this.forgeTables.getColliders())
          .concat(this._inMine ? [] : this.river.getColliders())
          // Lake is decorative; collision boundary is enforced by the river.
      : []

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
    // Torch baseline brightness signal (used for campfire/forge scaling).
    // Doubled torch brightness.
    const torchMain = (3.2 + night * 6.0) * flicker

    const targetSpot = torchOn ? torchMain : 0.0
    const targetPoint = torchOn ? torchMain * 0.65 : 0.0

    this.torchSpot.intensity += (targetSpot - this.torchSpot.intensity) * (simDt > 0 ? 0.25 : 0.0)
    this.torchPoint.intensity += (targetPoint - this.torchPoint.intensity) * (simDt > 0 ? 0.25 : 0.0)

    // Provide baseline to campfire/forge lighting.
    this.fires.setTorchMain(torchMain)
    this.forges.setTorchMain(torchMain)

    // Sync flame visuals with the same flicker signal.
    // Keep torch flame visible even during daytime.
    const torchHeat01 = torchOn ? Math.max(0.35, night) : 0
    this.player.setTorchFlicker(flicker, torchHeat01)

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
        // Require correct item id in active slot.
        const s = this.hotbar[this.hotbarActive]
        if (this.tool === 'axe' && !this._isAxeId(s?.id)) {
          this.ui.toast('Equipe um machado.', 900)
          this._actionCooldown = 0.25
        } else if (this.tool === 'pickaxe' && !this._isPickaxeId(s?.id)) {
          this.ui.toast('Equipe uma picareta.', 900)
          this._actionCooldown = 0.25
        } else if (!this.player.isSwinging()) {
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

    // Portal transitions (outside -> mine, mine -> outside)
    if (simDt > 0 && this.state === 'playing') this._updateMinePortal(simDt)

    this.world.update(simDt, { camera: this.camera, player: this.player, time: this.time })
    this.trees.update(simDt)
    this.rocks.update(simDt)
    this.fires.update(simDt)
    this.forges.update(forgeDt, this.camera)
    this.ores.update(simDt)
    this.grass.update(simDt, this.player.position)
    this.river.update(dt)
    this.lake.update(dt)

    // Live forge UI updates while forge UI is open.
    if (this.state === 'forge' && this._activeForgeId) {
      const f = this.forges.get(this._activeForgeId)
      if (f) {
        this.ui.updateForgeStatus?.(f, { secondsPerIngot: this.forges.secondsPerIngot })
        if (f.dirty) {
          f.dirty = false
          this.ui.renderForge(f, (id) => ITEMS[id], { secondsPerIngot: this.forges.secondsPerIngot })
        }
      }
    }

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
