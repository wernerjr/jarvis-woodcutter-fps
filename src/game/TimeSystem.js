import { clamp } from './util.js'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export class TimeSystem {
  /**
   * 24h in 10 real minutes => 600s.
   * @param {{startHours?: number}} opts
   */
  constructor({ startHours = 9.0 } = {}) {
    this.daySeconds = 600
    this.hoursPerSecond = 24 / this.daySeconds

    this.hours = startHours
    this.norm = this.hours / 24

    // Conventional sunrise/sunset (for blending).
    this.sunrise = 6
    this.sunset = 18
  }

  update(dt) {
    if (dt <= 0) return
    this.hours = (this.hours + dt * this.hoursPerSecond) % 24
    this.norm = this.hours / 24
  }

  getHHMM() {
    const h = Math.floor(this.hours) % 24
    const m = Math.floor((this.hours - h) * 60)
    return `${pad2(h)}:${pad2(m)}`
  }

  /**
   * Returns daylight factor [0..1] with smooth transitions.
   * Uses a simple solar altitude model.
   */
  getDayFactor() {
    // angle: -pi at midnight, 0 at noon, pi at next midnight
    const a = this.norm * Math.PI * 2 - Math.PI
    const altitude = Math.cos(a) // 1 at noon, -1 at midnight

    // Widen transition band so dawn/dusk lasts a bit.
    return smoothstep(-0.10, 0.20, altitude)
  }

  /**
   * Proximity to next transition (sunrise/sunset) in [0..1].
   * 1 means "very close".
   */
  getTransitionProximity() {
    const h = this.hours
    const next = h < this.sunrise ? this.sunrise : h < this.sunset ? this.sunset : this.sunrise + 24
    const delta = next - h

    // Window: last 1.5 in-game hours (~45s real time).
    const windowH = 1.5
    return 1 - clamp(delta / windowH, 0, 1)
  }
}
