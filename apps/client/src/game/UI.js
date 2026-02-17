export class UI {
  setNetDebug(text) {
    if (!this.els?.perfEl) return
    if (!text) {
      const el = this.els.perfEl.querySelector?.('#netDebug')
      if (el) el.remove()
      return
    }

    let el = this.els.perfEl.querySelector?.('#netDebug')
    if (!el) {
      el = document.createElement('div')
      el.id = 'netDebug'
      el.style.opacity = '0.9'
      el.style.fontSize = '12px'
      el.style.marginTop = '6px'
      el.style.whiteSpace = 'pre'
      this.els.perfEl.appendChild(el)
    }
    el.textContent = text
  }

  setInteractHint(text) {
    const el = document.querySelector('#interactHint')
    if (!el) return
    if (!text) {
      el.classList.add('hidden')
      el.textContent = ''
      return
    }
    el.textContent = text
    el.classList.remove('hidden')
  }

  showWheel() {
    // Only show if wheel has actions (data-n set by setWheelActions).
    const root = this.els.actionWheelEl
    if (!root) return
    const wheel = root.querySelector('.wheel')
    const n = Number(wheel?.getAttribute('data-n') || 0)
    if (!n) return
    root.classList.remove('hidden')
  }

  hideWheel() {
    this.els.actionWheelEl?.classList.add('hidden')
    this.setWheelActive(null)
    this.setWheelActions([])
  }

  _renderWheelBackground(wheel, actions, activeIdx) {
    // Deprecated: wheel is now a button grid. Keep as no-op.
    void wheel
    void actions
    void activeIdx
  }

  /** @param {{id:string, label:string, danger?:boolean}[]} actions */
  setWheelActions(actions) {
    const root = this.els.actionWheelEl
    if (!root) return

    const wheel = root.querySelector('.wheel')
    if (!wheel) return

    // Clear previous buttons/lock
    for (const el of Array.from(wheel.querySelectorAll('.wheelBtn,.wheelLock'))) el.remove()

    if (!actions || actions.length === 0) {
      this._wheelActions = []
      this._wheelActiveIdx = -1
      root.classList.add('hidden')
      wheel.removeAttribute('data-n')
      wheel.style.border = 'none'
      return
    }

    this._wheelActions = actions
    this._wheelActiveIdx = -1

    const n = actions.length
    wheel.setAttribute('data-n', String(n))

    const lockOnly = n === 1 && actions[0]?.id === 'locked'
    wheel.style.border = lockOnly ? 'none' : '1px solid rgba(255,255,255,.12)'

    // Make a square-ish grid: cols = ceil(sqrt(n))
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
    wheel.style.display = 'grid'
    wheel.style.gridTemplateColumns = `repeat(${cols}, 1fr)`

    if (lockOnly) {
      const el = document.createElement('div')
      el.className = 'wheelLock'
      el.textContent = actions[0]?.label || '🔒'
      el.style.fontSize = '44px'
      el.style.padding = '18px 24px'
      el.style.opacity = '0.95'
      wheel.appendChild(el)
      return
    }

    for (const a of actions) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'wheelBtn'
      btn.textContent = a.label
      btn.setAttribute('data-action', a.id)
      if (a.danger) btn.classList.add('danger')
      wheel.appendChild(btn)
    }
  }

  setWheelActive(actionId) {
    // Highlight is hover-only now. Keep method for compatibility.
    this._wheelActiveId = actionId
  }

  _toolLine(s) {
    const dur = s?.meta?.dur
    const maxDur = s?.meta?.maxDur
    const dmg = s?.meta?.dmg
    const durStr = typeof dur === 'number' && typeof maxDur === 'number' ? `${dur}/${maxDur}` : null
    const dmgStr = typeof dmg === 'number' ? `${dmg}` : null
    if (durStr && dmgStr) return `Dur: ${durStr} • Dmg: ${dmgStr}`
    if (durStr) return `Dur: ${durStr}`
    if (dmgStr) return `Dmg: ${dmgStr}`
    return `Dur: ${dur ?? '-'}`
  }

  /** @param {{scoreEl: HTMLElement, toastEl: HTMLElement, hudEl: HTMLElement, menuEl: HTMLElement, pauseEl: HTMLElement, controlsEl: HTMLElement, inventoryEl: HTMLElement, invGridEl: HTMLElement, forgeEl: HTMLElement, forgeFuelEl: HTMLElement, forgeInEl: HTMLElement, forgeOutEl: HTMLElement, forgeInvGridEl: HTMLElement, chestEl?: HTMLElement, chestInvGridEl?: HTMLElement, chestSlotsEl?: HTMLElement, forgeTableEl: HTMLElement, forgeTableListEl: HTMLElement, actionWheelEl: HTMLElement, craftingEl: HTMLElement, craftListEl: HTMLElement, clockEl: HTMLElement, timeMarkerEl: HTMLElement, icoSunEl: HTMLElement, icoMoonEl: HTMLElement, perfEl: HTMLElement, perfFpsEl: HTMLElement, perfMsEl: HTMLElement, perfMemRowEl: HTMLElement, perfMemEl: HTMLElement, hitmarkerEl?: HTMLElement}} els */
  constructor(els) {
    this.els = els
    this._toastUntil = 0
    this._hitUntil = 0
  }

  hitmarker(ms = 120) {
    const el = this.els.hitmarkerEl
    if (!el) return
    el.classList.remove('hidden')
    el.classList.add('show')
    this._hitUntil = performance.now() + ms
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
    const now = performance.now()
    if (this._toastUntil && now > this._toastUntil) {
      this._toastUntil = 0
      this.els.toastEl.classList.remove('show')
    }

    if (this._hitUntil && now > this._hitUntil) {
      this._hitUntil = 0
      const el = this.els.hitmarkerEl
      if (el) el.classList.remove('show')
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
    document.body.classList.remove('chest-open')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.inventoryEl.classList.add('hidden')
    this.els.craftingEl.classList.add('hidden')
    this.els.forgeEl.classList.add('hidden')
    this.els.chestEl?.classList.add('hidden')
    this.els.forgeTableEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  showControls() {
    document.body.classList.remove('forge-open')
    this.els.controlsEl.classList.remove('hidden')
    this.els.inventoryEl.classList.add('hidden')
    this.els.forgeEl.classList.add('hidden')
    this.els.chestEl?.classList.add('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
  }

  showInventory() {
    document.body.classList.remove('forge-open')
    document.body.classList.add('inventory-open')
    this.els.inventoryEl.classList.remove('hidden')
    this.els.craftingEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.chestEl?.classList.add('hidden')
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
    document.body.classList.remove('chest-open')

    // Single forge panel: embedded inventory on the left.
    this.els.forgeEl.classList.remove('hidden')
    this.els.chestEl?.classList.add('hidden')
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

  showChest() {
    document.body.classList.add('chest-open')
    document.body.classList.remove('inventory-open')
    document.body.classList.remove('forge-open')

    this.els.chestEl?.classList.remove('hidden')
    this.els.forgeEl.classList.add('hidden')
    this.els.inventoryEl.classList.add('hidden')

    this.els.craftingEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  hideChest() {
    document.body.classList.remove('chest-open')
    this.els.chestEl?.classList.add('hidden')
  }

  showForgeTable() {
    document.body.classList.remove('forge-open')
    this.els.forgeTableEl.classList.remove('hidden')
    this.els.forgeEl.classList.add('hidden')
    this.els.inventoryEl.classList.add('hidden')
    this.els.craftingEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.pauseEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  hideForgeTable() {
    this.els.forgeTableEl.classList.add('hidden')
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
        const extra = item.stackable ? `${s.qty} / 100` : this._toolLine(s)
        cell.innerHTML = `<div class="invTop"><div class="invIcon">${item.icon}</div><div class="invName">${item.name}</div></div><div class="invQty">${extra}</div>`
      } else {
        cell.innerHTML = ''
      }

      grid.appendChild(cell)
    }
  }

  renderChestInventory(slots, getItem) {
    const grid = this.els.chestInvGridEl
    if (!grid) return
    grid.innerHTML = ''
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      const cell = document.createElement('div')
      cell.className = 'invSlot' + (s ? ' draggable' : ' invEmpty')
      cell.dataset.index = String(i)

      if (s) {
        const item = getItem(s.id)
        cell.draggable = true
        const extra = item.stackable ? `${s.qty} / 100` : this._toolLine(s)
        cell.innerHTML = `<div class="invTop"><div class="invIcon">${item.icon}</div><div class="invName">${item.name}</div></div><div class="invQty">${extra}</div>`
      } else {
        cell.innerHTML = ''
      }

      grid.appendChild(cell)
    }
  }

  renderChest(slots, getItem) {
    const root = this.els.chestSlotsEl
    if (!root) return
    root.innerHTML = ''

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      const el = document.createElement('div')
      el.className = 'forgeSlot' + (s ? '' : ' empty')
      el.draggable = !!s
      el.dataset.kind = 'chest'
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

  updateForgeStatus(forge, meta = { secondsPerIngot: 10 }) {
    // status widgets (optional elements)
    const fuelSecs = Math.max(0, Math.floor(forge.burn || 0))
    const oreCount = (forge.input || []).reduce((a, s) => a + (s?.id === 'iron_ore' ? s.qty : 0), 0)

    const fuelStat = document.querySelector('#forgeFuelStat')
    const inStat = document.querySelector('#forgeInStat')
    if (fuelStat) fuelStat.textContent = `Combustível: ${fuelSecs}s`
    if (inStat) inStat.textContent = `Minério: ${oreCount}`

    const btn = document.querySelector('#btnForgeStart')
    const hint = document.querySelector('#forgeStartHint')
    const flame = document.querySelector('#forgeFlame')

    const hasFuel = (forge.fuel || []).some((s) => s && s.qty > 0)
    const hasOre = (forge.input || []).some((s) => s && s.qty > 0)

    if (btn) {
      const canStart = hasFuel && hasOre
      btn.disabled = !canStart
      btn.textContent = forge.enabled ? 'Forja ligada' : 'Iniciar fundição'
      btn.classList.toggle('on', !!forge.enabled)
    }

    if (hint) {
      if (forge.enabled) hint.textContent = 'A forja está ligada. Ela funde enquanto houver combustível e minério.'
      else hint.textContent = hasFuel && hasOre ? 'Pronto: clique em Iniciar fundição.' : 'Adicione combustível e minério para iniciar.'
    }

    if (flame) flame.classList.toggle('on', !!forge.enabled && (forge.burn || 0) > 0)

    // progress bar
    const secPer = meta?.secondsPerIngot ?? 10
    const progText = document.querySelector('#forgeProgText')
    const timeLeft = document.querySelector('#forgeTimeLeft')
    const fill = document.querySelector('#forgeBarFill')

    if (forge.enabled && (forge.burn || 0) > 0 && hasOre) {
      const p = Math.max(0, Math.min(1, (forge.prog || 0) / secPer))
      const left = Math.max(0, Math.ceil(secPer - (forge.prog || 0)))
      if (progText) progText.textContent = 'Processando…'
      if (timeLeft) timeLeft.textContent = `${left}s restantes`
      if (fill) fill.style.width = `${Math.round(p * 100)}%`
    } else {
      if (progText) progText.textContent = forge.enabled ? 'Aguardando recursos…' : 'Parado'
      if (timeLeft) timeLeft.textContent = '—'
      if (fill) fill.style.width = '0%'
    }
  }

  renderForge(forge, getItem, meta = { secondsPerIngot: 10 }) {
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

    this.updateForgeStatus(forge, meta)
  }

  /** @param {(null|{id:string, qty:number})[]} slots @param {(id:string)=>{name:string, icon:string}} getItem */
  renderCrafting(recipes, invCount, getItem, onCraft, rootOverride = null) {
    const root = rootOverride || this.els.craftListEl
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

  renderForgeTable(recipes, invCount, getItem, onCraft) {
    this.renderCrafting(recipes, invCount, getItem, onCraft, this.els.forgeTableListEl)
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
        const extra = item.stackable ? `${s.qty} / 100` : this._toolLine(s)
        cell.innerHTML = `<div class="invTop"><div class="invIcon">${item.icon}</div><div class="invName">${item.name}</div></div><div class="invQty">${extra}</div>`
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
