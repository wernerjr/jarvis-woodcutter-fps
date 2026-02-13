import * as THREE from 'three'

export class RemotePlayersManager {
  /** @param {{scene:THREE.Scene}} params */
  constructor({ scene }) {
    this.scene = scene
    /**
     * id -> {
     *   root, mesh,
     *   samples: Array<{t:number,x:number,z:number,yaw:number}>,
     *   lastSeenAt:number
     * }
     */
    this.players = new Map()

    // Interpolation settings (client-only presentation)
    this.interpDelayMs = 150
    this.maxExtrapMs = 250
    this.maxSpeed = 14 // m/s clamp for extrap (prevents huge teleports)

    this._matA = new THREE.MeshStandardMaterial({ color: 0x7aa7ff, roughness: 0.8, metalness: 0.1, flatShading: true })
    this._matB = new THREE.MeshStandardMaterial({ color: 0xffb06a, roughness: 0.9, metalness: 0.0, flatShading: true })
    this._geo = new THREE.CapsuleGeometry(0.35, 1.2, 4, 8)

    this._debug = { lastSnapAt: 0, snapDtMs: 0 }
  }

  _ensure(id) {
    let p = this.players.get(id)
    if (p) return p

    const root = new THREE.Group()
    root.name = `RemotePlayer:${id}`

    const mat = (this.players.size % 2 === 0) ? this._matA : this._matB
    const mesh = new THREE.Mesh(this._geo, mat)
    mesh.position.y = 0.95
    root.add(mesh)

    this.scene.add(root)
    p = { root, mesh, samples: [], lastSeenAt: 0 }
    this.players.set(id, p)
    return p
  }

  applySnapshot({ meId, players }) {
    const now = performance.now()
    if (this._debug.lastSnapAt) this._debug.snapDtMs = now - this._debug.lastSnapAt
    this._debug.lastSnapAt = now

    const seen = new Set()
    for (const pl of players || []) {
      if (!pl?.id || pl.id === meId) continue
      const p = this._ensure(pl.id)
      const x = Number(pl.x || 0)
      const z = Number(pl.z || 0)
      const yaw = Number(pl.yaw || 0)

      p.lastSeenAt = now
      p.samples.push({ t: now, x, z, yaw })
      // keep short history
      if (p.samples.length > 40) p.samples.splice(0, p.samples.length - 40)

      seen.add(pl.id)
    }

    for (const [id, p] of this.players) {
      if (!seen.has(id)) {
        p.root.removeFromParent()
        this.players.delete(id)
      }
    }
  }

  _lerpAngle(a, b, t) {
    // Wrap to [-PI, PI]
    let d = b - a
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return a + d * t
  }

  update(dt) {
    const now = performance.now()
    const targetT = now - this.interpDelayMs

    for (const p of this.players.values()) {
      const s = p.samples
      if (!s || s.length === 0) continue

      // Drop very old samples
      while (s.length >= 3 && s[1].t < targetT - 2000) s.shift()

      // Find bracketing samples
      let a = null
      let b = null
      for (let i = 0; i < s.length; i++) {
        if (s[i].t <= targetT) a = s[i]
        if (s[i].t >= targetT) { b = s[i]; break }
      }

      if (!a) a = s[0]
      if (!b) b = s[s.length - 1]

      let x = a.x
      let z = a.z
      let yaw = a.yaw

      if (a && b && b.t !== a.t && targetT >= a.t && targetT <= b.t) {
        const t = (targetT - a.t) / (b.t - a.t)
        x = a.x + (b.x - a.x) * t
        z = a.z + (b.z - a.z) * t
        yaw = this._lerpAngle(a.yaw, b.yaw, t)
      } else {
        // Extrapolate from last 2 samples if we're ahead of newest.
        const last = s[s.length - 1]
        const prev = s.length >= 2 ? s[s.length - 2] : null
        const aheadMs = Math.max(0, targetT - last.t)
        if (prev && aheadMs > 0 && aheadMs <= this.maxExtrapMs) {
          const dtMs = Math.max(1, last.t - prev.t)
          const vx = (last.x - prev.x) / (dtMs / 1000)
          const vz = (last.z - prev.z) / (dtMs / 1000)
          const sp = Math.hypot(vx, vz)
          const clamp = sp > this.maxSpeed ? this.maxSpeed / sp : 1
          x = last.x + vx * clamp * (aheadMs / 1000)
          z = last.z + vz * clamp * (aheadMs / 1000)
          yaw = last.yaw
        } else {
          x = last.x
          z = last.z
          yaw = last.yaw
        }
      }

      // Cheap snap clamp per-frame (prevents sudden long jumps).
      const dx = x - p.root.position.x
      const dz = z - p.root.position.z
      const maxStep = this.maxSpeed * Math.max(0.001, dt)
      const d = Math.hypot(dx, dz)
      if (d > maxStep && d > 0.0001) {
        x = p.root.position.x + (dx / d) * maxStep
        z = p.root.position.z + (dz / d) * maxStep
      }

      p.root.position.set(x, 0, z)
      p.root.rotation.y = yaw
    }
  }

  getDebugLine() {
    const snap = this._debug.snapDtMs
    const snapHz = snap > 0 ? (1000 / snap) : 0
    return `interp:${this.interpDelayMs}ms snap:${snapHz.toFixed(1)}Hz`
  }

  clear() {
    for (const p of this.players.values()) p.root.removeFromParent()
    this.players.clear()
    this._debug.lastSnapAt = 0
    this._debug.snapDtMs = 0
  }
}
