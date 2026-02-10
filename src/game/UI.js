export class UI {
  /** @param {{scoreEl: HTMLElement, toastEl: HTMLElement, hudEl: HTMLElement, menuEl: HTMLElement, pauseEl: HTMLElement, controlsEl: HTMLElement}} els */
  constructor(els) {
    this.els = els
    this._toastUntil = 0
  }

  setScore(n) {
    this.els.scoreEl.textContent = String(n)
  }

  toast(text, ms = 1100) {
    const el = this.els.toastEl
    el.textContent = text
    el.classList.add('show')
    this._toastUntil = performance.now() + ms
  }

  update() {
    if (this._toastUntil && performance.now() > this._toastUntil) {
      this._toastUntil = 0
      this.els.toastEl.classList.remove('show')
    }
  }

  showMenu() {
    document.body.classList.add('state-menu')
    this.els.menuEl.classList.remove('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.hudEl.classList.add('hidden')
  }

  showPause() {
    document.body.classList.remove('state-menu')
    this.els.pauseEl.classList.remove('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  showHUD() {
    document.body.classList.remove('state-menu')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  showControls() {
    this.els.controlsEl.classList.remove('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
  }
}
