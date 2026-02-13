export class Perf {
  constructor() {
    this.enabled = false

    this._acc = 0
    this._frames = 0
    this.fps = 0
    this.frameMs = 0

    this.memMB = null
  }

  setEnabled(v) {
    this.enabled = !!v
  }

  /** @param {number} dt */
  update(dt) {
    if (!this.enabled) return

    this._acc += dt
    this._frames += 1
    this.frameMs = dt * 1000

    // Update ~4x/sec for stability.
    if (this._acc >= 0.25) {
      this.fps = Math.round(this._frames / this._acc)
      this._acc = 0
      this._frames = 0

      // Memory (Chrome-only)
      const pm = /** @type {any} */ (performance).memory
      if (pm && typeof pm.usedJSHeapSize === 'number') {
        this.memMB = Math.round((pm.usedJSHeapSize / (1024 * 1024)) * 10) / 10
      } else {
        this.memMB = null
      }
    }
  }
}
