export class UI {
  /** @param {{scoreEl: HTMLElement, toastEl: HTMLElement, hudEl: HTMLElement, menuEl: HTMLElement, pauseEl: HTMLElement, controlsEl: HTMLElement, inventoryEl: HTMLElement, invGridEl: HTMLElement, forgeEl: HTMLElement, forgeFuelEl: HTMLElement, forgeInEl: HTMLElement, forgeOutEl: HTMLElement, forgeInvGridEl: HTMLElement, craftingEl: HTMLElement, craftListEl: HTMLElement, clockEl: HTMLElement, timeMarkerEl: HTMLElement, icoSunEl: HTMLElement, icoMoonEl: HTMLElement, perfEl: HTMLElement, perfFpsEl: HTMLElement, perfMsEl: HTMLElement, perfMemRowEl: HTMLElement, perfMemEl: HTMLElement}} els */
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
    document.body.classList.remove('forge-open')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.inventoryEl.classList.add('hidden')
    this.els.craftingEl.classList.add('hidden')
    this.els.forgeEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  showControls() {
    document.body.classList.remove('forge-open')
    this.els.controlsEl.classList.remove('hidden')
    this.els.inventoryEl.classList.add('hidden')
    this.els.forgeEl.classList.add('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
  }

  showInventory() {
    document.body.classList.remove('forge-open')
    document.body.classList.add('inventory-open')
    this.els.inventoryEl.classList.remove('hidden')
    this.els.craftingEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  hideInventory() {
    document.body.classList.remove('inventory-open')
    this.els.inventoryEl.classList.add('hidden')
  }

  showForge() {
    document.body.classList.add('forge-open')
    document.body.classList.remove('inventory-open')

    // Single forge panel: embedded inventory on the left.
    this.els.forgeEl.classList.remove('hidden')
    this.els.inventoryEl.classList.add('hidden')

    this.els.craftingEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  hideForge() {
    document.body.classList.remove('forge-open')
    this.els.forgeEl.classList.add('hidden')
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

  renderForgeInventory(slots, getItem) {
    const grid = this.els.forgeInvGridEl
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

  renderForge(forge, getItem) {
    const mk = (kind, root, slots) => {
      root.innerHTML = ''
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        const el = document.createElement('div')
        el.className = 'forgeSlot' + (s ? '' : ' empty')
        el.draggable = !!s
        el.dataset.kind = kind
        el.dataset.index = String(i)

        if (!s) {
          el.innerHTML = `<div class="line1"><div class="ico">+</div><div class="qty">vazio</div></div><div class="muted small">&nbsp;</div>`
        } else {
          const it = getItem(s.id)
          el.innerHTML = `<div class="line1"><div class="ico">${it?.icon ?? ''}</div><div class="qty">${s.qty}</div></div><div class="muted small">${it?.name ?? s.id}</div>`
        }

        root.appendChild(el)
      }
    }

    mk('fuel', this.els.forgeFuelEl, forge.fuel)
    mk('in', this.els.forgeInEl, forge.input)
    mk('out', this.els.forgeOutEl, forge.output)
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

    const dragEnabled = document.body.classList.contains('inventory-open')

    els.forEach((el) => {
      const idx = Number(el.getAttribute('data-idx'))
      const s = slots[idx]

      el.classList.toggle('active', idx === activeIdx)

      // Enable dragging only when inventory is open, and never for slot 1.
      el.draggable = dragEnabled && idx !== 0 && !!s

      const ico = el.querySelector('.hotIco')
      const durFill = el.querySelector('.hotDurFill')
      const durRoot = el.querySelector('.hotDur')

      if (idx === 0) {
        if (ico) ico.textContent = '✋'
        if (durRoot) durRoot.style.opacity = '0'
        return
      }

      if (!s) {
        if (ico) ico.textContent = ''
        if (durRoot) durRoot.style.opacity = '0'
        if (durFill) durFill.style.width = '0%'
        return
      }

      const it = getItem(s.id)
      if (ico) ico.textContent = it?.icon ?? ''

      const dur = s.meta?.dur
      const maxDur = s.meta?.maxDur
      if (durRoot && durFill && typeof dur === 'number' && typeof maxDur === 'number' && maxDur > 0) {
        durRoot.style.opacity = '1'
        const p = Math.max(0, Math.min(1, dur / maxDur))
        durFill.style.width = `${Math.round(p * 100)}%`

        // color ramp
        const col = p > 0.6 ? 'rgba(159,245,168,0.75)' : p > 0.3 ? 'rgba(255,220,120,0.78)' : 'rgba(255,120,120,0.78)'
        durFill.style.background = col
      } else {
        if (durRoot) durRoot.style.opacity = '0'
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
