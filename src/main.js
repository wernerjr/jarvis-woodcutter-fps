import './style.css'
import { Game } from './game/Game.js'
import { UI } from './game/UI.js'

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
})

const game = new Game({ canvas, ui })

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

// Drag: inventory -> hotbar
const invGrid = document.querySelector('#invGrid')
invGrid.addEventListener('dragstart', (e) => {
  const slot = e.target?.closest?.('.invSlot')
  if (!slot) return
  const idx = Number(slot.dataset.index)
  if (Number.isNaN(idx)) return
  e.dataTransfer?.setData('text/plain', String(idx))
})

document.querySelectorAll('#hotbar .hotSlot').forEach((el) => {
  el.addEventListener('dragover', (e) => {
    e.preventDefault()
    el.classList.add('drop')
  })
  el.addEventListener('dragleave', () => el.classList.remove('drop'))
  el.addEventListener('drop', (e) => {
    e.preventDefault()
    el.classList.remove('drop')
    const invIdx = Number(e.dataTransfer?.getData('text/plain'))
    const hotIdx = Number(el.getAttribute('data-idx'))
    if (Number.isNaN(invIdx) || Number.isNaN(hotIdx)) return
    game.bindHotbar(hotIdx, invIdx)
  })

  el.addEventListener('click', () => {
    const hotIdx = Number(el.getAttribute('data-idx'))
    if (Number.isNaN(hotIdx)) return
    game.selectHotbar(hotIdx)
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

$('#btnControlsBack').addEventListener('click', () => game.closeControls())
$('#btnInvClose').addEventListener('click', () => game.closeInventory())
$('#btnCraftClose').addEventListener('click', () => game.closeCrafting())

// Start at main menu
ui.showMenu()
ui.setScore(0)

game.start()

// Expose for quick debugging in dev
window.__game = game
