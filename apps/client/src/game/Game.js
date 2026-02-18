import * as THREE from 'three'
import { Renderer } from './Renderer.js'
import { World } from './World.js'
import { Player } from './Player.js'
import { TreeManager } from './TreeManager.js'
import { RockManager } from './RockManager.js'
import { StickManager } from './StickManager.js'
import { BushManager } from './BushManager.js'
import { FarmManager } from './FarmManager.js'
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
import { ChestManager } from './ChestManager.js'
import { ChestGhost } from './ChestGhost.js'
import { raycastGround } from './raycastGround.js'
import { RemotePlayersManager } from './RemotePlayersManager.js'
import { WsClient } from '../net/wsClient.js'

export class Game {
  /**
   * @param {{canvas: HTMLCanvasElement, ui: import('./UI.js').UI}} params
   */
  constructor({ canvas, ui }) {
    this.canvas = canvas
    this.ui = ui

    // UI options
    try {
      const v = localStorage.getItem('woodcutter_preview_3d')
      if (v === null) localStorage.setItem('woodcutter_preview_3d', '0')
      this.preview3dEnabled = localStorage.getItem('woodcutter_preview_3d') === '1'
    } catch {
      this.preview3dEnabled = false
    }
    this.ui.setPreview3DEnabled?.(this.preview3dEnabled)

    /** @type {{guestId:string, worldId:string, save:(state:any)=>Promise<void>}|null} */
    this._persistCtx = null
    /** @type {any|null} */
    this._persistedState = null
    this._persistTimer = 0

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
    this.sticks = new StickManager({ scene: this.scene })
    this.bushes = new BushManager({ scene: this.scene })
    this.farm = new FarmManager({ scene: this.scene })
    this.fires = new CampfireManager({ scene: this.scene })
    this.forges = new ForgeManager({ scene: this.scene })
    this.forgeTables = new ForgeTableManager({ scene: this.scene })
    this.chests = new ChestManager({ scene: this.scene })
    this.mine = new MineManager({ scene: this.scene })
    this.ores = new OreManager({ scene: this.scene })

    this.remotePlayers = new RemotePlayersManager({ scene: this.scene })
    this.ws = null
    this.wsMeId = null
    this._wsPoseAt = 0
    this._wsConnected = false
    this._lastColliders = []
    this._lastGroundY = 0
    this._reconCooldownUntil = 0

    // World persistence (F3): strict, server-confirmed events.
    // key -> { fn, accepted, timeoutId }
    this._pendingWorldActions = new Map()
    this._appliedWorld = {
      trees: new Set(),
      rocks: new Set(),
      bushes: new Set(),
      farm: new Set(),
      ores: new Set(),
      campfires: new Set(),
      forges: new Set(),
      forgeTables: new Set(),
      chests: new Set(),
    }

    // Track placed structures per chunk so removals (server-authoritative) can be applied.
    // ck -> Map<id,type>
    this._placedByChunk = new Map()

    this._inMine = false
    this._fadeEl = null
    this._fade = { active: false, t: 0, dur: 0.22, phase: 'in' }
    this.sfx = new Sfx()

    this.pickaxeDamage = 10

    this.inventoryBaseSlots = 20
    this.inventory = new Inventory({ slots: this.inventoryBaseSlots, maxStack: 100 })

    // Equipment + buffs (saved in gameSave v3)
    /** @type {{hat:any|null, shirt:any|null, pants:any|null, boots:any|null, gloves:any|null, backpack:any|null}} */
    this.equipment = { hat: null, shirt: null, pants: null, boots: null, gloves: null, backpack: null }
    /** @type {{luckUntilMs:number}} */
    this.buffs = { luckUntilMs: 0 }

    this.time = new TimeSystem({ startHours: 9.0 })
    this.perf = new Perf()
    this.perfEnabled = false

    this.damageNumbers = new DamageNumbers({ container: document.querySelector('#floaters') })

    this.axeDamage = 12

    this._placingCampfire = false
    this._placingForge = false
    this._placingForgeTable = false
    this._placingChest = false

    this._activeForgeId = null
    this._activeForgeTableId = null
    this._activeChestId = null

    // Locks (Redis) for shared resources (best-effort)
    this._forgeLockToken = null
    this._forgeLockTimer = 0
    this._chestLockToken = null
    this._chestLockTimer = 0

    // Recently-locked targets (to show lock-only UI on hold-F)
    this._lockedTargets = new Map()

    // Debounced persistence for player state (inventory/hotbar)
    this._playerSaveTimer = 0

    this._chestSlots = Array.from({ length: 15 }, () => null)

    this._ghost = new CampfireGhost()
    this._forgeGhost = new ForgeGhost()
    this._forgeTableGhost = new ForgeTableGhost()
    this._chestGhost = new ChestGhost()

    this.scene.add(this._ghost.mesh)
    this.scene.add(this._forgeGhost.mesh)
    this.scene.add(this._forgeTableGhost.mesh)
    this.scene.add(this._chestGhost.mesh)

    this._ghostX = 0
    this._ghostZ = 0
    this._ghostValid = false

    // Tool durability state
    this._axeBroken = false
    this._torchBroken = false
    this._torchTick = 0

    this.score = 0
    this._running = false

    /** @type {'menu'|'playing'|'paused'|'inventory'|'crafting'|'forge'|'forgeTable'|'chest'|'wheel'|'controls-menu'|'controls-pause'} */
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
    this._hoverInvIdx = -1
    this._selectedInvIdx = -1

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

  setPreview3DEnabled(v) {
    this.preview3dEnabled = !!v
    this.ui.setPreview3DEnabled?.(this.preview3dEnabled)

    // Refresh open UIs so preview/placeholder updates.
    try {
      if (this.state === 'crafting') {
        this.ui.renderCrafting(RECIPES, (id) => this.inventory.count(id), (id) => ITEMS[id], (rid) => this.craft(rid))
      } else if (this.state === 'forgeTable') {
        this.ui.renderForgeTable(FORGE_TABLE_RECIPES, (id) => this.inventory.count(id), (id) => ITEMS[id], (rid) => this.craftForgeTable(rid))
      }
    } catch {
      // ignore
    }
  }

  togglePreview3D() {
    this.setPreview3DEnabled(!this.preview3dEnabled)
    try { localStorage.setItem('woodcutter_preview_3d', this.preview3dEnabled ? '1' : '0') } catch {}
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
    this.sticks.init({ seed: 1991, count: 46, radius: 45 })
    this.bushes.init({ seed: 3033, count: 26, radius: 46 })

    // Farm plots are server-authoritative; start empty until chunks arrive.

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

    // Accessibility: view bob/sway toggle (visual-only; does not affect raycasts)
    this._viewBobEnabled = true
    try {
      const v = localStorage.getItem('woodcutter_view_bob')
      if (v === '0') this._viewBobEnabled = false
    } catch {
      // ignore
    }
    this.player.setViewBobEnabled?.(this._viewBobEnabled)
    const btnBob = document.querySelector('#btnViewBob')
    if (btnBob) btnBob.textContent = `View bob: ${this._viewBobEnabled ? 'ON' : 'OFF'}`

    // Swing impacts trigger hit detection in a narrow window.
    this.player.onImpact(() => {
      if (this.state !== 'playing') return
      if (document.pointerLockElement !== this.canvas) return

      if (this.tool === 'axe') this._tryChop()
      else if (this.tool === 'pickaxe') this._tryMine()
      else if (this.tool === 'hoe') this._tryHoe()
    })

    this._running = true
    this._loop()

    this.selectHotbar(0)
    this.ui.toast('Play para começar.')

    // Best-effort autosave (server persistence).
    // IMPORTANT: also save while in menus/modals to reduce loss on F5.
    this._persistTimer = window.setInterval(() => {
      // Skip only when we truly have no persistence context.
      if (!this._persistCtx?.save) return
      void this.saveNow()
    }, 20000)
  }

  stop() {
    this._running = false
    if (this._persistTimer) {
      clearInterval(this._persistTimer)
      this._persistTimer = 0
    }
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
    // Hotbar slots (teclado): 1..9,0 -> índices 0..9
    // idx 0 (tecla 1) = mão fixa.
    const digitMap = {
      Digit1: 0,
      Digit2: 1,
      Digit3: 2,
      Digit4: 3,
      Digit5: 4,
      Digit6: 5,
      Digit7: 6,
      Digit8: 7,
      Digit9: 8,
      Digit0: 9,
    }
    const mapped = digitMap[e.code]
    if (Number.isInteger(mapped)) {
      // Novo fluxo: com inventário aberto, número atribui atalho para o item sob o mouse.
      if (this.state === 'inventory') {
        this.assignHoverItemToHotbar(mapped)
        return
      }
      return void this.selectHotbar(mapped)
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

    // KeyB dev spawn removed: backpack is now crafted in category "Equipamentos".

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

    // Trancado (não é do player) => lock-only.
    if (target.kind === 'chest' && this._isTargetLocked('chest', target.id)) {
      return [{ id: 'locked', label: '🔒' }]
    }

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
    void this._openWheelAsync(target)
  }

  async _openWheelAsync(target) {
    let actions = this._wheelActionsFor(target)

    // If chest/forge might be locked, do a quick status check so we can show lock-only UI.
    try {
      if ((target?.kind === 'forge') && this._persistCtx?.worldId && this._persistCtx?.guestId) {
        const { getChestAccess } = await import('../net/chestState.js')
        const st = await getChestAccess({ worldId: this._persistCtx.worldId, chestId: target.id, guestId: this._persistCtx.guestId })
        if (st?.ok && st.access === 'forbidden') actions = [{ id: 'locked', label: '🔒' }]
      }
      if ((target?.kind === 'forge') && this._persistCtx?.worldId && this._persistCtx?.guestId) {
        const { getForgeLockStatus } = await import('../net/forgeState.js')
        const st = await getForgeLockStatus({ worldId: this._persistCtx.worldId, forgeId: target.id, guestId: this._persistCtx.guestId })
        if (st?.ok && st.locked) actions = [{ id: 'locked', label: '🔒' }]
      }
    } catch {
      // ignore
    }

    if (!actions.length) return

    this._wheelActions = actions

    this._wheelOpen = true
    this.state = 'wheel'

    // Release pointer lock so we can use mouse position.
    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    this.ui.setWheelActions?.(actions)
    this.ui.showWheel?.()
    this.ui.setInteractHint('Clique em uma opção (ou solte F em cima)')

    // Default selection.
    this._wheelAction = null

    // Enable click-to-act on buttons.
    try {
      const root = this.ui?.els?.actionWheelEl
      const wheel = root?.querySelector?.('.wheel')
      if (wheel) {
        for (const btn of Array.from(wheel.querySelectorAll('.wheelBtn'))) {
          const actionId = btn.getAttribute('data-action')
          btn.addEventListener('mouseenter', () => {
            this._wheelAction = actionId
          })
          btn.addEventListener('click', (e) => {
            e.preventDefault?.()
            this._wheelAction = actionId
            this._closeWheel(true)
          })
        }
      }
    } catch {
      // ignore
    }
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
    // New UI: action buttons grid. Select only when hovering a button.
    const el = document.elementFromPoint(x, y)
    const btn = el?.closest?.('[data-action]')
    const actionId = btn?.getAttribute?.('data-action') || null

    if (actionId !== this._wheelAction) {
      this._wheelAction = actionId
      // Keep API call for compatibility, but visual highlight is handled by :hover.
      this.ui.setWheelActive?.(this._wheelAction)
    }
  }

  _getInteractTarget() {
    if (this.state !== 'playing') return null
    if (document.pointerLockElement !== this.canvas) return null

    // Prefer raycast under reticle.
    let best = null

    const trySet = (kind, id, dist, primaryLabel, name, x = null, z = null) => {
      if (!id) return
      if (!best || dist < best.dist) best = { kind, id, dist, primaryLabel, name, x, z }
    }

    // Forge table
    if (!this._inMine) {
      const ft = this.forgeTables.raycastFromCamera(this.camera)
      if (ft && ft.distance <= 2.8) trySet('forgeTable', ft.forgeTableId, ft.distance, 'Abrir', 'Mesa de Forja', ft.point?.x, ft.point?.z)

      const f = this.forges.raycastFromCamera(this.camera)
      if (f && f.distance <= 2.6) trySet('forge', f.forgeId, f.distance, 'Abrir', 'Forja', f.point?.x, f.point?.z)

      const ch = this.chests.raycastFromCamera?.(this.camera)
      if (ch && ch.distance <= 2.6) trySet('chest', ch.chestId, ch.distance, 'Abrir', 'Baú', ch.point?.x, ch.point?.z)

      const c = this.fires.raycastFromCamera?.(this.camera)
      if (c && c.distance <= 2.6) {
        const lit = this.fires.isLit(c.campfireId)
        trySet('campfire', c.campfireId, c.distance, lit ? 'Apagar' : 'Acender', 'Fogueira', c.point?.x, c.point?.z)
      }
    }

    return best
      ? { kind: best.kind, id: best.id, primaryLabel: best.primaryLabel, name: best.name, x: best.x, z: best.z }
      : null
  }

  _updateTargetHighlight(t) {
    const nextKey = t ? `${t.kind}:${t.id}` : null
    if (nextKey === this._hlKey) return

    // clear previous (IMPORTANT: some meshes share the same material instance;
    // restore must happen per-material, not per-mesh, otherwise the “prev” value
    // can be captured after we already tinted the shared material.)
    if (this._hlMats?.size) {
      for (const [mat, prev] of this._hlMats.entries()) {
        if (!mat || typeof mat !== 'object') continue
        if ('emissiveIntensity' in mat && typeof prev?.emiIntensity === 'number') {
          mat.emissiveIntensity = prev.emiIntensity
        }
        if (mat.emissive && typeof mat.emissive.setHex === 'function' && typeof prev?.emiHex === 'number') {
          try { mat.emissive.setHex(prev.emiHex) } catch {}
        }
      }
    }
    this._hlMats = new Map()
    this._hlMeshes = []
    this._hlKey = nextKey

    if (!t) return

    let root = null
    if (t.kind === 'forge') root = this.forges.get(t.id)?.mesh
    else if (t.kind === 'forgeTable') root = this.forgeTables.get(t.id)?.mesh
    else if (t.kind === 'chest') root = this.chests.get(t.id)?.mesh
    else if (t.kind === 'campfire') root = this.fires.get(t.id)?.mesh

    if (!root) return

    // Emissive highlight (cheap): bump emissiveIntensity on meshes that support it.
    const meshes = []
    root.traverse?.((obj) => {
      if (!obj?.isMesh) return
      const mat = obj.material
      if (!mat || typeof mat !== 'object') return
      if (!('emissiveIntensity' in mat)) return
      meshes.push(obj)
    })

    const HL_HEX = 0x7feaa0 // softer green
    const HL_INTENSITY = 0.22

    for (const m of meshes) {
      const mat = m.material
      if (!mat || typeof mat !== 'object') continue

      // store prev once per material (shared materials are common in our props)
      if (!this._hlMats.has(mat)) {
        let prevHex = null
        try { prevHex = mat.emissive?.getHex?.() } catch {}
        this._hlMats.set(mat, { emiIntensity: mat.emissiveIntensity, emiHex: prevHex })
      }

      try { mat.emissive?.setHex?.(HL_HEX) } catch {}
      mat.emissiveIntensity = Math.max(mat.emissiveIntensity ?? 0, HL_INTENSITY)
    }

    this._hlMeshes = meshes
  }

  _interactPrimary(t) {
    if (!t) return
    if (t.kind === 'forge') return this.openForge(t.id)
    if (t.kind === 'forgeTable') return this.openForgeTable(t.id)
    if (t.kind === 'chest') return this.openChest(t.id)
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

    const pickup = true

    // Multiplayer: removal must be server-authoritative so everyone updates.
    if (this._wsConnected && this.ws) {
      const placeKind = t.kind
      const id = String(t.id)

      // Chest: best-effort local checks before asking server.
      if (t.kind === 'chest') {
        if (this.state === 'chest' && this._activeChestId === t.id) return false
        const known = this._activeChestId === t.id ? this._chestSlots : null
        if (known && known.some((s) => s && s.qty > 0)) {
          this.ui.toast('Baú não está vazio.', 1000)
          return false
        }
        if (this.inventory.count(ItemId.CHEST) >= 9999) {
          this.ui.toast('Inventário cheio.', 1000)
          return false
        }
      }

      const key = `placeRemove:${id}`
      this._setPendingWorldAction(key, () => {
        // Apply local effects only on confirm.
        if (placeKind === 'chest') {
          const overflow = this.inventory.add(ItemId.CHEST, 1)
          if (overflow) {
            this.ui.toast('Inventário cheio (baú descartado).', 1200)
          }
          this.chests.remove(id)
          this._unregisterPlacedLocal('chest', id)
        } else if (placeKind === 'forge') {
          const overflow = this.inventory.add(ItemId.FORGE, 1)
          if (overflow) this.ui.toast('Inventário cheio (forja descartada).', 1200)
          this.forges.remove(id)
          this._unregisterPlacedLocal('forge', id)
        } else if (placeKind === 'forgeTable') {
          const overflow = this.inventory.add(ItemId.FORGE_TABLE, 1)
          if (overflow) this.ui.toast('Inventário cheio (mesa descartada).', 1200)
          this.forgeTables.remove(id)
          this._unregisterPlacedLocal('forgeTable', id)
        }

        this.ui.toast('Recolhido.', 900)
      })

      const sent = this._sendWorldEvent({ kind: 'placeRemove', placeKind, id, pickup, x: t.x, z: t.z, at: Date.now() })
      if (!sent) {
        const rec = this._pendingWorldActions.get(key)
        if (rec?.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(key)
        this.ui.toast('Sem conexão com o servidor (WS).', 1100)
      }

      return true
    }

    // Offline fallback (single-player only)
    if (t.kind === 'chest') {
      this.ui.toast('Offline: não pode recolher baú.', 1000)
      return false
    }

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

    const pickup = false

    // Multiplayer: removal must be server-authoritative so everyone updates.
    if (this._wsConnected && this.ws) {
      const placeKind = t.kind
      const id = String(t.id)

      // Chest: best-effort local checks.
      if (t.kind === 'chest') {
        const known = this._activeChestId === t.id ? this._chestSlots : null
        if (known && known.some((s) => s && s.qty > 0)) {
          this.ui.toast('Baú não está vazio.', 1000)
          return
        }
      }

      const key = `placeRemove:${id}`
      this._setPendingWorldAction(key, () => {
        if (placeKind === 'chest') {
          this.chests.remove(id)
          this._unregisterPlacedLocal('chest', id)
        } else if (placeKind === 'forge') {
          this.forges.remove(id)
          this._unregisterPlacedLocal('forge', id)
        } else if (placeKind === 'forgeTable') {
          this.forgeTables.remove(id)
          this._unregisterPlacedLocal('forgeTable', id)
        } else if (placeKind === 'campfire') {
          this.fires.remove(id)
          this._unregisterPlacedLocal('campfire', id)
        }

        this.ui.toast('Destruído.', 900)
      })

      const sent = this._sendWorldEvent({ kind: 'placeRemove', placeKind, id, pickup, x: t.x, z: t.z, at: Date.now() })
      if (!sent) {
        const rec = this._pendingWorldActions.get(key)
        if (rec?.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(key)
        this.ui.toast('Sem conexão com o servidor (WS).', 1100)
      }

      return
    }

    // Offline fallback
    if (t.kind === 'chest') {
      const known = this._activeChestId === t.id ? this._chestSlots : null
      if (known && known.some((s) => s && s.qty > 0)) {
        this.ui.toast('Baú não está vazio.', 1000)
        return
      }
      this.chests.remove(t.id)
      this.ui.toast('Destruído.', 900)
      return
    }

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

  _consumeAppleFromActiveHotbar() {
    const slot = this.hotbar?.[this.hotbarActive]
    if (!slot || slot.id !== ItemId.APPLE) return false

    // Hotbar é atalho: consumo real acontece no inventário.
    const left = this.inventory.remove(ItemId.APPLE, 1)
    if (left > 0) {
      this.ui.toast('Sem maçã no inventário.', 900)
      return false
    }

    this.player.handAction?.()
    this._activateAppleLuck()

    // Se acabou maçã no inventário, limpar qualquer atalho de maçã.
    if ((this.inventory.count?.(ItemId.APPLE) || 0) <= 0) {
      for (let i = 1; i < this.hotbar.length; i++) {
        if (this.hotbar[i]?.id === ItemId.APPLE) this.hotbar[i] = null
      }
    }

    this.ui.toast('Você comeu uma maçã 🍎 (+Sorte)', 1000)
    this._postMoveUpdate()
    this._queuePlayerSave()
    return true
  }

  _onMouseDownAny(e) {
    if (this.state !== 'playing') return
    if (performance.now() < (this._suppressMouseDownUntil || 0)) return
    if (document.pointerLockElement !== this.canvas) return

    // Left click: if active slot is apple, consume immediately.
    if (e.button === 0 && this._consumeAppleFromActiveHotbar()) {
      e.preventDefault?.()
      return
    }

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
      if (this.tool === 'chest' && this.hotbarActive !== 0 && !this._inMine) {
        this._placingChest = true
        this._chestGhost.setVisible(true)
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

    if (e.button === 0 && this._placingChest) {
      this._placingChest = false
      this._chestGhost.setVisible(false)
      if (this._ghostValid) this._placeChestAtGhost()
      return
    }
  }

  _tryMine() {
    const hit = this.ores.raycastFromCamera(this.camera)
    if (!hit) {
      this.sfx.click()
      return
    }

    // Feedback: show hitmarker when there is a valid target under crosshair.
    this.ui.hitmarker?.(120)
    this.sfx.hit?.('ore')


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
    this.ui.hitmarker?.(120)

    if (!r.broke) return

    // Strict: wait for server accept + chunk confirmation to actually break/remove + grant loot.
    const key = `oreBreak:${String(hit.oreId)}`
    this._setPendingWorldAction(key, () => {
      // Now confirmed: apply local break visual + loot.
      this.ores.confirmBreak(String(hit.oreId))

      const oreQty = this._withLuckMultiplier(2)
      const overflow = this.inventory.add(ItemId.IRON_ORE, oreQty)
      if (overflow) {
        this.ui.toast('Inventário cheio: minério descartado.', 1200)
        this.sfx.click()
      } else {
        this.ui.toast(`Loot: +${oreQty} minério de ferro`, 1100)
        this.sfx.pickup()
        if (this.state === 'inventory') this._renderInventoryUI()
      }
    })

    const sent = this._sendWorldEvent({ kind: 'oreBreak', oreId: String(hit.oreId), x: hit.point.x, z: hit.point.z, at: Date.now() })
    if (!sent) {
      const rec = this._pendingWorldActions.get(key)
      if (rec?.timeoutId) clearTimeout(rec.timeoutId)
      this._pendingWorldActions.delete(key)
      this.ui.toast('Sem conexão com o servidor (WS).', 1100)
    }
  }

  _tryChop() {
    const hit = this.trees.raycastFromCamera(this.camera)
    if (!hit) {
      this.sfx.click()
      return
    }

    // Feedback: show hitmarker when there is a valid target under crosshair.
    this.ui.hitmarker?.(120)
    this.sfx.hit?.('wood')


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

    // Only when HP reaches 0: wait for server accept + chunk confirmation to cut + loot.
    if (!dmgResult.cut) return

    const treeId = String(hit.treeId)
    const key = `treeCut:${treeId}`

    this._setPendingWorldAction(key, () => {
      // Start falling now (server confirmed removal).
      this.trees.confirmCut(treeId, this.player.position)

      this.score += 1
      this.ui.setScore(this.score)

      // Loot base: 1 log, 2–5 sticks, 10–20 leaves.
      const sticks = this._randInt(2, 5)
      const leaves = this._randInt(10, 20)

      // P9-S2: full woodcutter set grants independent extra rolls (25%).
      const bonus = this._rollWoodcutterBonusTreeLoot()

      const gainLog = this._withLuckMultiplier(1 + (bonus.log || 0))
      const gainStick = this._withLuckMultiplier(sticks + (bonus.stick || 0))
      const gainLeaf = this._withLuckMultiplier(leaves + (bonus.leaf || 0))

      const dropped = []
      const overflowLog = this.inventory.add(ItemId.LOG, gainLog)
      const overflowStick = this.inventory.add(ItemId.STICK, gainStick)
      const overflowLeaf = this.inventory.add(ItemId.LEAF, gainLeaf)

      if (overflowLog) dropped.push(`${overflowLog} ${ITEMS[ItemId.LOG].name}`)
      if (overflowStick) dropped.push(`${overflowStick} ${ITEMS[ItemId.STICK].name}`)
      if (overflowLeaf) dropped.push(`${overflowLeaf} ${ITEMS[ItemId.LEAF].name}`)

      const baseLootMsg = dropped.length
        ? `Loot: +${gainLog} tronco, +${gainStick} galhos, +${gainLeaf} folhas (excedente descartado)`
        : `Loot: +${gainLog} tronco, +${gainStick} galhos, +${gainLeaf} folhas`

      let lines = [baseLootMsg]
      const hasAnyBonus = (bonus.log || 0) > 0 || (bonus.stick || 0) > 0 || (bonus.leaf || 0) > 0
      if (hasAnyBonus) {
        const parts = []
        if (bonus.log) parts.push(`+${bonus.log} Tronco`)
        if (bonus.stick) parts.push(`+${bonus.stick} Galhos`)
        if (bonus.leaf) parts.push(`+${bonus.leaf} Folhas`)
        lines.push(`Bônus Lenhador! ${parts.join(' ')}`)
      }

      // P10-S1: rare apple drop from confirmed tree cut (0.5%)
      const appleDrop = Math.random() < 0.005
      if (appleDrop) {
        const appleOverflow = this.inventory.add(ItemId.APPLE, 1)
        const appleMsg = appleOverflow
          ? '<span class="rareLoot">🍎 ITEM RARO! +1 Maçã (excedente descartado)</span>'
          : '<span class="rareLoot">🍎 ITEM RARO! +1 Maçã</span>'
        lines.push(appleMsg)
      }

      this.sfx.chop()
      this.ui.toastHtml(lines.join('<br>'), 1700)

      if (this.state === 'inventory') this._renderInventoryUI()
    })

    const sent = this._sendWorldEvent({ kind: 'treeCut', treeId, x: hit.point.x, z: hit.point.z, at: Date.now() })
    if (!sent) {
      const rec = this._pendingWorldActions.get(key)
      if (rec?.timeoutId) clearTimeout(rec.timeoutId)
      this._pendingWorldActions.delete(key)
      this.ui.toast('Sem conexão com o servidor (WS).', 1100)
    }
  }

  _randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  _hasFullWoodcutterSet() {
    const eq = this.equipment || {}
    return (
      eq.hat?.id === ItemId.WOODCUTTER_HAT &&
      eq.shirt?.id === ItemId.WOODCUTTER_SHIRT &&
      eq.pants?.id === ItemId.WOODCUTTER_PANTS &&
      eq.boots?.id === ItemId.WOODCUTTER_BOOTS &&
      eq.gloves?.id === ItemId.WOODCUTTER_GLOVES
    )
  }

  _rollWoodcutterBonusTreeLoot() {
    if (!this._hasFullWoodcutterSet()) return { log: 0, stick: 0, leaf: 0 }

    const chance = 0.25
    return {
      log: Math.random() < chance ? 1 : 0,
      stick: Math.random() < chance ? 2 : 0,
      leaf: Math.random() < chance ? 5 : 0,
    }
  }

  _isLuckActive() {
    return Number(this.buffs?.luckUntilMs || 0) > Date.now()
  }

  _activateAppleLuck() {
    const durationMs = 5 * 60 * 1000
    const now = Date.now()
    if (!this.buffs) this.buffs = { luckUntilMs: 0 }
    this.buffs.luckUntilMs = now + durationMs

    const mm = 5
    const ss = 0
    this.ui.toast(`Sorte ativada: ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 1200)

    if (this.state === 'inventory') this.ui.setBuffLine?.(this._getBuffLine())
    this._queuePlayerSave?.()
  }

  _withLuckMultiplier(qty) {
    const n = Math.max(0, Math.floor(Number(qty) || 0))
    return this._isLuckActive() ? n * 2 : n
  }

  _tryHoe() {
    if (this.state !== 'playing') return
    if (document.pointerLockElement !== this.canvas) return

    if (this._inMine) {
      this.ui.toast('Não dá pra arar/plantar na mina.', 1100)
      this.sfx.click()
      return
    }

    const slot = this.hotbar[this.hotbarActive]
    const meta = slot?.meta
    const isHoe = slot?.id === ItemId.HOE_METAL
    if (!slot || !isHoe || !meta || meta.dur <= 0) {
      this.ui.toast('Sua enxada quebrou.', 1100)
      this.hotbar[this.hotbarActive] = null
      if (slot?.id) this._cleanupHotbarBroken(slot.id, this.hotbarActive)
      return
    }

    const p = raycastGround(this.camera)
    if (!p) return

    const snap = this.farm.snap(p.x, p.z)
    const plotId = snap.id
    const st = this.farm.getPlot(plotId)

    // Decide action: harvest > plant > till
    const ready = this.farm.isReady(st)

    if (st?.seedId && !ready) {
      this.ui.toast('Ainda não está crescida.', 1100)
      this.sfx.click()
      return
    }

    if (st?.seedId && ready) {
      const key = `harvest:${plotId}`
      const pendingKey = `harvest:${plotId}`
      this._setPendingWorldAction(pendingKey, () => {
        // Consume durability on confirmed action
        meta.dur = Math.max(0, meta.dur - 1)
        this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
        if (meta.dur <= 0) {
          this.ui.toast('Enxada quebrou!', 1200)
          this.hotbar[this.hotbarActive] = null
          this._cleanupHotbarBroken(slot.id, this.hotbarActive)
        }

        // Drops: always return 1 seed + 30% chance of an extra seed.
        // Luck buff doubles harvest quantities.
        const extraSeed = Math.random() < 0.30
        const fiberQty = this._withLuckMultiplier(2)
        const seedQty = this._withLuckMultiplier(1 + (extraSeed ? 1 : 0))

        const fiberOverflow = this.inventory.add(ItemId.FIBER, fiberQty)
        const seedOverflow = this.inventory.add(ItemId.COTTON_SEED, seedQty)

        const dropped = []
        if (fiberOverflow) dropped.push('fibra')
        if (seedOverflow) dropped.push('semente')

        const seedWord = seedQty === 1 ? 'semente' : 'sementes'
        const baseMsg = `Colheu: +${fiberQty} fibra +${seedQty} ${seedWord}`
        const msg = dropped.length ? `${baseMsg} (excedente descartado)` : baseMsg

        if (fiberOverflow || seedOverflow) {
          this.sfx.click()
        } else {
          this.sfx.pickup()
        }

        this.ui.toast(msg, 1100)
        if (this.state === 'inventory') this._renderInventoryUI()
      })

      const sent = this._sendWorldEvent({ kind: 'harvest', plotId, x: snap.x, z: snap.z, at: Date.now() })
      if (!sent) {
        const rec = this._pendingWorldActions.get(pendingKey)
        if (rec?.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(pendingKey)
        this.ui.toast('Sem conexão com o servidor (WS).', 1100)
      }

      return
    }

    if (st?.tilledAt && !st?.seedId) {
      if (this.inventory.count(ItemId.COTTON_SEED) <= 0) {
        this.ui.toast('Você precisa de semente de algodão.', 1100)
        this.sfx.click()
        return
      }

      const key = `plant:${plotId}`
      this._setPendingWorldAction(key, () => {
        // Consume 1 seed
        const ok = this.inventory.remove(ItemId.COTTON_SEED, 1)
        if (!ok) return

        // Consume durability
        meta.dur = Math.max(0, meta.dur - 1)
        this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
        if (meta.dur <= 0) {
          this.ui.toast('Enxada quebrou!', 1200)
          this.hotbar[this.hotbarActive] = null
          this._cleanupHotbarBroken(slot.id, this.hotbarActive)
        }

        this.ui.toast('Plantou algodão.', 900)
        this.sfx.pickup()
        if (this.state === 'inventory') this._renderInventoryUI()
      })

      const sent = this._sendWorldEvent({ kind: 'plant', plotId, seedId: ItemId.COTTON_SEED, x: snap.x, z: snap.z, at: Date.now() })
      if (!sent) {
        const rec = this._pendingWorldActions.get(key)
        if (rec?.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(key)
        this.ui.toast('Sem conexão com o servidor (WS).', 1100)
      }

      return
    }

    // Till new plot (or refresh tilled)
    const key = `plotTill:${plotId}`
    this._setPendingWorldAction(key, () => {
      meta.dur = Math.max(0, meta.dur - 1)
      this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
      if (meta.dur <= 0) {
        this.ui.toast('Enxada quebrou!', 1200)
        this.hotbar[this.hotbarActive] = null
        this._cleanupHotbarBroken(slot.id, this.hotbarActive)
      }

      this.ui.toast('Solo arado.', 800)
      this.sfx.hit?.('wood')
    })

    const sent = this._sendWorldEvent({ kind: 'plotTill', plotId, x: snap.x, z: snap.z, at: Date.now() })
    if (!sent) {
      const rec = this._pendingWorldActions.get(key)
      if (rec?.timeoutId) clearTimeout(rec.timeoutId)
      this._pendingWorldActions.delete(key)
      this.ui.toast('Sem conexão com o servidor (WS).', 1100)
    }
  }

  async waitInitialSync({ timeoutMs = 5000 } = {}) {
    // Wait for first snapshot + first chunk after WS connect.
    if (this._initialSyncOk) return true

    const start = performance.now()
    while (performance.now() - start < timeoutMs) {
      if (this._initialSnapshotReceived && this._initialChunkReceived) {
        this._initialSyncOk = true
        return true
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    return false
  }

  async playFromMenu() {
    // Always pick up any updated world selection from menu.
    const worldInput = document.querySelector('#worldId')
    const desiredWorldId = String(worldInput?.value || '').trim()
    if (desiredWorldId && this._persistCtx) this._persistCtx.worldId = desiredWorldId

    // Reset world-ish things first.
    this.trees.resetAll()
    this.rocks?.resetAll?.()
    this.fires.resetAll()
    this.forges.resetAll()
    this.ores.resetAll()
    this.ores.init({ points: this.mine.getOreSpawnPoints() })
    this.ores.setVisible(false)
    this.player.reset()

    // Load persisted state if available, otherwise start fresh.
    if (this._persistedState) {
      await this._applyPersistedState(this._persistedState)
      this.ui.toast('Save carregado.', 900)
    } else {
      this.score = 0
      this.ui.setScore(0)
      this.inventory.clear()

      // Start with one stone axe equipped in hotbar slot 2.
      this.hotbar = Array.from({ length: 10 }, (_, i) => (i === 0 ? { id: 'hand', qty: 1 } : null))
      this.hotbar[1] = {
        id: ItemId.AXE_STONE,
        qty: 1,
        meta: { tool: 'axe', tier: 'stone', dmg: TOOL_STATS.axe_stone.dmg, dur: TOOL_STATS.axe_stone.maxDur, maxDur: TOOL_STATS.axe_stone.maxDur },
      }
    }

    this._renderInventoryUI()
    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

    this.selectHotbar(0)

    this.state = 'playing'
    this.ui.showHUD()

    await this.sfx.enable()
    await this._lockPointer()

    // Multiplayer (MVP): connect WS when starting to play
    this._initialSyncOk = false
    this._initialSnapshotReceived = false
    this._initialChunkReceived = false
    this._connectWsIfPossible()

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
    this.ui.hideChest?.()
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
    this._disconnectWs()
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

    this._renderInventoryUI()
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
    this._disconnectWs()
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

    this._renderInventoryUI()
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

    this._renderInventoryUI()
    this.ui.renderEquipment?.(this.equipment, (id) => ITEMS[id])
    this.ui.setBuffLine?.(this._getBuffLine())
    this.ui.showInventory()
  }

  _getBuffLine() {
    const now = Date.now()
    const rem = Math.max(0, Number(this.buffs?.luckUntilMs || 0) - now)
    if (rem <= 0) return ''
    const s = Math.ceil(rem / 1000)
    const mm = Math.floor(s / 60)
    const ss = s % 60
    return `Sorte ativa: ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }

  _getLuckHudLine() {
    const now = Date.now()
    const rem = Math.max(0, Number(this.buffs?.luckUntilMs || 0) - now)
    if (rem <= 0) return ''
    const s = Math.ceil(rem / 1000)
    const mm = Math.floor(s / 60)
    const ss = s % 60
    return `🍎 Sorte x2: ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }

  _isEquipSlotName(name) {
    return name === 'hat' || name === 'shirt' || name === 'pants' || name === 'boots' || name === 'gloves' || name === 'backpack'
  }

  _recomputeInventoryCapacity() {
    // P8: only actual backpack item grants +10.
    const hasBackpack = this.equipment?.backpack?.id === ItemId.BACKPACK
    const desired = (this.inventoryBaseSlots || 20) + (hasBackpack ? 10 : 0)
    this._setInventorySlotCount(desired)
  }

  _setInventorySlotCount(n) {
    const desired = Math.max(1, Math.floor(Number(n) || 0))
    if (!this.inventory || this.inventory.slotCount === desired) return

    const overflow = this.inventory.resize(desired)
    if (overflow && overflow.length) {
      // Deterministic: discard overflow (matches previous behavior of overflow drops).
      this.ui.toast(`Inventário reduziu: ${overflow.length} item(ns) excedente(s) descartado(s).`, 1600)
    }

    // If inventory is open, rerender.
    if (this.state === 'inventory') {
      this._renderInventoryUI()
    }
  }

  _updateEquippedDurability(dt) {
    const ms = Math.max(0, Number(dt || 0)) * 1000
    if (!ms) return

    const DAY_MS = 24 * 60 * 60 * 1000

    for (const name of ['hat', 'shirt', 'pants', 'boots', 'gloves']) {
      const s = this.equipment?.[name]
      if (!s || !s.id) continue
      if (!s.meta) s.meta = {}

      if (typeof s.meta.equipRemainingMs !== 'number') s.meta.equipRemainingMs = DAY_MS
      s.meta.equipRemainingMs = Math.max(0, s.meta.equipRemainingMs - ms)

      if (s.meta.equipRemainingMs <= 0) {
        // Break: remove item entirely.
        this.equipment[name] = null
        this.ui.toast('Uma peça equipada se desgastou e quebrou.', 1400)
        this._recomputeInventoryCapacity?.()
      }
    }

    // Keep inventory UI fresh while open.
    if (this.state === 'inventory') {
      this.ui.renderEquipment?.(this.equipment, (id) => ITEMS[id])
      this.ui.setBuffLine?.(this._getBuffLine())
    }
  }

  async openForge(forgeId) {
    if (this.state !== 'playing') return
    const f = this.forges.get(forgeId)
    if (!f) return

    this.state = 'forge'
    this._activeForgeId = forgeId

    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    // Load server-side forge state (offline catch-up) best-effort.
    if (this._persistCtx?.worldId) {
      try {
        const { loadForgeState, renewForgeLock } = await import('../net/forgeState.js')
        const res = await loadForgeState({ worldId: this._persistCtx.worldId, forgeId, guestId: this._persistCtx.guestId })
        if (res?.ok === false && res?.error === 'locked') {
          this.ui.toast('Forja em uso.', 1100)
          this._activeForgeId = null
          this._forgeLockToken = null
          this._markTargetLocked('forge', forgeId)
          await this.returnToGameMode()
          return
        }
        const st = res?.state ?? res
        if (res?.lockToken) this._forgeLockToken = String(res.lockToken)
        this.forges.applyState?.(forgeId, st)

        // Renew lock while forge UI is open
        if (this._forgeLockTimer) clearInterval(this._forgeLockTimer)
        if (this._forgeLockToken) {
          this._forgeLockTimer = window.setInterval(() => {
            if (this.state !== 'forge') return
            if (!this._persistCtx?.worldId || !this._persistCtx?.guestId || !this._activeForgeId || !this._forgeLockToken) return
            renewForgeLock({ worldId: this._persistCtx.worldId, forgeId: this._activeForgeId, guestId: this._persistCtx.guestId, lockToken: this._forgeLockToken }).catch(() => null)
          }, 4000)
        }
      } catch {
        // keep local state if backend is unavailable
      }
    }

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

  async openChest(chestId) {
    if (this.state !== 'playing') return
    const ch = this.chests.get(chestId)
    if (!ch) return
    if (!this._persistCtx?.worldId || !this._persistCtx?.guestId) {
      this.ui.toast('Offline: baú indisponível.', 1100)
      return
    }

    this.state = 'chest'
    this._activeChestId = chestId

    this.player.setLocked(false)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()

    // Load (and create if missing) server-side chest state
    try {
      const { loadChestState } = await import('../net/chestState.js')
      const res = await loadChestState({ worldId: this._persistCtx.worldId, chestId, guestId: this._persistCtx.guestId })
      if (!res?.ok) {
        // Sem dono (forbidden) = trancado. Em uso (locked) = outra sessão do mesmo dono.
        if (res?.error === 'forbidden') {
          this.ui.toast('Trancado.', 1100)
          this._markTargetLocked('chest', chestId, 15000)
        } else if (res?.error === 'locked') {
          this.ui.toast('Baú em uso.', 1100)
        } else {
          this.ui.toast('Trancado.', 1100)
        }
        this._activeChestId = null
        this._chestLockToken = null
        await this.returnToGameMode()
        return
      }
      this._chestLockToken = String(res?.lockToken || '') || null
      this._chestSlots = Array.isArray(res?.state?.slots) ? res.state.slots.slice(0, 15) : Array.from({ length: 15 }, () => null)
      while (this._chestSlots.length < 15) this._chestSlots.push(null)

      // Renew lock while chest UI is open
      try {
        if (this._chestLockTimer) clearInterval(this._chestLockTimer)
        const lockToken = this._chestLockToken
        if (lockToken) {
          const { renewChestLock } = await import('../net/chestState.js')
          this._chestLockTimer = window.setInterval(() => {
            if (this.state !== 'chest') return
            if (!this._persistCtx?.worldId || !this._persistCtx?.guestId || !this._activeChestId || !this._chestLockToken) return
            renewChestLock({ worldId: this._persistCtx.worldId, chestId: this._activeChestId, guestId: this._persistCtx.guestId, lockToken: this._chestLockToken }).catch(() => null)
          }, 4000)
        }
      } catch {
        // ignore
      }
    } catch {
      this.ui.toast('Servidor indisponível (baú).', 1100)
      this._activeChestId = null
      await this.returnToGameMode()
      return
    }

    this.ui.showChest?.()
    this.ui.renderChestInventory?.(this.inventory.slots, (id) => ITEMS[id])
    this.ui.renderChest?.(this._chestSlots, (id) => ITEMS[id])
  }

  _queueChestSave(chestId = null) {
    if (this.state !== 'chest') return
    const cid = String(chestId || this._activeChestId || '')
    if (!cid) return
    if (!this._persistCtx?.worldId || !this._persistCtx?.guestId) return

    const worldId = this._persistCtx.worldId
    const guestId = this._persistCtx.guestId

    if (this._chestSaveTimer) clearTimeout(this._chestSaveTimer)
    this._chestSaveTimer = window.setTimeout(async () => {
      this._chestSaveTimer = 0
      try {
        const { saveChestState } = await import('../net/chestState.js')
        const lockToken = this._chestLockToken
        if (!lockToken) return
        const payload = { slots: (this._chestSlots || []).slice(0, 15) }
        const json = JSON.stringify(payload)
        if (json === this._chestLastSavedJson) return
        const res = await saveChestState({ worldId, chestId: cid, guestId, lockToken, state: payload })
        if (res?.ok) this._chestLastSavedJson = json
        if (res?.ok === false && res?.error === 'locked') {
          this.ui.toast('Baú trancou (sessão perdida).', 1200)
        }
      } catch {
        // silent
      }
    }, 600)
  }

  async closeChest() {
    if (this.state !== 'chest') return

    // Flush save best-effort
    try {
      if (this._chestSaveTimer) {
        clearTimeout(this._chestSaveTimer)
        this._chestSaveTimer = 0
      }
      this._queueChestSave(this._activeChestId)
    } catch {}

    const prevChestId = this._activeChestId
    const prevLock = this._chestLockToken

    if (this._chestLockTimer) {
      clearInterval(this._chestLockTimer)
      this._chestLockTimer = 0
    }

    this._activeChestId = null
    this._chestLockToken = null

    // Release lock best-effort (avoids waiting TTL when closing normally)
    try {
      if (prevChestId && prevLock && this._persistCtx?.worldId && this._persistCtx?.guestId) {
        const { releaseChestLock } = await import('../net/chestState.js')
        void releaseChestLock({ worldId: this._persistCtx.worldId, chestId: prevChestId, guestId: this._persistCtx.guestId, lockToken: prevLock })
      }
    } catch {}

    await this.returnToGameMode()
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
    if (this.state === 'inventory') this._renderInventoryUI()

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
      if (this.state === 'inventory') this._renderInventoryUI()
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
    this.ui.setNetDebug?.(this.perfEnabled ? 'NET: ...' : null)

    const btn = document.querySelector('#btnPerfToggle')
    if (btn) btn.textContent = `Performance: ${this.perfEnabled ? 'ON' : 'OFF'}`
  }

  toggleViewBob() {
    this._viewBobEnabled = !this._viewBobEnabled
    try {
      localStorage.setItem('woodcutter_view_bob', this._viewBobEnabled ? '1' : '0')
    } catch {
      // ignore
    }
    this.player.setViewBobEnabled?.(this._viewBobEnabled)

    const btn = document.querySelector('#btnViewBob')
    if (btn) btn.textContent = `View bob: ${this._viewBobEnabled ? 'ON' : 'OFF'}`
  }

  async closeInventory() {
    if (this.state !== 'inventory') return
    await this.returnToGameMode()
  }

  async closeForge() {
    if (this.state !== 'forge') return

    const fid = this._activeForgeId

    // Flush forge save best-effort before closing.
    try {
      if (this._forgeSaveTimer) {
        clearTimeout(this._forgeSaveTimer)
        this._forgeSaveTimer = 0
      }
      this._queueForgeSave(fid)
    } catch {
      // ignore
    }

    const prevForgeId = this._activeForgeId
    const prevLock = this._forgeLockToken

    if (this._forgeLockTimer) {
      clearInterval(this._forgeLockTimer)
      this._forgeLockTimer = 0
    }

    this._activeForgeId = null
    this._forgeLockToken = null

    // Release lock best-effort
    try {
      if (prevForgeId && prevLock && this._persistCtx?.worldId && this._persistCtx?.guestId) {
        const { releaseForgeLock } = await import('../net/forgeState.js')
        void releaseForgeLock({ worldId: this._persistCtx.worldId, forgeId: prevForgeId, guestId: this._persistCtx.guestId, lockToken: prevLock })
      }
    } catch {}

    await this.returnToGameMode()
  }

  _firstEmptyInvIdx() {
    return this.inventory?.slots?.findIndex((s) => !s) ?? -1
  }

  _firstEmptyChestIdx() {
    return Array.isArray(this._chestSlots) ? this._chestSlots.findIndex((s) => !s) : -1
  }

  _findStackOrEmptyIdx(arr, itemId) {
    if (!Array.isArray(arr) || !itemId) return -1
    const def = ITEMS[itemId]
    const maxStack = this.inventory?.maxStack ?? 100

    if (def?.stackable) {
      const stackIdx = arr.findIndex((s) => s && s.id === itemId && s.qty < maxStack)
      if (stackIdx >= 0) return stackIdx
    }

    return arr.findIndex((s) => !s)
  }

  _getEquipSlotForItem(itemId) {
    const def = ITEMS?.[itemId]
    const slot = def?.equipSlot
    if (!slot) return null
    return this._isEquipSlotName(slot) ? slot : null
  }

  invQuickAction(invIdx) {
    if (this.state !== 'inventory') return
    const idx = Number(invIdx)
    if (Number.isNaN(idx)) return
    const s = this.inventory?.slots?.[idx]
    if (!s) return

    if (s.id === ItemId.APPLE) {
      const removed = this.inventory.remove(ItemId.APPLE, 1)
      if (!removed) return
      this._activateAppleLuck()
      this.player.handAction?.()
      this.sfx.click?.()
      this.ui.toast('Você comeu uma maçã 🍎 (+Sorte)', 1000)
      this._postMoveUpdate()
      return
    }

    const slot = this._getEquipSlotForItem(s.id)
    if (slot) return void this.invEquipFromInventory(idx, slot)

    // Sem quick-move para hotbar por clique/duplo clique.
  }

  setInventoryHoverIndex(invIdx) {
    const idx = Number(invIdx)
    this._hoverInvIdx = Number.isInteger(idx) ? idx : -1
  }

  setInventorySelectedIndex(invIdx) {
    const idx = Number(invIdx)
    this._selectedInvIdx = Number.isInteger(idx) ? idx : -1
    if (this.state === 'inventory') this._renderInventoryUI()
  }

  _hotbarKeyLabelFromIdx(i) {
    return i === 9 ? '0' : String(i + 1)
  }

  _buildHotbarShortcutMap() {
    const map = {}
    for (let i = 1; i <= 9; i++) {
      const s = this.hotbar?.[i]
      if (!s?.id || s.id === 'hand') continue
      map[s.id] = this._hotbarKeyLabelFromIdx(i)
    }
    return map
  }

  clearHotbarSlot(hotIdx) {
    const idx = Number(hotIdx)
    if (!Number.isInteger(idx) || idx <= 0 || idx >= this.hotbar.length) return
    if (!this.hotbar[idx]) return
    this.hotbar[idx] = null
    if (this.hotbarActive === idx) this.selectHotbar(0)
    else this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
    if (this.state === 'inventory') this._renderInventoryUI()
    this._queuePlayerSave()
  }

  _renderInventoryUI() {
    this.ui.renderInventory(this.inventory.slots, (id) => ITEMS[id], {
      slotCountHint: this.inventory.slotCount,
      selectedIndex: this._selectedInvIdx,
      hotbarByItemId: this._buildHotbarShortcutMap(),
    })
  }

  _assignInventoryItemToHotbar(invIdx, hotIdx) {
    const idx = Number(invIdx)
    const hi = Number(hotIdx)
    if (!Number.isInteger(idx) || idx < 0) return false
    if (!Number.isInteger(hi) || hi < 0 || hi > 9) return false
    if (hi === 0) {
      this.ui.toast('Slot 1 é reservado para mão (fixo).', 1000)
      return false
    }

    const src = this.inventory?.slots?.[idx]
    if (!src) {
      this.ui.toast('Slot vazio.', 900)
      this.sfx.click?.()
      return false
    }

    // Item só pode existir em 1 slot da hotbar: remove de outros atalhos.
    for (let i = 1; i <= 9; i++) {
      if (i === hi) continue
      if (this.hotbar?.[i]?.id === src.id) this.hotbar[i] = null
    }

    this.hotbar[hi] = {
      id: src.id,
      qty: src.qty,
      meta: src.meta ? { ...src.meta } : undefined,
    }
    return true
  }

  assignHoverItemToHotbar(hotIdx) {
    if (this.state !== 'inventory') return
    const idx = Number(this._hoverInvIdx)
    if (!Number.isInteger(idx) || idx < 0) {
      this.ui.toast('Passe o mouse sobre um item do inventário.', 1000)
      this.sfx.click?.()
      return
    }
    if (!this._assignInventoryItemToHotbar(idx, hotIdx)) return

    this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)
    this._renderInventoryUI()
    const s = this.inventory?.slots?.[idx]
    this.ui.toast(`Atalho ${this._hotbarKeyLabelFromIdx(Number(hotIdx))}: ${ITEMS[s?.id]?.name || s?.id || ''}`, 900)
    this._queuePlayerSave()
  }

  invEquipFromInventory(invIdx, equipSlot) {
    if (this.state !== 'inventory') return
    const idx = Number(invIdx)
    if (Number.isNaN(idx)) return
    const slot = String(equipSlot || '')
    if (!this._isEquipSlotName(slot)) return

    const src = this.inventory.slots[idx]
    if (!src) return

    const expected = this._getEquipSlotForItem(src.id)
    if (expected !== slot) {
      this.ui.toast('Não é compatível com esse slot.', 1000)
      this.sfx.click()
      return
    }

    // Ensure durability meta only for clothing pieces (backpack has infinite duration)
    if (slot !== 'backpack') {
      if (!src.meta) src.meta = {}
      if (typeof src.meta.equipRemainingMs !== 'number') src.meta.equipRemainingMs = 24 * 60 * 60 * 1000
    }

    const prev = this.equipment[slot]
    this.equipment[slot] = { id: src.id, qty: 1, meta: src.meta ?? undefined }
    this.inventory.slots[idx] = prev ? { id: prev.id, qty: 1, meta: prev.meta ?? undefined } : null

    this._recomputeInventoryCapacity?.()
    this._postMoveUpdate()

    if (this.state === 'inventory') {
      this.ui.renderEquipment?.(this.equipment, (id) => ITEMS[id])
    }
  }

  equipQuickToInventory(equipSlot) {
    if (this.state !== 'inventory') return
    const slot = String(equipSlot || '')
    if (!this._isEquipSlotName(slot)) return

    const src = this.equipment?.[slot]
    if (!src) return

    let to = -1
    if (slot === 'backpack') {
      const base = Math.max(1, Math.floor(Number(this.inventoryBaseSlots || 20)))
      const hasItemsInExtraSlots = (this.inventory?.slots || []).slice(base).some(Boolean)
      if (hasItemsInExtraSlots) {
        this.ui.toast('Esvazie os slots extras da mochila antes de desequipar.', 1400)
        this.sfx.click()
        return
      }
      // Backpack item must move to a base slot; never to a removable extra slot.
      to = (this.inventory?.slots || []).slice(0, base).findIndex((s) => !s)
      if (to < 0) {
        this.ui.toast('Libere 1 slot no inventário base para desequipar a mochila.', 1400)
        this.sfx.click()
        return
      }
    } else {
      to = this._firstEmptyInvIdx()
      if (to < 0) {
        this.ui.toast('Inventário cheio.', 1000)
        this.sfx.click()
        return
      }
    }

    this.inventory.slots[to] = { id: src.id, qty: 1, meta: src.meta ?? undefined }
    this.equipment[slot] = null

    this._recomputeInventoryCapacity?.()
    this._postMoveUpdate()

    if (this.state === 'inventory') {
      this.ui.renderEquipment?.(this.equipment, (id) => ITEMS[id])
    }
  }

  invQuickToHotbar(invIdx) {
    if (this.state !== 'inventory') return
    const idx = Number(invIdx)
    if (Number.isNaN(idx)) return

    let hotIdx = Number(this.hotbarActive)
    if (!Number.isFinite(hotIdx) || hotIdx <= 0) hotIdx = 1

    // If target is occupied, try find an empty hotbar slot.
    if (this.hotbar[hotIdx]) {
      const empty = this.hotbar.findIndex((s, i) => i !== 0 && !s)
      if (empty > 0) hotIdx = empty
    }

    if (hotIdx <= 0) return
    this.moveItem({ from: 'inv', idx }, { to: 'hot', idx: hotIdx })
  }

  hotbarQuickToInventory(hotIdx) {
    if (this.state !== 'inventory') return
    const idx = Number(hotIdx)
    if (Number.isNaN(idx) || idx === 0) return

    const to = this._firstEmptyInvIdx()
    if (to < 0) {
      this.ui.toast('Inventário cheio.', 1000)
      this.sfx.click()
      return
    }

    this.moveItem({ from: 'hot', idx }, { to: 'inv', idx: to })
  }

  chestQuickAddFromInventory(invIdx) {
    if (this.state !== 'chest') return
    const from = Number(invIdx)
    if (Number.isNaN(from)) return

    const src = this.inventory.slots[from]
    if (!src) return

    const def = ITEMS[src.id]
    const maxStack = this.inventory?.maxStack ?? 100

    // Stackables: fill existing stacks first. Only use empty slot(s) if available.
    if (def?.stackable) {
      // 1) fill existing partial stacks
      for (let i = 0; i < this._chestSlots.length && src && src.qty > 0; i++) {
        const d = this._chestSlots[i]
        if (!d || d.id !== src.id) continue
        if (d.qty >= maxStack) continue
        const space = maxStack - d.qty
        const take = Math.min(space, src.qty)
        d.qty += take
        src.qty -= take
      }

      // 2) if still remaining, move to first empty slot (but only if there is one)
      while (src && src.qty > 0) {
        const empty = this._chestSlots.findIndex((s) => !s)
        if (empty < 0) break // no empty slot: do NOT create a new stack
        const take = Math.min(maxStack, src.qty)
        this._chestSlots[empty] = { id: src.id, qty: take }
        src.qty -= take
      }

      if (src.qty <= 0) this.inventory.slots[from] = null
      this._postMoveUpdate()
      return
    }

    // Non-stackable: move whole item only if there is an empty chest slot.
    const to = this._chestSlots.findIndex((s) => !s)
    if (to < 0) {
      this.ui.toast('Baú cheio.', 1000)
      this.sfx.click()
      return
    }

    this.moveItem({ from: 'inv', idx: from }, { to: 'chest', kind: 'chest', idx: to })
  }

  chestQuickBackToInventory(chestIdx) {
    if (this.state !== 'chest') return
    const from = Number(chestIdx)
    if (Number.isNaN(from)) return

    const to = this._firstEmptyInvIdx()
    if (to < 0) {
      this.ui.toast('Inventário cheio.', 1000)
      this.sfx.click()
      return
    }

    this.moveItem({ from: 'chest', kind: 'chest', idx: from }, { to: 'inv', idx: to })
  }

  _sortSlotsByName(slots) {
    const list = Array.isArray(slots) ? slots.slice() : []
    const items = list.filter((s) => s)
    const empties = list.length - items.length

    items.sort((a, b) => {
      const an = String(ITEMS[a.id]?.name ?? a.id)
      const bn = String(ITEMS[b.id]?.name ?? b.id)
      const c = an.localeCompare(bn, 'pt-BR')
      if (c !== 0) return c
      const c2 = String(a.id).localeCompare(String(b.id))
      if (c2 !== 0) return c2
      return (a.qty || 0) - (b.qty || 0)
    })

    while (items.length < list.length) items.push(null)
    // Ensure exact length
    items.length = list.length
    return items
  }

  sortInventory() {
    this.inventory.slots = this._sortSlotsByName(this.inventory.slots)
    this.ui.toast('Inventário ordenado.', 900)
    this._postMoveUpdate()
    this._queuePlayerSave()
  }

  sortChest() {
    if (this.state !== 'chest') return
    this._chestSlots = this._sortSlotsByName(this._chestSlots)
    this.ui.toast('Baú ordenado.', 900)
    this._postMoveUpdate()
    this._queueChestSave(this._activeChestId)
    this._queuePlayerSave()
  }

  forgeQuickAddFromInventory(invIdx) {
    if (this.state !== 'forge') return
    const f = this._activeForgeId ? this.forges.get(this._activeForgeId) : null
    if (!f) return

    const src = this.inventory.slots[invIdx]
    if (!src) return

    const maxStack = this.inventory?.maxStack ?? 100

    const moveInto = (dstArr, kind) => {
      const def = ITEMS[src.id]

      // stackable: fill existing, then use empty slot if any
      if (def?.stackable) {
        for (let i = 0; i < dstArr.length && src.qty > 0; i++) {
          const d = dstArr[i]
          if (!d || d.id !== src.id) continue
          if (d.qty >= maxStack) continue
          const space = maxStack - d.qty
          const take = Math.min(space, src.qty)
          d.qty += take
          src.qty -= take
        }

        while (src.qty > 0) {
          const empty = dstArr.findIndex((s) => !s)
          if (empty < 0) break
          const take = Math.min(maxStack, src.qty)
          dstArr[empty] = { id: src.id, qty: take }
          src.qty -= take
        }

        if (src.qty <= 0) this.inventory.slots[invIdx] = null
        this._postMoveUpdate()
        return true
      }

      // non-stackable: find empty and swap via moveItem
      const empty = dstArr.findIndex((s) => !s)
      if (empty < 0) return false
      this.moveItem({ from: 'inv', idx: invIdx }, { to: 'forge', kind, idx: empty })
      return true
    }

    // Prefer fuel if item is fuel, otherwise input if ore.
    if (src.id === ItemId.LOG || src.id === ItemId.STICK || src.id === ItemId.LEAF) {
      return void moveInto(f.fuel, 'fuel')
    }

    if (src.id === ItemId.IRON_ORE) {
      return void moveInto(f.input, 'in')
    }
  }

  toggleForgeEnabled() {
    if (this.state !== 'forge') return
    const f = this._activeForgeId ? this.forges.get(this._activeForgeId) : null
    if (!f) return

    // Always allow turning OFF (even if resources were removed).
    if (f.enabled) {
      f.enabled = false
      this.ui.toast('Forja desligada.', 900)
      this._postMoveUpdate()
      this._queueForgeSave(this._activeForgeId)
      return
    }

    // Turning ON requires resources.
    const hasFuel = (f.fuel || []).some((s) => s && s.qty > 0)
    const hasOre = (f.input || []).some((s) => s && s.qty > 0)

    if (!hasFuel || !hasOre) {
      this.ui.toast('Adicione combustível e minério.', 1000)
      return
    }

    f.enabled = true
    this.ui.toast('Forja ligada.', 900)
    this._postMoveUpdate()
    this._queueForgeSave(this._activeForgeId)
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
        this._queueForgeSave(this._activeForgeId)
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
      this._queueForgeSave(this._activeForgeId)
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
    this._queueForgeSave(this._activeForgeId)
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
          this.world.setGroundVisible(false)
          this.mine.setInteriorVisible(true)
          this.ores.setVisible(true)
          this.player.position.copy(this.mine.spawnMine)
          this.player.velocity.set(0, 0, 0)
        } else {
          this._inMine = false
          this.world.setGroundVisible(true)
          this.mine.setInteriorVisible(false)
          this.ores.setVisible(false)
          this.player.position.copy(this.mine.spawnWorld)
          this.player.velocity.set(0, 0, 0)
        }

        // Inform server about teleport target (authoritative position source).
        this.ws?.send({
          t: 'teleport',
          v: 1,
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z,
          at: Date.now(),
        })
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
        : modelTool === 'hoe' ? 'hoe_metal'
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
    else if (s.id === ItemId.CHEST) this.setTool('chest')
    else if (s.id === ItemId.HOE_METAL) this.setTool('hoe')
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
                    : this.tool === 'chest'
                      ? 'Baú selecionado.'
                      : this.tool === 'hoe'
                        ? 'Enxada equipada.'
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
      if (loc === 'chest') {
        if (this.state !== 'chest') return null
        if (kind !== 'chest') return null
        return this._chestSlots
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

    // Inventory -> hotbar (atalho): não move item, só referencia por id no atalho.
    if (from.from === 'inv' && to.to === 'hot') {
      const ok = this._assignInventoryItemToHotbar(sIdx, dIdx)
      if (!ok) return
      this._postMoveUpdate(sIdx, dIdx)
      return
    }

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

    // Chest rules: anything goes (personal storage)

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

  _markTargetLocked(kind, id, ms = 6000) {
    try {
      const k = `${String(kind)}:${String(id)}`
      this._lockedTargets.set(k, Date.now() + ms)
    } catch {}
  }

  _isTargetLocked(kind, id) {
    const k = `${String(kind)}:${String(id)}`
    const until = this._lockedTargets.get(k) || 0
    if (!until) return false
    if (Date.now() > until) {
      this._lockedTargets.delete(k)
      return false
    }
    return true
  }

  _queuePlayerSave() {
    if (!this._persistCtx?.save) return
    const now = Date.now()
    if (now < (this._nextPlayerSaveAt || 0)) return
    if (this._playerSaveTimer) clearTimeout(this._playerSaveTimer)
    this._playerSaveTimer = window.setTimeout(() => {
      this._playerSaveTimer = 0
      this._nextPlayerSaveAt = Date.now() + 1200
      void this.saveNow()
    }, 650)
  }

  _queueForgeSave(forgeId = null) {
    if (this.state !== 'forge') return
    const fid = String(forgeId || this._activeForgeId || '')
    if (!fid) return
    if (!this._persistCtx?.worldId || !this._persistCtx?.guestId) return

    const worldId = this._persistCtx.worldId
    const guestId = this._persistCtx.guestId

    if (this._forgeSaveTimer) clearTimeout(this._forgeSaveTimer)
    this._forgeSaveTimer = window.setTimeout(async () => {
      this._forgeSaveTimer = 0
      try {
        const st = this.forges.exportState?.(fid)
        if (!st) return
        const lockToken = this._forgeLockToken
        if (!lockToken) return
        const json = JSON.stringify(st)
        if (json === this._forgeLastSavedJson) return
        const { saveForgeState } = await import('../net/forgeState.js')
        const res = await saveForgeState({ worldId, forgeId: fid, guestId, lockToken, state: st })
        if (res?.ok) this._forgeLastSavedJson = json
        if (res?.ok === false && res?.error === 'locked') {
          this.ui.toast('Forja trancou (sessão perdida).', 1200)
          this._markTargetLocked('forge', fid)
        }
      } catch {
        // silent
      }
    }, 600)
  }

  _postMoveUpdate() {
    // Keep hand fixed.
    this.hotbar[0] = { id: 'hand', qty: 1 }

    // Re-render if inventory/forge/chest open.
    if (this.state === 'inventory' || this.state === 'forge' || this.state === 'chest') {
      if (this.state === 'inventory') {
        this._renderInventoryUI()
        this.ui.renderEquipment?.(this.equipment, (id) => ITEMS[id])
        this.ui.setBuffLine?.(this._getBuffLine())
      }

      if (this.state === 'forge') {
        this.ui.renderForgeInventory(this.inventory.slots, (id) => ITEMS[id])
        if (this._activeForgeId) {
          const f = this.forges.get(this._activeForgeId)
          if (f) this.ui.renderForge(f, (id) => ITEMS[id], { secondsPerIngot: this.forges.secondsPerIngot })
        }
      }

      if (this.state === 'chest') {
        this.ui.renderChestInventory?.(this.inventory.slots, (id) => ITEMS[id])
        this.ui.renderChest?.(this._chestSlots, (id) => ITEMS[id])
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

    // Persist forge/chest state server-side (debounced)
    if (this.state === 'forge') this._queueForgeSave(this._activeForgeId)
    if (this.state === 'chest') this._queueChestSave(this._activeChestId)

    // Persist player state more aggressively when transferring items (prevents item loss).
    if (this.state === 'forge' || this.state === 'chest') this._queuePlayerSave()
  }

  // ----------------- persistence -----------------

  /** @param {{guestId:string, worldId:string, token?:string, save:(state:any)=>Promise<void>}|null} ctx */
  setPersistenceContext(ctx) {
    this._persistCtx = ctx
  }

  /** @param {any|null} state */
  setPersistedState(state) {
    this._persistedState = state
  }

  async _applyPersistedState(state) {
    const { applyGameSave } = await import('../net/gameSave.js')
    applyGameSave(this, state)
    this._recomputeInventoryCapacity?.()
  }

  async saveNow() {
    if (!this._persistCtx?.save) return
    const { exportGameSave } = await import('../net/gameSave.js')
    try {
      await this._persistCtx.save(exportGameSave(this))
    } catch {
      // Silent: do not spam toasts.
    }
  }

  // ----------------- multiplayer (WS MVP) -----------------

  _connectWsIfPossible() {
    if (this.ws) return
    if (!this._persistCtx?.guestId || !this._persistCtx?.worldId || !this._persistCtx?.token) return

    this._wsGen = (this._wsGen || 0) + 1
    const gen = this._wsGen

    this.ws = new WsClient({
      maxAttempts: 5,
      onOpen: () => {
        if (gen !== this._wsGen) return
        this.ws?.send({
          t: 'join',
          v: 1,
          // guestId is kept for backward compatibility/debug, but server trusts token.
          guestId: this._persistCtx.guestId,
          worldId: this._persistCtx.worldId,
          token: this._persistCtx.token,
          spawn: {
            x: this.player.position.x,
            y: this.player.position.y,
            z: this.player.position.z,
          },
        })
      },
      onClose: ({ reason } = {}) => {
        if (gen !== this._wsGen) return

        this.wsMeId = null
        this.remotePlayers.clear()

        // Clear pending actions to avoid granting loot on late chunks from an old session.
        for (const rec of this._pendingWorldActions.values()) {
          if (rec?.timeoutId) clearTimeout(rec.timeoutId)
        }
        this._pendingWorldActions.clear()

        if (reason === 'max_attempts') {
          this.ui.toast('Multiplayer: não foi possível reconectar.', 1600)
        }
      },
      onStatus: (s) => {
        if (gen !== this._wsGen) return
        this._wsConnected = s === 'ok'
        if (s === 'connecting') this.ui.toast('Reconectando...', 800)
      },
      onMessage: (msg) => {
        if (gen !== this._wsGen) return
        this._onWsMessage(msg)
      },
    })

    this.ws.connect()
  }

  _onWsMessage(msg) {
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'welcome') {
      this.wsMeId = msg.id
      return
    }
    if (msg.t === 'worldEventResult') {
      const kind = String(msg.kind || '')
      const id = String(msg.id || '')
      const ok = !!msg.ok
      const key = `${kind}:${id}`
      const rec = this._pendingWorldActions.get(key)
      if (!rec) return

      if (!ok) {
        if (rec.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(key)

        const reason = String(msg.reason || '')
        if (reason === 'already_removed') this.ui.toast('Já foi coletado por outro jogador.', 1100)
        else if (reason === 'duplicate') this.ui.toast('Já existe.', 900)
        else if (reason === 'not_ready') this.ui.toast('Ainda não está crescida.', 1100)
        else if (reason === 'not_empty') this.ui.toast('Esvazie o baú primeiro.', 1200)
        else this.ui.toast(`Ação rejeitada pelo servidor (${reason}).`, 1300)
        return
      }

      // For place removals, we can apply immediately on confirmation.
      // (Unlike trees/rocks which rely on removedIds list, placed removals are represented as "missing" in chunk state.)
      if (kind === 'placeRemove') {
        if (rec.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(key)
        rec.fn?.()
        return
      }

      rec.accepted = true
      // If the worldChunk already arrived (object removed), the next chunk apply will trigger fn.
      return
    }
    if (msg.t === 'error') {
      const code = String(msg.code || '')
      if (code === 'auth_expired' || code === 'auth_invalid' || code === 'auth_required') {
        this.ui.toast('Multiplayer: sessão expirada. Reautenticando...', 1400)
        // Refresh token and reconnect.
        ;(async () => {
          try {
            const { ensureGuest } = await import('../net/persistence.js')
            const next = await ensureGuest()
            if (this._persistCtx) this._persistCtx.token = next.token
          } catch {
            // ignore
          }
          try { this.ws?.close() } catch {}
        })()
      }
      return
    }
    if (msg.t === 'worldChunk') {
      this._applyWorldChunk(msg)
      this._initialChunkReceived = true
      return
    }
    if (msg.t === 'snapshot') {
      const players = Array.isArray(msg.players)
        ? msg.players.map((p) => {
            if (Array.isArray(p)) {
              // compact tuple: [id,x,y,z,yaw]
              return { id: p[0], x: p[1], y: p[2], z: p[3], yaw: p[4] }
            }
            return p
          })
        : []

      this.remotePlayers.applySnapshot({ meId: this.wsMeId, players })

      const me = players.find((p) => p.id === this.wsMeId)
      if (me) this._lastServerMe = me
      this._initialSnapshotReceived = true
      if (me && this.state === 'playing') {
        this._applyServerCorrection(me)
      }
    }
  }

  _setPendingWorldAction(key, fn) {
    // If something stays pending for too long, clear it to avoid free loot on late chunk updates.
    const timeoutId = window.setTimeout(() => {
      const rec = this._pendingWorldActions.get(key)
      if (!rec) return
      this._pendingWorldActions.delete(key)
      this.ui.toast('Servidor não confirmou a ação (timeout).', 1100)
    }, 2500)

    this._pendingWorldActions.set(key, { fn, accepted: false, timeoutId })
  }

  _sendWorldEvent(ev) {
    // World events are identified server-side by the WS connection (after join).
    // Do not require wsMeId/welcome here.
    if (!this.ws || !this._wsConnected) return false
    this.ws.send({ t: 'worldEvent', v: 1, ...ev })
    return true
  }

  _applyWorldChunk(msg) {
    if (!msg?.state || typeof msg.state !== 'object') return

    const st = msg.state

    const removedTrees = Array.isArray(st.removedTrees) ? st.removedTrees : []
    const removedRocks = Array.isArray(st.removedRocks) ? st.removedRocks : []
    const removedSticks = Array.isArray(st.removedSticks) ? st.removedSticks : []
    const removedBushes = Array.isArray(st.removedBushes) ? st.removedBushes : []
    const farmPlots = Array.isArray(st.farmPlots) ? st.farmPlots : []
    const removedOres = Array.isArray(st.removedOres) ? st.removedOres : []
    const placed = Array.isArray(st.placed) ? st.placed : []

    // Trees can respawn (server-authoritative): apply full chunk state every time.
    for (const id of removedTrees) {
      const sid = String(id)
      const k = `treeCut:${sid}`
      const rec = this._pendingWorldActions.get(k)
      if (rec?.accepted) {
        if (rec.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(k)
        rec.fn()
      }
    }

    this.trees.applyChunkState(msg.chunkX, msg.chunkZ, removedTrees)

    // Rocks can respawn (server-authoritative): apply full chunk state every time.
    // First, resolve any pending confirmations (grant item, etc.).
    for (const id of removedRocks) {
      const sid = String(id)
      const k = `rockCollect:${sid}`
      const rec = this._pendingWorldActions.get(k)
      if (rec?.accepted) {
        if (rec.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(k)
        rec.fn()
      }
    }

    this.rocks.applyChunkState(msg.chunkX, msg.chunkZ, removedRocks)

    // Sticks can respawn (server-authoritative): apply full chunk state every time.
    for (const id of removedSticks) {
      const sid = String(id)
      const k = `stickCollect:${sid}`
      const rec = this._pendingWorldActions.get(k)
      if (rec?.accepted) {
        if (rec.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(k)
        rec.fn()
      }
    }
    this.sticks.applyChunkState(msg.chunkX, msg.chunkZ, removedSticks)

    // Bushes can respawn (server-authoritative): apply full chunk state every time.
    for (const id of removedBushes) {
      const sid = String(id)
      const k = `bushCollect:${sid}`
      const rec = this._pendingWorldActions.get(k)
      if (rec?.accepted) {
        if (rec.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(k)
        rec.fn()
      }
    }
    this.bushes.applyChunkState(msg.chunkX, msg.chunkZ, removedBushes)

    // Farm plots (server-authoritative): apply full chunk state every time.
    for (const p of farmPlots) {
      const sid = String(p?.id || '')
      if (!sid) continue
      for (const kind of ['plotTill', 'plant', 'harvest']) {
        const k = `${kind}:${sid}`
        const rec = this._pendingWorldActions.get(k)
        if (rec?.accepted) {
          if (rec.timeoutId) clearTimeout(rec.timeoutId)
          this._pendingWorldActions.delete(k)
          rec.fn()
        }
      }
    }
    this.farm.applyChunkState(msg.chunkX, msg.chunkZ, farmPlots)

    // Ores can respawn (server-authoritative): apply full chunk state every time.
    for (const id of removedOres) {
      const sid = String(id)
      const k = `oreBreak:${sid}`
      const rec = this._pendingWorldActions.get(k)
      if (rec?.accepted) {
        if (rec.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(k)
        rec.fn()
      }
    }

    this.ores.applyChunkState(msg.chunkX, msg.chunkZ, removedOres)

    const ck = `${Number(msg.chunkX)}:${Number(msg.chunkZ)}`
    const prev = this._placedByChunk.get(ck) || new Map()
    const nextMap = new Map()

    // Build next map from authoritative state
    for (const p of placed) {
      const type = String(p?.type || '')
      const id = String(p?.id || '')
      const x = Number(p?.x)
      const z = Number(p?.z)
      if (!type || !id || !Number.isFinite(x) || !Number.isFinite(z)) continue
      nextMap.set(id, { type, x, z })
    }

    // Apply removals (present before, missing now)
    for (const [id, info] of prev) {
      if (nextMap.has(id)) continue
      const type = info?.type
      if (type === 'campfire') {
        this.fires.remove(id)
        this._appliedWorld.campfires.delete(id)
      } else if (type === 'forge') {
        this.forges.remove(id)
        this._appliedWorld.forges.delete(id)
      } else if (type === 'forgeTable') {
        this.forgeTables.remove(id)
        this._appliedWorld.forgeTables.delete(id)
      } else if (type === 'chest') {
        this.chests.remove(id)
        this._appliedWorld.chests.delete(id)
      }
    }

    // Apply adds/updates
    for (const [id, info] of nextMap) {
      const type = info.type
      const x = info.x
      const z = info.z

      if (type === 'campfire') {
        if (!this._appliedWorld.campfires.has(id)) {
          this._appliedWorld.campfires.add(id)
          this.fires.place({ x, y: 0, z }, id)
        }
      } else if (type === 'forge') {
        if (!this._appliedWorld.forges.has(id)) {
          this._appliedWorld.forges.add(id)
          this.forges.place({ x, z }, id)
        }
      } else if (type === 'forgeTable') {
        if (!this._appliedWorld.forgeTables.has(id)) {
          this._appliedWorld.forgeTables.add(id)
          this.forgeTables.place({ x, z }, id)
          this._hasForgeTableBuilt = true
        }
      } else if (type === 'chest') {
        if (!this._appliedWorld.chests.has(id)) {
          this._appliedWorld.chests.add(id)
          this.chests.place({ x, z }, id)
        }
      }

      const k = `place:${id}`
      const rec = this._pendingWorldActions.get(k)
      if (rec?.accepted) {
        if (rec.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(k)
        rec.fn()
      }
    }

    // Store authoritative state for this chunk
    const prevStored = new Map()
    for (const [id, info] of nextMap) prevStored.set(id, { type: info.type })
    this._placedByChunk.set(ck, prevStored)
  }

  _sendWsInput(dt) {
    if (!this.ws || !this._wsConnected) return
    const now = performance.now()
    if (now - (this._wsPoseAt || 0) < 50) return // 20Hz
    this._wsPoseAt = now

    this._wsSeq = (this._wsSeq || 0) + 1
    const inp = this.player.getNetInput()
    this._lastNetInput = inp

    this.ws.send({
      t: 'input',
      v: 1,
      seq: this._wsSeq,
      dt,
      keys: inp.keys,
      yaw: inp.yaw,
      pitch: inp.pitch,
      at: Date.now(),
    })
  }

  _applyServerCorrection(me) {
    const now = Date.now()

    // When the player is actively moving, positional reconciliation can feel like "rubber banding".
    // Prefer local feel while moving; keep yaw gently aligned.
    const k = this._lastNetInput?.keys
    const moving = !!(k && (k.w || k.a || k.s || k.d))
    if (moving) {
      const yawT = me.yaw || 0
      const dy = ((yawT - this.player.yaw.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      this.player.yaw.rotation.y += dy * 0.10
      return
    }

    // PERF/feel: avoid constant tiny corrections that "fight" the local movement.
    // Apply reconciliation at a limited rate.
    if (now < (this._reconNextAt || 0)) return
    this._reconNextAt = now + 80

    if (now < (this._reconCooldownUntil || 0)) {
      // When pressed against geometry, reconciliation tends to jitter.
      // Keep yaw gently aligned but avoid positional corrections for a short cooldown.
      const yawT = me.yaw || 0
      const dy = ((yawT - this.player.yaw.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      this.player.yaw.rotation.y += dy * 0.10
      return
    }
    const tx = me.x || 0
    const ty = me.y || this.player.eyeHeight
    const tz = me.z || 0

    const dx = tx - this.player.position.x
    const dz = tz - this.player.position.z
    const dist = Math.hypot(dx, dz)

    // Deadzone avoids micro-jitter when close enough.
    // Slightly larger to prevent constant small pulls that feel like movement stutter.
    const deadzone = 0.45
    if (dist < deadzone) {
      // still align yaw a bit
      const yawT = me.yaw || 0
      const dy = ((yawT - this.player.yaw.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      this.player.yaw.rotation.y += dy * 0.15
      return
    }

    // Clamp correction step to avoid pulling through walls.
    const maxStep = 0.25
    const step = Math.min(maxStep, dist)
    const nx = dx / (dist || 1)
    const nz = dz / (dist || 1)

    const beforeX = this.player.position.x
    const beforeZ = this.player.position.z

    const next = this.player.position.clone()
    next.x += nx * step
    next.z += nz * step

    // Y correction (clamped to ground constraints)
    const groundY = this._lastGroundY || 0
    const minY = groundY + this.player.eyeHeight
    next.y = Math.max(minY, ty)

    // Apply collision-aware correction
    this.player.resolveCollisions(next, this._lastColliders || [])

    const moved = Math.hypot(next.x - beforeX, next.z - beforeZ)
    // If collision resolution prevented most of our intended correction step,
    // we are likely pressed against geometry: back off reconciliation briefly.
    if (moved < step * 0.65) {
      this._reconCooldownUntil = now + 220
    }

    this.player.position.copy(next)

    // Only hard-reset velocity on big corrections; otherwise it feels like "sticky" movement.
    if (dist > 1.2) this.player.velocity.set(0, 0, 0)

    const yawT = me.yaw || 0
    const dy = ((yawT - this.player.yaw.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    this.player.yaw.rotation.y += dy * 0.25
  }

  _disconnectWs() {
    this.ws?.close()
    this.ws = null
    this.wsMeId = null
    this.remotePlayers.clear()
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

    const placeId = crypto.randomUUID?.() ?? String(Math.random()).slice(2)
    const key = `place:${placeId}`

    this._setPendingWorldAction(key, () => {
      this.forgeTables.place({ x: this._ghostX, z: this._ghostZ }, placeId)
      this._registerPlacedLocal('forgeTable', placeId, this._ghostX, this._ghostZ)

      // Consume current hotbar stack
      slot.qty = Math.max(0, (slot.qty ?? 1) - 1)
      if (slot.qty <= 0) this.hotbar[this.hotbarActive] = null

      // Unlock metal recipes in UI sense (station gating).
      this._hasForgeTableBuilt = true

      this.ui.toast('Mesa de forja colocada.', 900)
      this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

      if (!this.hotbar[this.hotbarActive]) this.selectHotbar(0)
    })

    const sent = this._sendWorldEvent({ kind: 'place', placeKind: 'forgeTable', id: placeId, x: this._ghostX, z: this._ghostZ, at: Date.now() })
    if (!sent) {
      const rec = this._pendingWorldActions.get(key)
      if (rec?.timeoutId) clearTimeout(rec.timeoutId)
      this._pendingWorldActions.delete(key)
      this.ui.toast('Sem conexão com o servidor (WS).', 1100)
    }
  }

  _updateChestGhost() {
    const p = raycastGround(this.camera)
    if (!p) {
      this._ghostValid = false
      this._chestGhost.setValid(false)
      return
    }

    const x = Math.round(p.x * 10) / 10
    const z = Math.round(p.z * 10) / 10
    this._ghostX = x
    this._ghostZ = z

    const dx = x - this.player.position.x
    const dz = z - this.player.position.z
    const d = Math.hypot(dx, dz)

    const nearFire = this.fires.getNearest({ x, z }, 1.6)
    const nearForge = this._getNearestForge({ x, z }, 2.0)
    const nearTable = this.forgeTables.getColliders().some((c) => Math.hypot(c.x - x, c.z - z) < 2.0)
    const nearChest = this.chests.getColliders().some((c) => Math.hypot(c.x - x, c.z - z) < 1.6)

    // Must be within reach; server also validates with WOODCUTTER_WORLD_EVENT_RADIUS.
    const ok = d >= 1.2 && d <= 3.0 && !nearFire && !nearForge && !nearTable && !nearChest
    this._ghostValid = ok
    this._chestGhost.setValid(ok)
    this._chestGhost.setPos(x, z)
  }

  _chunkOfPos(x, z) {
    const chunkSize = 32
    return { cx: Math.floor(x / chunkSize), cz: Math.floor(z / chunkSize) }
  }

  _registerPlacedLocal(type, id, x, z) {
    const { cx, cz } = this._chunkOfPos(x, z)
    const ck = `${cx}:${cz}`
    const prev = this._placedByChunk.get(ck) || new Map()
    prev.set(String(id), { type, x, z })
    this._placedByChunk.set(ck, prev)

    if (type === 'campfire') this._appliedWorld.campfires.add(String(id))
    else if (type === 'forge') this._appliedWorld.forges.add(String(id))
    else if (type === 'forgeTable') this._appliedWorld.forgeTables.add(String(id))
    else if (type === 'chest') this._appliedWorld.chests.add(String(id))
  }

  _unregisterPlacedLocal(type, id) {
    const sid = String(id)
    for (const m of this._placedByChunk.values()) m.delete(sid)
    if (type === 'campfire') this._appliedWorld.campfires.delete(sid)
    else if (type === 'forge') this._appliedWorld.forges.delete(sid)
    else if (type === 'forgeTable') this._appliedWorld.forgeTables.delete(sid)
    else if (type === 'chest') this._appliedWorld.chests.delete(sid)
  }

  _placeChestAtGhost() {
    const slot = this.hotbar[this.hotbarActive]
    if (!slot || slot.id !== ItemId.CHEST) return

    const placeId = crypto.randomUUID?.() ?? String(Math.random()).slice(2)
    const key = `place:${placeId}`

    this._setPendingWorldAction(key, () => {
      // Place locally for responsiveness, but also mark as applied + register in chunk map
      // to avoid duplicates and to allow later removals to work.
      this.chests.place({ x: this._ghostX, z: this._ghostZ }, placeId)
      this._registerPlacedLocal('chest', placeId, this._ghostX, this._ghostZ)

      slot.qty = Math.max(0, (slot.qty ?? 1) - 1)
      if (slot.qty <= 0) this.hotbar[this.hotbarActive] = null

      this.ui.toast('Baú colocado.', 900)
      this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

      if (!this.hotbar[this.hotbarActive]) this.selectHotbar(0)
    })

    const sent = this._sendWorldEvent({ kind: 'place', placeKind: 'chest', id: placeId, x: this._ghostX, z: this._ghostZ, at: Date.now() })
    if (!sent) {
      const rec = this._pendingWorldActions.get(key)
      if (rec?.timeoutId) clearTimeout(rec.timeoutId)
      this._pendingWorldActions.delete(key)
      this.ui.toast('Sem conexão com o servidor (WS).', 1100)
    }
  }

  _placeForgeAtGhost() {
    const slot = this.hotbar[this.hotbarActive]
    if (!slot || slot.id !== ItemId.FORGE) return

    const placeId = crypto.randomUUID?.() ?? String(Math.random()).slice(2)
    const key = `place:${placeId}`

    this._setPendingWorldAction(key, () => {
      this.forges.place({ x: this._ghostX, z: this._ghostZ }, placeId)
      this._registerPlacedLocal('forge', placeId, this._ghostX, this._ghostZ)

      // Consume current hotbar stack
      slot.qty = Math.max(0, (slot.qty ?? 1) - 1)
      if (slot.qty <= 0) this.hotbar[this.hotbarActive] = null

      this.ui.toast('Forja colocada.', 900)
      this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

      if (!this.hotbar[this.hotbarActive]) this.selectHotbar(0)
    })

    const sent = this._sendWorldEvent({ kind: 'place', placeKind: 'forge', id: placeId, x: this._ghostX, z: this._ghostZ, at: Date.now() })
    if (!sent) {
      const rec = this._pendingWorldActions.get(key)
      if (rec?.timeoutId) clearTimeout(rec.timeoutId)
      this._pendingWorldActions.delete(key)
      this.ui.toast('Sem conexão com o servidor (WS).', 1100)
    }
  }

  _placeCampfireAtGhost() {
    const slot = this.hotbar[this.hotbarActive]
    if (!slot || slot.id !== ItemId.CAMPFIRE) return

    const placeId = crypto.randomUUID?.() ?? String(Math.random()).slice(2)
    const key = `place:${placeId}`

    this._setPendingWorldAction(key, () => {
      this.fires.place({ x: this._ghostX, y: 0, z: this._ghostZ }, placeId)
      this._registerPlacedLocal('campfire', placeId, this._ghostX, this._ghostZ)

      // Consume only the currently selected hotbar stack.
      slot.qty = Math.max(0, (slot.qty ?? 1) - 1)
      if (slot.qty <= 0) this.hotbar[this.hotbarActive] = null

      this.ui.toast('Fogueira colocada.', 900)
      this.ui.renderHotbar(this.hotbar, (id) => this._getHotbarItemDef(id), this.hotbarActive)

      // Do not clear other campfires bound to other slots.
      if (!this.hotbar[this.hotbarActive]) this.selectHotbar(0)
    })

    const sent = this._sendWorldEvent({ kind: 'place', placeKind: 'campfire', id: placeId, x: this._ghostX, z: this._ghostZ, at: Date.now() })
    if (!sent) {
      const rec = this._pendingWorldActions.get(key)
      if (rec?.timeoutId) clearTimeout(rec.timeoutId)
      this._pendingWorldActions.delete(key)
      this.ui.toast('Sem conexão com o servidor (WS).', 1100)
    }
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

    const rockHit = this.rocks.raycastFromCamera(this.camera)
    const stickHit = this.sticks.raycastFromCamera(this.camera)
    const bushHit = this.bushes.raycastFromCamera(this.camera)

    // Choose nearest.
    const hits = [
      rockHit ? { kind: 'rock', ...rockHit } : null,
      stickHit ? { kind: 'stick', ...stickHit } : null,
      bushHit ? { kind: 'bush', ...bushHit } : null,
    ].filter(Boolean)

    let hit = null
    for (const h of hits) {
      if (!hit || h.distance < hit.distance) hit = h
    }

    if (!hit || hit.distance > 2.0) {
      this.ui.toast('Nada para pegar por perto.', 800)
      return
    }

    if (hit.kind === 'rock') {
      // Strict: wait for server accept + chunk confirmation to remove + grant item.
      const rockId = String(hit.rockId)
      const key = `rockCollect:${rockId}`
      this._setPendingWorldAction(key, () => {
        const ok = this.rocks.collect(rockId, { world: true })
        if (!ok) return

        const stoneQty = this._withLuckMultiplier(1)
        const overflow = this.inventory.add(ItemId.STONE, stoneQty)
        if (overflow) {
          this.ui.toast('Inventário cheio: pedra descartada.', 1200)
          this.sfx.click()
        } else {
          this.ui.toast(`Pegou: +${stoneQty} pedra`, 900)
          this.sfx.pickup()
          if (this.state === 'inventory') this._renderInventoryUI()
        }
      })

      const px = hit.point?.x ?? this.player.position.x
      const pz = hit.point?.z ?? this.player.position.z
      const sent = this._sendWorldEvent({ kind: 'rockCollect', rockId, x: px, z: pz, at: Date.now() })
      if (!sent) {
        const rec = this._pendingWorldActions.get(key)
        if (rec?.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(key)
        this.ui.toast('Sem conexão com o servidor (WS).', 1100)
      }

      return
    }

    if (hit.kind === 'stick') {
      const stickId = String(hit.stickId)
      const key = `stickCollect:${stickId}`
      this._setPendingWorldAction(key, () => {
        const ok = this.sticks.collect(stickId, { world: true })
        if (!ok) return

        const stickQty = this._withLuckMultiplier(1)
        const overflow = this.inventory.add(ItemId.STICK, stickQty)
        if (overflow) {
          this.ui.toast('Inventário cheio: galho descartado.', 1200)
          this.sfx.click()
        } else {
          this.ui.toast(`Pegou: +${stickQty} galho`, 900)
          this.sfx.pickup()
          if (this.state === 'inventory') this._renderInventoryUI()
        }
      })

      const px = hit.point?.x ?? this.player.position.x
      const pz = hit.point?.z ?? this.player.position.z
      const sent = this._sendWorldEvent({ kind: 'stickCollect', stickId, x: px, z: pz, at: Date.now() })
      if (!sent) {
        const rec = this._pendingWorldActions.get(key)
        if (rec?.timeoutId) clearTimeout(rec.timeoutId)
        this._pendingWorldActions.delete(key)
        this.ui.toast('Sem conexão com o servidor (WS).', 1100)
      }
      return
    }

    // bush
    const bushId = String(hit.bushId)
    const key = `bushCollect:${bushId}`
    this._setPendingWorldAction(key, () => {
      const ok = this.bushes.collect(bushId, { world: true })
      if (!ok) return

      // Drops: always leaves + 20% cotton_seed. Luck doubles bush quantities.
      const gotSeed = Math.random() < 0.20
      const leavesQty = this._withLuckMultiplier(2)
      const seedQty = gotSeed ? this._withLuckMultiplier(1) : 0

      const dropped = []
      const overflowLeaf = this.inventory.add(ItemId.LEAF, leavesQty)
      if (overflowLeaf) dropped.push(`${overflowLeaf} ${ITEMS[ItemId.LEAF].name}`)

      let overflowSeed = 0
      if (seedQty > 0) {
        overflowSeed = this.inventory.add(ItemId.COTTON_SEED, seedQty)
        if (overflowSeed) dropped.push(`${overflowSeed} ${ITEMS[ItemId.COTTON_SEED].name}`)
      }

      const seedWord = seedQty === 1 ? 'semente' : 'sementes'
      const msg = seedQty > 0
        ? (dropped.length ? `Coletou: +${leavesQty} folhas +${seedQty} ${seedWord} (excedente descartado)` : `Coletou: +${leavesQty} folhas +${seedQty} ${seedWord}`)
        : (dropped.length ? `Coletou: +${leavesQty} folhas (excedente descartado)` : `Coletou: +${leavesQty} folhas`)

      if (dropped.length) this.sfx.click()
      else this.sfx.pickup()

      this.ui.toast(msg, 1100)
      if (this.state === 'inventory') this._renderInventoryUI()
    })

    // IMPORTANT: use root position for chunking (hit.point can be across chunk border on large hitbox)
    const px = Number.isFinite(hit.x) ? hit.x : (hit.point?.x ?? this.player.position.x)
    const pz = Number.isFinite(hit.z) ? hit.z : (hit.point?.z ?? this.player.position.z)
    const sent = this._sendWorldEvent({ kind: 'bushCollect', bushId, x: px, z: pz, at: Date.now() })
    if (!sent) {
      const rec = this._pendingWorldActions.get(key)
      if (rec?.timeoutId) clearTimeout(rec.timeoutId)
      this._pendingWorldActions.delete(key)
      this.ui.toast('Sem conexão com o servidor (WS).', 1100)
    }
  }

  _loop = () => {
    if (!this._running) return

    const dt = clamp(this.clock.getDelta(), 0, 0.033)

    // Perf overlay updates even in pause/menus (cheap).
    this.perf.update(dt)
    this.ui.setPerf({ fps: this.perf.fps, frameMs: this.perf.frameMs, memMB: this.perf.memMB })

    const remoteCount = this.remotePlayers?.players?.size ?? 0
    const wsStatus = this.ws?.status || (this._wsConnected ? 'ok' : 'off')
    const extra = this.remotePlayers?.getDebugLine?.()
    const srv = this._lastServerMe
    const drift = srv
      ? Math.hypot((srv.x || 0) - this.player.position.x, (srv.z || 0) - this.player.position.z)
      : null
    const netLines = [
      `NET: WS ${wsStatus}`,
      `remote: ${remoteCount}${this.wsMeId ? ` • me: ${String(this.wsMeId).slice(0, 8)}` : ''}`,
      drift != null ? `drift: ${drift.toFixed(2)}` : null,
      extra ? String(extra) : null,
    ].filter(Boolean)
    this.ui.setNetDebug?.(this.perfEnabled ? netLines.join('\n') : null)

    // Contextual interaction hint (only when playing + locked).
    if (this.state === 'playing' && document.pointerLockElement === this.canvas) {
      const t = this._getInteractTarget()
      if (t) this.ui.setInteractHint(`F: ${t.primaryLabel} ${t.name ? t.name : ''} • Segure F: mais opções`)
      else this.ui.setInteractHint(null)
      this._updateTargetHighlight(t)
    } else if (this.state !== 'wheel') {
      this.ui.setInteractHint(null)
      this._updateTargetHighlight(null)
    }

    // HUD buff line (luck timer)
    this.ui.setLuckHudLine?.(this._getLuckHudLine())

    // Hard-guard: never leave wheel visuals around unless the wheel is actually open.
    if (this.state === 'playing' && !this._wheelOpen) this.ui.hideWheel?.()

    // Equipment durability counts while equipped (real-time), even in menus.
    this._updateEquippedDurability?.(dt)

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
    if (simDt > 0 && this._placingChest) {
      this._updateChestGhost()
    }

    // Server knows the player by WS connection after join; don't wait for welcome/meId to start sending input.
    const authoritative = !!this._wsConnected

    // Client-side prediction keeps the game responsive and preserves collision feel.
    // Server snapshots correct drift.
    // PERF: avoid allocating lots of temporary arrays every frame (concat creates new arrays).
    if (!this._collidersBuf) this._collidersBuf = []
    const colliders = this.state === 'playing' ? this._collidersBuf : []
    if (this.state === 'playing') {
      colliders.length = 0
      const pushAll = (items) => {
        if (!items || !items.length) return
        for (let i = 0; i < items.length; i++) colliders.push(items[i])
      }

      pushAll(this.trees.getTrunkColliders())
      pushAll(this._inMine ? this.mine.getMineColliders() : this.mine.getWorldColliders())
      if (!this._inMine) {
        pushAll(this.forges.getColliders())
        pushAll(this.forgeTables.getColliders())
        pushAll(this.chests.getColliders())
        pushAll(this.river.getColliders())
        // Lake is decorative; collision boundary is enforced by the river.
      }
    }

    const groundY = this._inMine ? this.mine.getFloorYAt(this.player.position.x, this.player.position.z) : 0

    this._lastColliders = colliders
    this._lastGroundY = groundY

    // Remote players are purely visual; update even when paused/menus.
    this.remotePlayers?.update?.(dt)

    // Always run local movement + collision (prediction).
    this.player.update(simDt, colliders, groundY)

    // Send input when connected.
    if (simDt > 0 && authoritative) this._sendWsInput(simDt)

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

    // Baseline brightness signal for world fire/forge lighting (scales a bit with night).
    const fireMain = (3.2 + night * 6.0) * flicker

    // Torch brightness (doubled as requested).
    const torchMain = fireMain * 2.0

    const targetSpot = torchOn ? torchMain : 0.0
    const targetPoint = torchOn ? torchMain * 0.65 : 0.0

    this.torchSpot.intensity += (targetSpot - this.torchSpot.intensity) * (simDt > 0 ? 0.25 : 0.0)
    this.torchPoint.intensity += (targetPoint - this.torchPoint.intensity) * (simDt > 0 ? 0.25 : 0.0)

    // Provide baseline to campfire/forge lighting.
    this.fires.setTorchMain(fireMain)
    this.forges.setTorchMain(fireMain)

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
      } else if (this.tool === 'axe' || this.tool === 'pickaxe' || this.tool === 'hoe') {
        // Require correct item id in active slot.
        const s = this.hotbar[this.hotbarActive]
        if (this.tool === 'axe' && !this._isAxeId(s?.id)) {
          this.ui.toast('Equipe um machado.', 900)
          this._actionCooldown = 0.25
        } else if (this.tool === 'pickaxe' && !this._isPickaxeId(s?.id)) {
          this.ui.toast('Equipe uma picareta.', 900)
          this._actionCooldown = 0.25
        } else if (this.tool === 'hoe' && s?.id !== ItemId.HOE_METAL) {
          this.ui.toast('Equipe uma enxada.', 900)
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
    this.sticks.update(simDt)
    this.bushes.update(simDt)
    this.farm.update(simDt)
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
