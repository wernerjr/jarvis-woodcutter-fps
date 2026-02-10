export class Sfx {
  constructor() {
    this.ctx = null
    this.master = null
  }

  async enable() {
    if (this.ctx) return
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.22
    this.master.connect(this.ctx.destination)
    await this.ctx.resume()
  }

  _beep({ freq = 440, dur = 0.08, type = 'sine', gain = 0.3, bendTo = null } = {}) {
    if (!this.ctx || !this.master) return

    const t0 = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (bendTo) osc.frequency.exponentialRampToValueAtTime(bendTo, t0 + dur)

    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

    osc.connect(g)
    g.connect(this.master)

    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  chop() {
    // metallic thunk + woody tick
    this._beep({ freq: 160, bendTo: 90, dur: 0.09, type: 'square', gain: 0.35 })
    this._beep({ freq: 520, bendTo: 220, dur: 0.06, type: 'triangle', gain: 0.18 })
  }

  click() {
    this._beep({ freq: 260, bendTo: 200, dur: 0.045, type: 'sine', gain: 0.12 })
  }
}
