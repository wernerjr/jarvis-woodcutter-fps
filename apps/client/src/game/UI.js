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
      el.style.whiteSpace = 'pre-wrap'
      el.style.wordBreak = 'break-word'
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

  /** @param {{scoreEl: HTMLElement, toastEl: HTMLElement, hudEl: HTMLElement, menuEl: HTMLElement, pauseEl: HTMLElement, controlsEl: HTMLElement, inventoryEl: HTMLElement, invGridEl: HTMLElement, invHintEl?: HTMLElement, invEquipGridEl?: HTMLElement, invBuffLineEl?: HTMLElement, luckHudLineEl?: HTMLElement, forgeEl: HTMLElement, forgeFuelEl: HTMLElement, forgeInEl: HTMLElement, forgeOutEl: HTMLElement, forgeInvGridEl: HTMLElement, chestEl?: HTMLElement, chestInvGridEl?: HTMLElement, chestSlotsEl?: HTMLElement, forgeTableEl: HTMLElement, forgeTableListEl: HTMLElement, actionWheelEl: HTMLElement, craftingEl: HTMLElement, craftListEl: HTMLElement, clockEl: HTMLElement, timeMarkerEl: HTMLElement, icoSunEl: HTMLElement, icoMoonEl: HTMLElement, perfEl: HTMLElement, perfFpsEl: HTMLElement, perfMsEl: HTMLElement, perfMemRowEl: HTMLElement, perfMemEl: HTMLElement, hitmarkerEl?: HTMLElement, loadingEl?: HTMLElement, loadingHintEl?: HTMLElement, loadingBarFillEl?: HTMLElement}} els */
  constructor(els) {
    this.els = els
    this._toastUntil = 0
    this._hitUntil = 0

    this.preview3dEnabled = true
  }

  setPreview3DEnabled(v) {
    this.preview3dEnabled = !!v

    // If disabling, free preview resources immediately.
    if (!this.preview3dEnabled) {
      this.disposeCraftPreview?.()
      this.disposeForgeTablePreview?.()
    }
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

  toastHtml(html, ms = 1100) {
    const el = this.els.toastEl
    el.innerHTML = String(html || '')
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
    this.els.loadingEl?.classList.add('hidden')
  }

  showLoading(hint = 'Carregando…', pct = null) {
    if (this.els.loadingHintEl) this.els.loadingHintEl.textContent = String(hint || 'Carregando…')
    if (this.els.loadingBarFillEl && typeof pct === 'number') {
      const p = Math.max(0.05, Math.min(0.98, pct))
      this.els.loadingBarFillEl.style.width = `${Math.round(p * 100)}%`
    }
    this.els.loadingEl?.classList.remove('hidden')
  }

  hideLoading() {
    this.els.loadingEl?.classList.add('hidden')
  }

  showPause() {
    document.body.classList.remove('state-menu')
    this.els.pauseEl.classList.remove('hidden')
    this.els.menuEl.classList.add('hidden')
    this.els.controlsEl.classList.add('hidden')
    this.els.hudEl.classList.remove('hidden')
  }

  showHUD() {
    // Ensure any preview render loops are stopped when leaving menus.
    this._stopCraftPreview?.()
    this._stopForgeTablePreview?.()
    if (!this.preview3dEnabled) {
      this.disposeCraftPreview?.()
      this.disposeForgeTablePreview?.()
    }

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

  _stopCraftPreview() {
    try {
      if (this._craftPrev) this._craftPrev.running = false
      if (this._craftPrev?.raf) cancelAnimationFrame(this._craftPrev.raf)
    } catch {}
    if (this._craftPrev) this._craftPrev.raf = 0
  }

  _stopForgeTablePreview() {
    try {
      if (this._forgeTablePrev) this._forgeTablePrev.running = false
      if (this._forgeTablePrev?.raf) cancelAnimationFrame(this._forgeTablePrev.raf)
    } catch {}
    if (this._forgeTablePrev) this._forgeTablePrev.raf = 0
  }

  disposeCraftPreview() {
    this._stopCraftPreview()
    try {
      const p = this._craftPrev
      if (p?.obj) p.obj.removeFromParent()
      // Best-effort dispose
      if (p?.obj?.traverse) {
        p.obj.traverse((o) => {
          if (o?.geometry?.dispose) o.geometry.dispose()
          if (o?.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m?.dispose?.())
            else o.material?.dispose?.()
          }
        })
      }
      p?.renderer?.dispose?.()
    } catch {}
    this._craftPrev = null
  }

  disposeForgeTablePreview() {
    this._stopForgeTablePreview()
    try {
      const p = this._forgeTablePrev
      if (p?.obj) p.obj.removeFromParent()
      if (p?.obj?.traverse) {
        p.obj.traverse((o) => {
          if (o?.geometry?.dispose) o.geometry.dispose()
          if (o?.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m?.dispose?.())
            else o.material?.dispose?.()
          }
        })
      }
      p?.renderer?.dispose?.()
    } catch {}
    this._forgeTablePrev = null
  }

  hideForgeTable() {
    this._stopForgeTablePreview()
    if (!this.preview3dEnabled) this.disposeForgeTablePreview()
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
    this._stopCraftPreview()
    if (!this.preview3dEnabled) this.disposeCraftPreview()
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
  _ensureCraftCatalogEls() {
    if (this._craftCatalogEls) return this._craftCatalogEls
    this._craftCatalogEls = {
      cats: document.querySelector('#craftCats'),
      grid: document.querySelector('#craftGrid'),
      title: document.querySelector('#craftDetailTitle'),
      desc: document.querySelector('#craftDetailDesc'),
      cost: document.querySelector('#craftDetailCost'),
      btn: document.querySelector('#btnCraftMake'),
      canvas: document.querySelector('#craftPreview'),
      icon: document.querySelector('#craftPreviewIcon'),
    }
    return this._craftCatalogEls
  }

  _craftMetaFor(recipe) {
    const id = String(recipe?.id || '')
    const outId = String(recipe?.output?.id || '')

    // Category + description (pt-BR)
    const meta = {
      cat: 'Utilidade',
      desc: '',
      outId,
    }

    if (id === 'axe_stone' || id === 'pickaxe_stone' || outId.includes('axe') || outId.includes('pickaxe') || outId.includes('hoe')) {
      meta.cat = 'Ferramentas'
      meta.desc = 'Ferramenta para coletar recursos com mais eficiência.'
    } else if (outId === 'campfire') {
      meta.cat = 'Construções'
      meta.desc = 'Fogueira para iluminar e interagir.'
    } else if (outId === 'chest') {
      meta.cat = 'Construções'
      meta.desc = 'Armazenamento pessoal para organizar seus itens.'
    } else if (outId === 'forge' || outId === 'forge_table') {
      meta.cat = 'Produção'
      meta.desc = outId === 'forge' ? 'Funde minério usando combustível para produzir barras.' : 'Usa barras para criar ferramentas de metal.'
    } else if (outId === 'torch') {
      meta.cat = 'Utilidade'
      meta.desc = 'Fonte de luz portátil.'
    } else if (outId === 'rope') {
      meta.cat = 'Utilidade'
      meta.desc = 'Material básico para futuras receitas.'
    } else if (outId === 'backpack') {
      meta.cat = 'Equipamentos'
      meta.desc = 'Mochila: ao equipar, adiciona +10 slots no inventário.'
    }

    return meta
  }

  _craftPreviewInit() {
    if (this._craftPreview) return
    try {
      // Lazy import to keep initial load smaller.
      this._craftPreview = { ready: false }
    } catch {
      this._craftPreview = null
    }
  }

  async _craftPreviewShow(outputItemId) {
    if (!this.preview3dEnabled) return
    const els = this._ensureCraftCatalogEls()
    const canvas = els.canvas
    if (!canvas) return

    // Lazy-load three only when crafting UI is used.
    if (!this._three) {
      const THREE = await import('three')
      this._three = THREE
    }

    const THREE = this._three

    if (!this._craftPrev) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
      renderer.setSize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height, false)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50)
      camera.position.set(2.6, 1.6, 2.6)
      camera.lookAt(0, 0.7, 0)

      scene.add(new THREE.AmbientLight(0xffffff, 0.65))
      const d = new THREE.DirectionalLight(0xffffff, 0.85)
      d.position.set(3, 4, 2)
      scene.add(d)

      const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshStandardMaterial({ color: 0x121218, roughness: 1.0, metalness: 0.0 }))
      floor.rotation.x = -Math.PI / 2
      floor.position.y = 0
      scene.add(floor)

      this._craftPrev = { renderer, scene, camera, obj: null, raf: 0, running: true, tick: null }

      const tick = () => {
        if (!this._craftPrev) return
        if (!this._craftPrev.running) return
        const { renderer, scene, camera, obj } = this._craftPrev
        const w = canvas.clientWidth || canvas.width
        const h = canvas.clientHeight || canvas.height
        renderer.setSize(w, h, false)
        camera.aspect = Math.max(0.1, w / Math.max(1, h))
        camera.updateProjectionMatrix()
        if (obj) obj.rotation.y += 0.012
        renderer.render(scene, camera)
        this._craftPrev.raf = requestAnimationFrame(tick)
      }
      this._craftPrev.tick = tick
      this._craftPrev.raf = requestAnimationFrame(tick)
    } else {
      // Resume loop if it was stopped
      if (this._craftPrev && !this._craftPrev.running) {
        this._craftPrev.running = true
        const tfn = this._craftPrev.tick
        if (tfn) this._craftPrev.raf = requestAnimationFrame(tfn)
      }
    }

    // replace object
    const prev = this._craftPrev.obj
    if (prev) {
      prev.removeFromParent()
    }

    const obj = this._makePreviewObject(outputItemId, THREE)
    obj.position.set(0, 0, 0)
    this._craftPrev.scene.add(obj)
    this._craftPrev.obj = obj
  }

  _makePreviewObject(outputItemId, THREE) {
    const id = String(outputItemId || '')

    // Simple "real" previews (not ghosts)
    if (id === 'chest') {
      const g = new THREE.Group()
      const wood = new THREE.MeshStandardMaterial({ color: 0x6b3f24, roughness: 0.95 })
      const metal = new THREE.MeshStandardMaterial({ color: 0x3b3b44, roughness: 0.6, metalness: 0.25 })
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 0.8), wood)
      base.position.y = 0.28
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.8), wood)
      lid.position.y = 0.68
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.08, 0.82), metal)
      band.position.y = 0.52
      g.add(base, lid, band)
      return g
    }

    if (id === 'forge') {
      const g = new THREE.Group()
      const stone = new THREE.MeshStandardMaterial({ color: 0x2a2a2f, roughness: 1.0 })
      const metal = new THREE.MeshStandardMaterial({ color: 0x3c3c46, roughness: 0.6, metalness: 0.25 })
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, 0.7, 14), stone)
      base.position.y = 0.35
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.9, 14), stone)
      body.position.y = 1.0
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.14, 14), metal)
      rim.position.y = 1.52
      g.add(base, body, rim)
      return g
    }

    if (id === 'forge_table') {
      const g = new THREE.Group()
      const wood = new THREE.MeshStandardMaterial({ color: 0x4b2f1c, roughness: 0.95 })
      const metal = new THREE.MeshStandardMaterial({ color: 0x51515b, roughness: 0.55, metalness: 0.25 })
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 1.1), wood)
      top.position.y = 0.95
      const legGeo = new THREE.BoxGeometry(0.16, 0.9, 0.16)
      const leg1 = new THREE.Mesh(legGeo, wood); leg1.position.set(-0.8, 0.45, -0.45)
      const leg2 = new THREE.Mesh(legGeo, wood); leg2.position.set(0.8, 0.45, -0.45)
      const leg3 = new THREE.Mesh(legGeo, wood); leg3.position.set(-0.8, 0.45, 0.45)
      const leg4 = new THREE.Mesh(legGeo, wood); leg4.position.set(0.8, 0.45, 0.45)
      const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.42), metal)
      anvil.position.set(0, 1.12, 0)
      g.add(top, leg1, leg2, leg3, leg4, anvil)
      return g
    }

    if (id === 'campfire') {
      const g = new THREE.Group()
      const wood = new THREE.MeshStandardMaterial({ color: 0x5a351f, roughness: 0.95 })
      const coal = new THREE.MeshStandardMaterial({ color: 0x1a0f08, roughness: 1.0 })
      const logGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 10)
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(logGeo, wood)
        m.rotation.z = Math.PI / 2
        m.rotation.y = (i / 3) * Math.PI
        m.position.y = 0.18
        g.add(m)
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), coal)
      core.position.y = 0.25
      g.add(core)
      return g
    }

    // Fallback: simple "token" mesh
    const mat = new THREE.MeshStandardMaterial({ color: 0x4aa3ff, roughness: 0.6, metalness: 0.05 })
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
    m.position.y = 0.6
    return m
  }

  renderCrafting(recipes, invCount, getItem, onCraft, rootOverride = null) {
    // New catalog UI uses #craftCats/#craftGrid/#craftDetail...
    const els = this._ensureCraftCatalogEls()
    if (!els?.cats || !els?.grid) {
      // fallback to old list if DOM not present
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
      return
    }

    const metas = recipes.map((r) => ({ r, m: this._craftMetaFor(r) }))
    const cats = Array.from(new Set(metas.map((x) => x.m.cat)))

    // state in UI instance
    this._craftState = this._craftState || { cat: cats[0] || 'Ferramentas', activeId: '' }
    if (!cats.includes(this._craftState.cat)) this._craftState.cat = cats[0] || 'Ferramentas'

    const setActiveRecipe = async (rid) => {
      this._craftState.activeId = rid
      // highlight cards
      els.grid.querySelectorAll('.craftCard').forEach((el) => {
        el.classList.toggle('active', el.getAttribute('data-recipe') === rid)
      })

      const rec = recipes.find((x) => String(x.id) === String(rid))
      if (!rec) return
      const meta = this._craftMetaFor(rec)

      els.title.textContent = rec.name
      els.desc.textContent = meta.desc || ''

      // cost lines
      els.cost.innerHTML = ''
      const can = rec.cost.every((c) => invCount(c.id) >= c.qty)
      for (const c of rec.cost) {
        const it = getItem(c.id)
        const have = invCount(c.id)
        const ok = have >= c.qty
        const line = document.createElement('div')
        line.className = 'craftCostLine ' + (ok ? 'ok' : 'bad')
        line.innerHTML = `<div>${it?.icon ?? ''} ${it?.name ?? c.id}</div><div>${have}/${c.qty}</div>`
        els.cost.appendChild(line)
      }

      els.btn.disabled = !can
      els.btn.textContent = can ? 'Construir' : 'Falta recurso'
      els.btn.onclick = () => onCraft(rec.id)

      // Preview: 3D or big icon
      if (els.icon) els.icon.textContent = getItem(meta.outId)?.icon ?? ''
      if (els.canvas) els.canvas.style.display = this.preview3dEnabled ? '' : 'none'
      if (els.icon) els.icon.style.display = this.preview3dEnabled ? 'none' : ''

      await this._craftPreviewShow(meta.outId)
    }

    // categories
    els.cats.innerHTML = ''
    for (const c of cats) {
      const b = document.createElement('button')
      b.className = 'craftCatBtn' + (c === this._craftState.cat ? ' active' : '')
      b.textContent = c
      b.addEventListener('click', () => {
        this._craftState.cat = c
        this.renderCrafting(recipes, invCount, getItem, onCraft, rootOverride)
      })
      els.cats.appendChild(b)
    }

    // grid
    els.grid.innerHTML = ''
    const list = metas.filter((x) => x.m.cat === this._craftState.cat)
    for (const { r } of list) {
      const out = getItem(r.output.id)
      const can = r.cost.every((c) => invCount(c.id) >= c.qty)
      const costLine = r.cost.map((c) => {
        const it = getItem(c.id)
        return `${it.icon} ${c.qty}`
      }).join(' ')

      const card = document.createElement('div')
      card.className = 'craftCard'
      card.setAttribute('data-recipe', r.id)
      card.innerHTML = `
        <div class="craftCardTop">
          <div class="craftCardIco">${out?.icon ?? ''}</div>
          <div>
            <div class="craftCardName">${r.name}</div>
            <div class="muted small">${can ? 'Disponível' : 'Faltam recursos'}</div>
          </div>
        </div>
        <div class="craftCardCost">${costLine}</div>
      `
      card.addEventListener('click', () => setActiveRecipe(r.id))
      els.grid.appendChild(card)
    }

    // Auto-select first in category
    const nextId = this._craftState.activeId && list.some((x) => x.r.id === this._craftState.activeId)
      ? this._craftState.activeId
      : (list[0]?.r?.id || '')

    if (nextId) void setActiveRecipe(nextId)
  }

  _ensureForgeTableCatalogEls() {
    if (this._forgeTableCatalogEls) return this._forgeTableCatalogEls
    this._forgeTableCatalogEls = {
      cats: document.querySelector('#forgeTableCats'),
      grid: document.querySelector('#forgeTableGrid'),
      title: document.querySelector('#forgeTableDetailTitle'),
      desc: document.querySelector('#forgeTableDetailDesc'),
      cost: document.querySelector('#forgeTableDetailCost'),
      btn: document.querySelector('#btnForgeTableMake'),
      canvas: document.querySelector('#forgeTablePreview'),
      icon: document.querySelector('#forgeTablePreviewIcon'),
    }
    return this._forgeTableCatalogEls
  }

  _forgeTableMetaFor(recipe) {
    const outId = String(recipe?.output?.id || '')

    const meta = {
      cat: 'Ferramentas',
      desc: 'Ferramenta de metal: mais dano e durabilidade.',
      outId,
    }

    if (outId === 'axe_metal') meta.desc = 'Machado de metal: corta árvores mais rápido.'
    else if (outId === 'pickaxe_metal') meta.desc = 'Picareta de metal: quebra rochas/minério mais rápido.'
    else if (outId === 'hoe_metal') meta.desc = 'Enxada de metal: arar e colher plantações.'
    else if (outId === 'backpack') {
      meta.cat = 'Equipamentos'
      meta.desc = 'Mochila: ao equipar, adiciona +10 slots no inventário.'
    } else if (outId === 'woodcutter_hat') {
      meta.cat = 'Equipamentos'
      meta.desc = 'Peça do conjunto Lenhador (cabeça).'
    } else if (outId === 'woodcutter_shirt') {
      meta.cat = 'Equipamentos'
      meta.desc = 'Peça do conjunto Lenhador (camisa).'
    } else if (outId === 'woodcutter_pants') {
      meta.cat = 'Equipamentos'
      meta.desc = 'Peça do conjunto Lenhador (calça).'
    } else if (outId === 'woodcutter_boots') {
      meta.cat = 'Equipamentos'
      meta.desc = 'Peça do conjunto Lenhador (bota).'
    } else if (outId === 'woodcutter_gloves') {
      meta.cat = 'Equipamentos'
      meta.desc = 'Peça do conjunto Lenhador (luva).'
    }

    return meta
  }

  async _forgeTablePreviewShow(outputItemId) {
    if (!this.preview3dEnabled) return
    const els = this._ensureForgeTableCatalogEls()
    const canvas = els.canvas
    if (!canvas) return

    if (!this._three) {
      const THREE = await import('three')
      this._three = THREE
    }
    const THREE = this._three

    if (!this._forgeTablePrev) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
      renderer.setSize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height, false)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50)
      camera.position.set(2.6, 1.6, 2.6)
      camera.lookAt(0, 0.7, 0)

      scene.add(new THREE.AmbientLight(0xffffff, 0.65))
      const d = new THREE.DirectionalLight(0xffffff, 0.85)
      d.position.set(3, 4, 2)
      scene.add(d)

      const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshStandardMaterial({ color: 0x121218, roughness: 1.0, metalness: 0.0 }))
      floor.rotation.x = -Math.PI / 2
      floor.position.y = 0
      scene.add(floor)

      this._forgeTablePrev = { renderer, scene, camera, obj: null, raf: 0, running: true, tick: null }

      const tick = () => {
        if (!this._forgeTablePrev) return
        if (!this._forgeTablePrev.running) return
        const { renderer, scene, camera, obj } = this._forgeTablePrev
        const w = canvas.clientWidth || canvas.width
        const h = canvas.clientHeight || canvas.height
        renderer.setSize(w, h, false)
        camera.aspect = Math.max(0.1, w / Math.max(1, h))
        camera.updateProjectionMatrix()
        if (obj) obj.rotation.y += 0.012
        renderer.render(scene, camera)
        this._forgeTablePrev.raf = requestAnimationFrame(tick)
      }
      this._forgeTablePrev.tick = tick
      this._forgeTablePrev.raf = requestAnimationFrame(tick)
    } else {
      if (this._forgeTablePrev && !this._forgeTablePrev.running) {
        this._forgeTablePrev.running = true
        const tfn = this._forgeTablePrev.tick
        if (tfn) this._forgeTablePrev.raf = requestAnimationFrame(tfn)
      }
    }

    const prev = this._forgeTablePrev.obj
    if (prev) prev.removeFromParent()

    const obj = this._makePreviewObject(outputItemId, THREE)
    obj.position.set(0, 0, 0)
    this._forgeTablePrev.scene.add(obj)
    this._forgeTablePrev.obj = obj
  }

  renderForgeTable(recipes, invCount, getItem, onCraft) {
    const els = this._ensureForgeTableCatalogEls()
    if (!els?.cats || !els?.grid) {
      // fallback
      this.renderCrafting(recipes, invCount, getItem, onCraft, this.els.forgeTableListEl)
      return
    }

    const metas = recipes.map((r) => ({ r, m: this._forgeTableMetaFor(r) }))
    const cats = Array.from(new Set(metas.map((x) => x.m.cat)))

    this._forgeTableState = this._forgeTableState || { cat: cats[0] || 'Ferramentas', activeId: '' }
    if (!cats.includes(this._forgeTableState.cat)) this._forgeTableState.cat = cats[0] || 'Ferramentas'

    const setActiveRecipe = async (rid) => {
      this._forgeTableState.activeId = rid
      els.grid.querySelectorAll('.craftCard').forEach((el) => {
        el.classList.toggle('active', el.getAttribute('data-recipe') === rid)
      })

      const rec = recipes.find((x) => String(x.id) === String(rid))
      if (!rec) return
      const meta = this._forgeTableMetaFor(rec)

      els.title.textContent = rec.name
      els.desc.textContent = meta.desc || ''

      els.cost.innerHTML = ''
      const can = rec.cost.every((c) => invCount(c.id) >= c.qty)
      for (const c of rec.cost) {
        const it = getItem(c.id)
        const have = invCount(c.id)
        const ok = have >= c.qty
        const line = document.createElement('div')
        line.className = 'craftCostLine ' + (ok ? 'ok' : 'bad')
        line.innerHTML = `<div>${it?.icon ?? ''} ${it?.name ?? c.id}</div><div>${have}/${c.qty}</div>`
        els.cost.appendChild(line)
      }

      els.btn.disabled = !can
      els.btn.textContent = can ? 'Forjar' : 'Faltam recursos'
      els.btn.onclick = () => onCraft(rec.id)

      // Preview: 3D or big icon
      if (els.icon) els.icon.textContent = getItem(meta.outId)?.icon ?? ''
      if (els.canvas) els.canvas.style.display = this.preview3dEnabled ? '' : 'none'
      if (els.icon) els.icon.style.display = this.preview3dEnabled ? 'none' : ''

      await this._forgeTablePreviewShow(meta.outId)
    }

    // categories (single or few)
    els.cats.innerHTML = ''
    for (const c of cats) {
      const b = document.createElement('button')
      b.className = 'craftCatBtn' + (c === this._forgeTableState.cat ? ' active' : '')
      b.textContent = c
      b.addEventListener('click', () => {
        this._forgeTableState.cat = c
        this.renderForgeTable(recipes, invCount, getItem, onCraft)
      })
      els.cats.appendChild(b)
    }

    // grid
    els.grid.innerHTML = ''
    const list = metas.filter((x) => x.m.cat === this._forgeTableState.cat)
    for (const { r } of list) {
      const out = getItem(r.output.id)
      const can = r.cost.every((c) => invCount(c.id) >= c.qty)
      const costLine = r.cost.map((c) => {
        const it = getItem(c.id)
        return `${it.icon} ${c.qty}`
      }).join(' ')

      const card = document.createElement('div')
      card.className = 'craftCard'
      card.setAttribute('data-recipe', r.id)
      card.innerHTML = `
        <div class="craftCardTop">
          <div class="craftCardIco">${out?.icon ?? ''}</div>
          <div>
            <div class="craftCardName">${r.name}</div>
            <div class="muted small">${can ? 'Disponível' : 'Faltam recursos'}</div>
          </div>
        </div>
        <div class="craftCardCost">${costLine}</div>
      `
      card.addEventListener('click', () => setActiveRecipe(r.id))
      els.grid.appendChild(card)
    }

    const nextId = this._forgeTableState.activeId && list.some((x) => x.r.id === this._forgeTableState.activeId)
      ? this._forgeTableState.activeId
      : (list[0]?.r?.id || '')

    if (nextId) void setActiveRecipe(nextId)
  }

  renderInventory(slots, getItem, { slotCountHint = null, selectedIndex = -1, hotbarByItemId = null } = {}) {
    const grid = this.els.invGridEl
    grid.innerHTML = ''

    if (this.els.invHintEl) {
      const base = typeof slotCountHint === 'number' ? `${slotCountHint} slots` : `${slots.length} slots`
      this.els.invHintEl.innerHTML = `${base} • stacks até 100 • passe o mouse + <b>2-9/0</b> para atalho (<b>1</b> = mão fixa) • <b>I</b> para abrir/fechar`
    }

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      const selected = i === Number(selectedIndex)
      const cell = document.createElement('div')
      cell.className = 'invSlot' + (s ? ' draggable' : ' invEmpty') + (selected ? ' selected' : '')
      cell.dataset.index = String(i)

      if (s) {
        const item = getItem(s.id)
        cell.draggable = true
        const extra = item.stackable ? `${s.qty} / 100` : this._toolLine(s)
        const hot = hotbarByItemId?.[s.id]
        const hotBadge = Number.isInteger(hot) ? `<div class="invHotBadge">${hot}</div>` : ''
        cell.innerHTML = `<div class="invTop"><div class="invIcon">${item.icon}</div><div class="invName">${item.name}</div>${hotBadge}</div><div class="invQty">${extra}</div>`
      } else {
        cell.innerHTML = ''
      }

      grid.appendChild(cell)
    }
  }

  renderEquipment(equipment, getItem) {
    const root = this.els.invEquipGridEl
    if (!root) return

    const slots = ['hat', 'shirt', 'pants', 'boots', 'gloves', 'backpack']
    for (const name of slots) {
      const el = root.querySelector(`.equipSlot[data-eq="${name}"]`)
      if (!el) continue
      const itemEl = el.querySelector('.equipItem')
      if (!itemEl) continue

      const s = equipment?.[name] || null
      if (!s) {
        itemEl.innerHTML = '<span class="left muted">(vazio)</span>'
        continue
      }

      const def = getItem(s.id)
      const ico = def?.icon ?? ''
      const nm = def?.name ?? s.id

      const rem = typeof s.meta?.equipRemainingMs === 'number' ? Math.max(0, s.meta.equipRemainingMs) : null
      const durStr = rem == null ? '' : this._formatRemaining(rem)

      itemEl.innerHTML = `
        <span class="left"><span>${ico}</span><span>${nm}</span></span>
        <span class="equipDur">${durStr}</span>
      `.trim()
    }
  }

  setBuffLine(text) {
    const el = this.els.invBuffLineEl
    if (!el) return
    if (!text) {
      el.textContent = ''
      el.classList.add('hidden')
      return
    }
    el.textContent = text
    el.classList.remove('hidden')
  }

  setLuckHudLine(text) {
    const el = this.els.luckHudLineEl
    if (!el) return
    if (!text) {
      el.textContent = ''
      el.classList.add('hidden')
      return
    }
    el.textContent = text
    el.classList.remove('hidden')
  }

  _formatRemaining(ms) {
    const s = Math.ceil(ms / 1000)
    const days = Math.floor(s / 86400)
    const hours = Math.floor((s % 86400) / 3600)
    const mins = Math.floor((s % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m`
    return `${mins}m ${String(s % 60).padStart(2, '0')}s`
  }

  renderHotbar(slots, getItem, activeIdx) {
    const root = document.querySelector('#hotbar')
    if (!root) return
    const els = root.querySelectorAll('.hotSlot')

    const dragEnabled = false

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
