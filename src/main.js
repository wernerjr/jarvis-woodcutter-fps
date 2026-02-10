import './style.css'
import { Game } from './game/Game.js'

const canvas = document.querySelector('#game')
const ui = {
  score: document.querySelector('#score'),
  hint: document.querySelector('#hint'),
  toast: document.querySelector('#toast'),
}

const game = new Game({ canvas, ui })

game.start()

// Expose for quick debugging in dev
window.__game = game
