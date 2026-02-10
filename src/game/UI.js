export class UI {
  /** @param {{scoreEl: HTMLElement, toastEl: HTMLElement, hudEl: HTMLElement, menuEl: HTMLElement, pauseEl: HTMLElement, controlsEl: HTMLElement, inventoryEl: HTMLElement, invGridEl: HTMLElement}} els */
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
    this.els.inventoryEl.classList.add('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
  }

  showInventory() {
    this.els.inventoryEl.classList.remove('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  hideInventory() {
    this.els.inventoryEl.classList.add('hidden')
  }

  /** @param {(null|{id:string, qty:number})[]} slots @param {(id:string)=>{name:string, icon:string}} getItem */
  renderInventory(slots, getItem) {
    const grid = this.els.invGridEl
    grid.innerHTML = ''
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      const cell = document.createElement('div')
      cell.className = 'invSlot' + (s ? '' : ' invEmpty')
      if (!s) {
        cell.innerHTML = `<div class="invTop"><div class="invIcon">·</div><div class="invName">Vazio</div></div><div class="invQty">Slot ${i + 1}</div>`
      } else {
        const item = getItem(s.id)
        cell.innerHTML = `<div class="invTop"><div class="invIcon">${item.icon}</div><div class="invName">${item.name}</div></div><div class="invQty">${s.qty} / 100</div>`
      }
      grid.appendChild(cell)
    }
  }
}
