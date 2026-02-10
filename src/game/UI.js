export class UI {
  /** @param {{scoreEl: HTMLElement, toastEl: HTMLElement, hudEl: HTMLElement, menuEl: HTMLElement, pauseEl: HTMLElement, controlsEl: HTMLElement, inventoryEl: HTMLElement, invGridEl: HTMLElement, clockEl: HTMLElement, timeMarkerEl: HTMLElement, icoSunEl: HTMLElement, icoMoonEl: HTMLElement}} els */
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
      cell.dataset.index = String(i)

      if (s) {
        const item = getItem(s.id)
        cell.innerHTML = `<div class="invTop"><div class="invIcon">${item.icon}</div><div class="invName">${item.name}</div></div><div class="invQty">${s.qty} / 100</div>`
      } else {
        // Clean empty slot: no placeholders.
        cell.innerHTML = ''
      }

      grid.appendChild(cell)
    }
  }

  setHotbarActive(toolId) {
    const el = document.querySelector('#hotbar')
    if (!el) return
    for (const s of el.querySelectorAll('.hotSlot')) {
      s.classList.toggle('active', s.getAttribute('data-tool') === toolId)
    }
  }

  /** @param {{hhmm:string, norm:number, dayFactor:number, proximity:number}} t */
  setTime(t) {
    if (!this.els.clockEl) return

    this.els.clockEl.textContent = t.hhmm

    const bar = this.els.timeMarkerEl?.parentElement
    if (bar && this.els.timeMarkerEl) {
      const w = bar.clientWidth
      const x = Math.round(t.norm * (w - 12))
      this.els.timeMarkerEl.style.transform = `translateX(${x}px)`
    }

    const isDay = t.dayFactor >= 0.5
    const prox = t.proximity

    this.els.icoSunEl.classList.toggle('active', isDay || (!isDay && prox > 0.55))
    this.els.icoMoonEl.classList.toggle('active', !isDay || (isDay && prox > 0.55))

    this.els.icoSunEl.style.opacity = String(0.45 + t.dayFactor * 0.55)
    this.els.icoMoonEl.style.opacity = String(0.45 + (1 - t.dayFactor) * 0.55)
  }
}
