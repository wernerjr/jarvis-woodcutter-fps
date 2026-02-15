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
   * Real-time tuned cycle:
   * - Day (sunrise->sunset): 15 min (900s)
   * - Night (sunset->sunrise): 5 min (300s)
   * Total: 20 min (1200s)
   *
   * In-game clock remains 24h with sunrise=06:00, sunset=18:00.
   * We achieve 15/5 by advancing hours at different rates in day vs night.
   *
   * @param {{startHours?: number}} opts
   */
  constructor({ startHours = 9.0 } = {}) {
    // Conventional sunrise/sunset (for blending + UI).
    this.sunrise = 6
    this.sunset = 18

    // Real seconds per segment.
    this.realDaySeconds = 15 * 60
    this.realNightSeconds = 5 * 60

    // In-game hours per segment.
    this.dayHours = 12 // 06 -> 18
    this.nightHours = 12 // 18 -> 06

    this.hours = startHours
    this.norm = this.hours / 24
  }

  update(dt) {
    if (dt <= 0) return

    const h = this.hours
    const isDay = h >= this.sunrise && h < this.sunset

    // Advance faster at night so it lasts only 5 min real time.
    const hoursPerSecond = isDay ? (this.dayHours / this.realDaySeconds) : (this.nightHours / this.realNightSeconds)

    this.hours = (h + dt * hoursPerSecond) % 24
    this.norm = this.hours / 24
  }

  getHHMM() {
    const h = Math.floor(this.hours) % 24
    const m = Math.floor((this.hours - h) * 60)
    return `${pad2(h)}:${pad2(m)}`
  }

  /**
   * Returns daylight factor [0..1] with smooth transitions.
   * We blend around sunrise/sunset in *clock hours* (not cosine altitude)
   * so day/night lengths can be asymmetric (15/5).
   */
  getDayFactor() {
    const h = this.hours

    // Transition width in in-game hours.
    // 1.0h ~= ~75s in day, ~25s at night (good enough).
    const w = 1.0

    const sunriseIn = smoothstep(this.sunrise - w, this.sunrise + w, h)
    const sunsetOut = 1 - smoothstep(this.sunset - w, this.sunset + w, h)

    // If we're after midnight (< sunrise), sunriseIn will be ~0; that's fine.
    return clamp(sunriseIn * sunsetOut, 0, 1)
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
