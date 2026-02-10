export class UI {
  /** @param {{scoreEl: HTMLElement, toastEl: HTMLElement, hudEl: HTMLElement, menuEl: HTMLElement, pauseEl: HTMLElement, controlsEl: HTMLElement, inventoryEl: HTMLElement, invGridEl: HTMLElement, craftingEl: HTMLElement, craftListEl: HTMLElement, clockEl: HTMLElement, timeMarkerEl: HTMLElement, icoSunEl: HTMLElement, icoMoonEl: HTMLElement, perfEl: HTMLElement, perfFpsEl: HTMLElement, perfMsEl: HTMLElement, perfMemRowEl: HTMLElement, perfMemEl: HTMLElement}} els */
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
    this.els.craftingEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  hideInventory() {
    this.els.inventoryEl.classList.add('hidden')
  }

  showCrafting() {
    this.els.craftingEl.classList.remove('hidden')
    this.els.inventoryEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  hideCrafting() {
    this.els.craftingEl.classList.add('hidden')
  }

  /** @param {(null|{id:string, qty:number})[]} slots @param {(id:string)=>{name:string, icon:string}} getItem */
  renderCrafting(recipes, invCount, getItem, onCraft) {
    const root = this.els.craftListEl
    root.innerHTML = ''

    for (const r of recipes) {
      const row = document.createElement('div')
      row.className = 'craftRow'

      const can = r.cost.every((c) => invCount(c.id) >= c.qty)
      const req = r.cost
        .map((c) => {
          const it = getItem(c.id)
          const have = invCount(c.id)
          return `${it.icon} ${it.name}: ${have}/${c.qty}`
        })
        .join(' • ')

      row.innerHTML = `
        <div class="craftTop">
          <div class="craftName">${r.name}</div>
          <button ${can ? '' : 'disabled'} data-recipe="${r.id}">${can ? 'Construir' : 'Falta recurso'}</button>
        </div>
        <div class="craftReq">${req}</div>
      `

      row.querySelector('button')?.addEventListener('click', () => onCraft(r.id))
      root.appendChild(row)
    }
  }

  renderInventory(slots, getItem) {
    const grid = this.els.invGridEl
    grid.innerHTML = ''
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      const cell = document.createElement('div')
      cell.className = 'invSlot' + (s ? ' draggable' : ' invEmpty')
      cell.dataset.index = String(i)

      if (s) {
        const item = getItem(s.id)
        cell.draggable = true
        cell.innerHTML = `<div class="invTop"><div class="invIcon">${item.icon}</div><div class="invName">${item.name}</div></div><div class="invQty">${item.stackable ? `${s.qty} / 100` : `Dur: ${s.meta?.dur ?? '-'} `}</div>`
      } else {
        cell.innerHTML = ''
      }

      grid.appendChild(cell)
    }
  }

  renderHotbar(slots, getItem, activeIdx) {
    const root = document.querySelector('#hotbar')
    if (!root) return
    const els = root.querySelectorAll('.hotSlot')
    els.forEach((el) => {
      const idx = Number(el.getAttribute('data-idx'))
      const s = slots[idx]
      el.classList.toggle('active', idx === activeIdx)
      const ico = el.querySelector('.ico')
      if (!ico) return
      if (!s) {
        ico.textContent = ' '
      } else {
        const it = getItem(s.itemId)
        ico.textContent = it?.icon ?? ' '
      }
    })
  }

  setHotbarActive(toolId) {
    const el = document.querySelector('#hotbar')
    if (!el) return
    for (const s of el.querySelectorAll('.hotSlot')) {
      s.classList.toggle('active', s.getAttribute('data-tool') === toolId)
    }
  }

  /** @param {{hhmm:string, norm:number, dayFactor:number, proximity:number}} t */
  setPerfVisible(v) {
    if (!this.els.perfEl) return
    this.els.perfEl.classList.toggle('hidden', !v)
  }

  /** @param {{fps:number, frameMs:number, memMB:number|null}} p */
  setPerf(p) {
    if (!this.els.perfEl || this.els.perfEl.classList.contains('hidden')) return
    this.els.perfFpsEl.textContent = String(p.fps ?? 0)
    this.els.perfMsEl.textContent = String(Math.round((p.frameMs ?? 0) * 10) / 10)

    if (p.memMB == null) {
      this.els.perfMemRowEl.style.display = 'none'
    } else {
      this.els.perfMemRowEl.style.display = ''
      this.els.perfMemEl.textContent = String(p.memMB)
    }
  }

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
