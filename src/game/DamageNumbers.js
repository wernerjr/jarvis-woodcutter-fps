import * as THREE from 'three'
import { clamp } from './util.js'

export class DamageNumbers {
  /** @param {{container: HTMLElement, max?: number}} opts */
  constructor({ container, max = 24 } = {}) {
    this.container = container
    this.max = max

    /** @type {{el: HTMLDivElement, pos: THREE.Vector3, vy: number, t: number, ttl: number, text: string}[]} */
    this.active = []
    /** @type {HTMLDivElement[]} */
    this.pool = []

    this._tmp = new THREE.Vector3()
  }

  /** @param {THREE.Vector3} worldPos @param {string} text */
  spawn(worldPos, text) {
    if (!this.container) return

    // If full, recycle the oldest.
    if (this.active.length >= this.max) {
      const old = this.active.shift()
      if (old) this.pool.push(old.el)
    }

    const el = this.pool.pop() || document.createElement('div')
    el.className = 'dmg'
    el.textContent = text

    const item = {
      el,
      pos: worldPos.clone(),
      vy: 0.65,
      t: 0,
      ttl: 0.85,
      text,
    }

    el.style.opacity = '1'
    el.style.transform = 'translate(-9999px,-9999px)'

    this.container.appendChild(el)
    this.active.push(item)
  }

  /** @param {number} dt @param {THREE.Camera} camera */
  update(dt, camera) {
    if (!this.container) return

    const w = window.innerWidth
    const h = window.innerHeight

    for (let i = this.active.length - 1; i >= 0; i--) {
      const it = this.active[i]
      it.t += dt

      // animate up
      it.pos.y += it.vy * dt

      const a = 1 - clamp(it.t / it.ttl, 0, 1)
      it.el.style.opacity = String(a)

      // project
      this._tmp.copy(it.pos)
      this._tmp.project(camera)

      const sx = (this._tmp.x * 0.5 + 0.5) * w
      const sy = (-this._tmp.y * 0.5 + 0.5) * h

      it.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${0.95 + (1 - a) * 0.1})`

      // remove if behind camera or expired
      if (it.t >= it.ttl || this._tmp.z > 1) {
        it.el.remove()
        this.pool.push(it.el)
        this.active.splice(i, 1)
      }
    }
  }
}
