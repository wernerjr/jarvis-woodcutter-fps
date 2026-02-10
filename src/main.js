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

// Start at main menu
ui.showMenu()
ui.setScore(0)

game.start()

// Expose for quick debugging in dev
window.__game = game
