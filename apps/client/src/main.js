import './style.css'
import { Game } from './game/Game.js'
import { UI } from './game/UI.js'
import { ensureGuest, loadPlayerState, savePlayerState, getStoredWorldId, setStoredWorldId } from './net/persistence.js'

const canvas = document.querySelector('#game')

const ui = new UI({
  scoreEl: document.querySelector('#score'),
  toastEl: document.querySelector('#toast'),
  hudEl: document.querySelector('#hud'),
  menuEl: document.querySelector('#menu'),
  pauseEl: document.querySelector('#pause'),
  controlsEl: document.querySelector('#controls'),
  inventoryEl: document.querySelector('#inventory'),
  invGridEl: document.querySelector('#invGrid'),
  forgeEl: document.querySelector('#forge'),
  chestEl: document.querySelector('#chest'),
  chestInvGridEl: document.querySelector('#chestInvGrid'),
  chestSlotsEl: document.querySelector('#chestSlots'),
  forgeFuelEl: document.querySelector('#forgeFuel'),
  forgeInEl: document.querySelector('#forgeIn'),
  forgeOutEl: document.querySelector('#forgeOut'),
  forgeInvGridEl: document.querySelector('#forgeInvGrid'),
  forgeTableEl: document.querySelector('#forgeTable'),
  forgeTableListEl: document.querySelector('#forgeTableList'),
  actionWheelEl: document.querySelector('#actionWheel'),
  craftingEl: document.querySelector('#crafting'),
  craftListEl: document.querySelector('#craftList'),
  clockEl: document.querySelector('#clock'),
  timeMarkerEl: document.querySelector('#timeMarker'),
  icoSunEl: document.querySelector('#icoSun'),
  icoMoonEl: document.querySelector('#icoMoon'),
  perfEl: document.querySelector('#perf'),
  perfFpsEl: document.querySelector('#perfFps'),
  perfMsEl: document.querySelector('#perfMs'),
  perfMemRowEl: document.querySelector('#perfMemRow'),
  perfMemEl: document.querySelector('#perfMem'),
  hitmarkerEl: document.querySelector('#hitmarker'),
})

const game = new Game({ canvas, ui })

// World selection (simple lobby)
const worldInput = document.querySelector('#worldId')
if (worldInput) {
  const saved = getStoredWorldId()
  if (saved) worldInput.value = saved
  worldInput.addEventListener('change', () => {
    const v = String(worldInput.value || '').trim()
    if (v) setStoredWorldId(v)
  })
}

// Backend persistence bootstrap (guest + load saved state)
;(async () => {
  try {
    ui.toast('Conectando ao servidor...', 1200)
    const desiredWorldId = String(worldInput?.value || '').trim() || undefined
    const { guestId, worldId, token } = await ensureGuest({ worldId: desiredWorldId })

    game.setPersistenceContext({
      guestId,
      worldId,
      token,
      save: async (state) => {
        await savePlayerState({ guestId, worldId, state })
      },
    })

    const state = await loadPlayerState({ guestId, worldId })
    if (state) {
      game.setPersistedState(state)
      ui.toast('Save encontrado.', 1100)
    } else {
      ui.toast('Sem save (novo jogador).', 1100)
    }
  } catch {
    ui.toast('Offline: backend indisponível.', 1600)
  }
})()

// Menu buttons
const $ = (id) => document.querySelector(id)

// Inventory interactions: right-click a filled slot to remove it.
document.querySelector('#invGrid').addEventListener('contextmenu', (e) => {
  const slot = e.target?.closest?.('.invSlot')
  if (!slot) return
  e.preventDefault()
  const idx = Number(slot.dataset.index)
  if (Number.isNaN(idx)) return
  game.requestRemoveInventorySlot(idx)
})

// Drag: inventory <-> hotbar (only when inventory is open)
const invGrid = document.querySelector('#invGrid')
invGrid.addEventListener('dragstart', (e) => {
  if (!document.body.classList.contains('inventory-open')) return
  const slot = e.target?.closest?.('.invSlot')
  if (!slot) return
  const idx = Number(slot.dataset.index)
  if (Number.isNaN(idx)) return
  e.dataTransfer?.setData('application/json', JSON.stringify({ from: 'inv', idx }))
})

invGrid.addEventListener('dragover', (e) => {
  if (!document.body.classList.contains('inventory-open')) return
  e.preventDefault()
})

invGrid.addEventListener('drop', (e) => {
  if (!document.body.classList.contains('inventory-open')) return
  const data = e.dataTransfer?.getData('application/json')
  if (!data) return
  let payload
  try {
    payload = JSON.parse(data)
  } catch {
    return
  }

  const toSlot = e.target?.closest?.('.invSlot')
  if (!toSlot) return
  const toIdx = Number(toSlot.dataset.index)
  if (Number.isNaN(toIdx)) return

  game.moveItem(payload, { to: 'inv', idx: toIdx })
})

invGrid.addEventListener('dblclick', (e) => {
  if (!document.body.classList.contains('inventory-open')) return
  const slot = e.target?.closest?.('.invSlot')
  if (!slot) return
  const idx = Number(slot.dataset.index)
  if (Number.isNaN(idx)) return
  game.invQuickToHotbar(idx)
})

// Drag/drop + click: embedded forge inventory <-> forge slots
const forgeRoot = document.querySelector('#forge')

// Drag/drop: chest inventory <-> chest slots
const chestRoot = document.querySelector('#chest')
const chestInvGrid = document.querySelector('#chestInvGrid')

chestInvGrid?.addEventListener('dragstart', (e) => {
  if (!document.body.classList.contains('chest-open')) return
  const slot = e.target?.closest?.('.invSlot')
  if (!slot) return
  const idx = Number(slot.dataset.index)
  if (Number.isNaN(idx)) return
  e.dataTransfer?.setData('application/json', JSON.stringify({ from: 'inv', idx }))
})

chestInvGrid?.addEventListener('dragover', (e) => {
  if (!document.body.classList.contains('chest-open')) return
  e.preventDefault()
})

chestInvGrid?.addEventListener('drop', (e) => {
  if (!document.body.classList.contains('chest-open')) return
  const data = e.dataTransfer?.getData('application/json')
  if (!data) return
  let payload
  try { payload = JSON.parse(data) } catch { return }

  const toSlot = e.target?.closest?.('.invSlot')
  if (!toSlot) return
  const toIdx = Number(toSlot.dataset.index)
  if (Number.isNaN(toIdx)) return

  game.moveItem(payload, { to: 'inv', idx: toIdx })
})

chestInvGrid?.addEventListener('dblclick', (e) => {
  if (!document.body.classList.contains('chest-open')) return
  const slot = e.target?.closest?.('.invSlot')
  if (!slot) return
  const idx = Number(slot.dataset.index)
  if (Number.isNaN(idx)) return
  game.chestQuickAddFromInventory(idx)
})

chestRoot?.addEventListener('dragstart', (e) => {
  if (!document.body.classList.contains('chest-open')) return
  const slot = e.target?.closest?.('.forgeSlot')
  if (!slot) return
  const kind = slot.dataset.kind
  const idx = Number(slot.dataset.index)
  if (!kind || Number.isNaN(idx)) return
  e.dataTransfer?.setData('application/json', JSON.stringify({ from: 'chest', kind, idx }))
})

chestRoot?.addEventListener('dragover', (e) => {
  if (!document.body.classList.contains('chest-open')) return
  const slot = e.target?.closest?.('.forgeSlot')
  if (!slot) return
  e.preventDefault()
})

chestRoot?.addEventListener('drop', (e) => {
  if (!document.body.classList.contains('chest-open')) return
  const slot = e.target?.closest?.('.forgeSlot')
  if (!slot) return
  const kind = slot.dataset.kind
  const idx = Number(slot.dataset.index)
  if (!kind || Number.isNaN(idx)) return

  const data = e.dataTransfer?.getData('application/json')
  if (!data) return
  let payload
  try { payload = JSON.parse(data) } catch { return }

  game.moveItem(payload, { to: 'chest', kind, idx })
})

chestRoot?.addEventListener('dblclick', (e) => {
  if (!document.body.classList.contains('chest-open')) return
  const slot = e.target?.closest?.('.forgeSlot')
  if (!slot) return
  const kind = slot.dataset.kind
  const idx = Number(slot.dataset.index)
  if (kind !== 'chest' || Number.isNaN(idx)) return
  game.chestQuickBackToInventory(idx)
})

const forgeInvGrid = document.querySelector('#forgeInvGrid')
forgeInvGrid?.addEventListener('dragstart', (e) => {
  if (!document.body.classList.contains('forge-open')) return
  const slot = e.target?.closest?.('.invSlot')
  if (!slot) return
  const idx = Number(slot.dataset.index)
  if (Number.isNaN(idx)) return
  e.dataTransfer?.setData('application/json', JSON.stringify({ from: 'inv', idx }))
})
forgeInvGrid?.addEventListener('dragover', (e) => {
  if (!document.body.classList.contains('forge-open')) return
  e.preventDefault()
})
forgeInvGrid?.addEventListener('drop', (e) => {
  if (!document.body.classList.contains('forge-open')) return
  const data = e.dataTransfer?.getData('application/json')
  if (!data) return
  let payload
  try { payload = JSON.parse(data) } catch { return }

  const toSlot = e.target?.closest?.('.invSlot')
  if (!toSlot) return
  const toIdx = Number(toSlot.dataset.index)
  if (Number.isNaN(toIdx)) return

  game.moveItem(payload, { to: 'inv', idx: toIdx })
})
forgeInvGrid?.addEventListener('click', (e) => {
  if (!document.body.classList.contains('forge-open')) return
  const slot = e.target?.closest?.('.invSlot')
  if (!slot) return
  const idx = Number(slot.dataset.index)
  if (Number.isNaN(idx)) return
  game.forgeQuickAddFromInventory(idx)
})

forgeInvGrid?.addEventListener('dblclick', (e) => {
  if (!document.body.classList.contains('forge-open')) return
  const slot = e.target?.closest?.('.invSlot')
  if (!slot) return
  const idx = Number(slot.dataset.index)
  if (Number.isNaN(idx)) return
  game.forgeQuickAddFromInventory(idx)
})

forgeRoot?.addEventListener('dragstart', (e) => {
  if (!document.body.classList.contains('forge-open')) return
  const slot = e.target?.closest?.('.forgeSlot')
  if (!slot) return
  const kind = slot.dataset.kind
  const idx = Number(slot.dataset.index)
  if (!kind || Number.isNaN(idx)) return
  e.dataTransfer?.setData('application/json', JSON.stringify({ from: 'forge', kind, idx }))
})

forgeRoot?.addEventListener('dragover', (e) => {
  if (!document.body.classList.contains('forge-open')) return
  const slot = e.target?.closest?.('.forgeSlot')
  if (!slot) return
  e.preventDefault()
})

forgeRoot?.addEventListener('drop', (e) => {
  if (!document.body.classList.contains('forge-open')) return
  const slot = e.target?.closest?.('.forgeSlot')
  if (!slot) return
  const kind = slot.dataset.kind
  const idx = Number(slot.dataset.index)
  if (!kind || Number.isNaN(idx)) return

  const data = e.dataTransfer?.getData('application/json')
  if (!data) return
  let payload
  try { payload = JSON.parse(data) } catch { return }

  game.moveItem(payload, { to: 'forge', kind, idx })
})

forgeRoot?.addEventListener('click', (e) => {
  if (!document.body.classList.contains('forge-open')) return
  const slot = e.target?.closest?.('.forgeSlot')
  if (!slot) return
  const kind = slot.dataset.kind
  const idx = Number(slot.dataset.index)
  if (!kind) return
  game.forgeSlotClick(kind, idx)
})

document.querySelectorAll('#hotbar .hotSlot').forEach((el) => {
  el.addEventListener('dragstart', (e) => {
    if (!document.body.classList.contains('inventory-open')) return
    const hotIdx = Number(el.getAttribute('data-idx'))
    if (Number.isNaN(hotIdx) || hotIdx === 0) return
    e.dataTransfer?.setData('application/json', JSON.stringify({ from: 'hot', idx: hotIdx }))
  })

  el.addEventListener('dragover', (e) => {
    if (!document.body.classList.contains('inventory-open')) return
    const hotIdx = Number(el.getAttribute('data-idx'))
    if (Number.isNaN(hotIdx) || hotIdx === 0) return
    e.preventDefault()
    el.classList.add('drop')
  })
  el.addEventListener('dragleave', () => el.classList.remove('drop'))
  el.addEventListener('drop', (e) => {
    if (!document.body.classList.contains('inventory-open')) return
    e.preventDefault()
    el.classList.remove('drop')
    const hotIdx = Number(el.getAttribute('data-idx'))
    if (Number.isNaN(hotIdx) || hotIdx === 0) return

    const data = e.dataTransfer?.getData('application/json')
    if (!data) return
    let payload
    try {
      payload = JSON.parse(data)
    } catch {
      return
    }

    game.moveItem(payload, { to: 'hot', idx: hotIdx })
  })

  el.addEventListener('click', () => {
    const hotIdx = Number(el.getAttribute('data-idx'))
    if (Number.isNaN(hotIdx)) return
    game.selectHotbar(hotIdx)
  })

  el.addEventListener('dblclick', () => {
    if (!document.body.classList.contains('inventory-open')) return
    const hotIdx = Number(el.getAttribute('data-idx'))
    if (Number.isNaN(hotIdx)) return
    game.hotbarQuickToInventory(hotIdx)
  })
})

$('#btnPlay').addEventListener('click', () => game.playFromMenu())
$('#btnControls').addEventListener('click', () => game.openControls('menu'))
$('#btnClose').addEventListener('click', () => game.tryClose())

$('#btnResume').addEventListener('click', () => game.resume())
$('#btnRestart').addEventListener('click', () => game.restart())
$('#btnPauseControls').addEventListener('click', () => game.openControls('pause'))
$('#btnQuit').addEventListener('click', () => game.quitToMenu())
$('#btnPerfToggle').addEventListener('click', () => game.togglePerf())
$('#btnViewBob').addEventListener('click', () => game.toggleViewBob())

const btnPreview3D = document.querySelector('#btnPreview3D')
if (btnPreview3D) {
  btnPreview3D.textContent = `Preview 3D: ${game.preview3dEnabled ? 'ON' : 'OFF'}`
  btnPreview3D.addEventListener('click', () => {
    game.togglePreview3D()
    btnPreview3D.textContent = `Preview 3D: ${game.preview3dEnabled ? 'ON' : 'OFF'}`
  })
}

$('#btnControlsBack').addEventListener('click', () => game.closeControls())
$('#btnInvClose').addEventListener('click', () => game.closeInventory())
$('#btnInvSort')?.addEventListener('click', () => game.sortInventory())
$('#btnCraftClose').addEventListener('click', () => game.closeCrafting())
$('#btnForgeClose').addEventListener('click', () => game.closeForge())
$('#btnForgeCollect').addEventListener('click', () => game.collectAllForgeOutput())
$('#btnForgeStart').addEventListener('click', () => game.toggleForgeEnabled())

$('#btnForgeTableClose').addEventListener('click', () => game.closeForgeTable())

$('#btnChestClose').addEventListener('click', () => game.closeChest())
$('#btnChestSort')?.addEventListener('click', () => game.sortChest())

// Start at main menu
ui.showMenu()
ui.setScore(0)

game.start()

// Expose for quick debugging in dev
window.__game = game
