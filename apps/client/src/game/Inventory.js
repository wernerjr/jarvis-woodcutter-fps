import { ITEMS } from './items.js'

export class Inventory {
  /** @param {{slots?: number, maxStack?: number}} opts */
  constructor({ slots = 20, maxStack = 100 } = {}) {
    this.slotCount = slots
    this.maxStack = maxStack
    /** @type {(null | {id: string, qty: number, meta?: any})[]} */
    this.slots = Array.from({ length: slots }, () => null)
  }

  clear() {
    this.slots = Array.from({ length: this.slotCount }, () => null)
  }

  /** @param {number} idx */
  removeSlot(idx) {
    if (idx < 0 || idx >= this.slots.length) return
    this.slots[idx] = null
  }

  /**
   * Adds quantity of an item. Returns leftover (discarded).
   * Stackable items will fill existing stacks. Non-stackables occupy one slot per unit.
   * @param {string} id
   * @param {number} qty
   * @param {any} meta Optional meta for non-stackable items.
   */
  add(id, qty, meta = undefined) {
    let left = Math.max(0, Math.floor(qty))
    const def = ITEMS[id]
    if (!def) throw new Error(`Unknown item id: ${id}`)
    if (left === 0) return 0

    if (def.stackable) {
      // Fill existing stacks first.
      for (let i = 0; i < this.slots.length && left > 0; i++) {
        const s = this.slots[i]
        if (!s || s.id !== id) continue
        const space = this.maxStack - s.qty
        if (space <= 0) continue
        const take = Math.min(space, left)
        s.qty += take
        left -= take
      }

      // Create new stacks.
      for (let i = 0; i < this.slots.length && left > 0; i++) {
        if (this.slots[i]) continue
        const take = Math.min(this.maxStack, left)
        this.slots[i] = { id, qty: take }
        left -= take
      }

      return left
    }

    // Non-stackable: 1 per slot.
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue
      this.slots[i] = { id, qty: 1, meta: meta ? structuredClone(meta) : undefined }
      left -= 1
    }

    return left
  }

  /** @param {string} id @returns {number} */
  count(id) {
    let n = 0
    for (const s of this.slots) {
      if (!s || s.id !== id) continue
      n += s.qty
    }
    return n
  }

  /**
   * Removes quantity of an item (across stacks). Returns leftover (couldn't remove).
   * @param {string} id
   * @param {number} qty
   */
  remove(id, qty) {
    let left = Math.max(0, Math.floor(qty))
    if (left === 0) return 0

    // Remove from stacks/slots.
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i]
      if (!s || s.id !== id) continue

      const take = Math.min(s.qty, left)
      s.qty -= take
      left -= take

      if (s.qty <= 0) this.slots[i] = null
    }

    return left
  }

  /** Remove one instance (first match) of non-stackable/tool. */
  removeOne(id) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]
      if (!s || s.id !== id) continue
      this.slots[i] = null
      return true
    }
    return false
  }

  /** Get first meta instance (if any). */
  getFirstMeta(id) {
    for (const s of this.slots) {
      if (!s || s.id !== id) continue
      return s.meta
    }
    return null
  }

  /** Update first meta instance (if any). */
  setFirstMeta(id, patch) {
    for (const s of this.slots) {
      if (!s || s.id !== id) continue
      s.meta = { ...(s.meta || {}), ...(patch || {}) }
      return true
    }
    return false
  }

  /** @returns {{used:number, free:number}} */
  getUsage() {
    let used = 0
    for (const s of this.slots) if (s) used++
    return { used, free: this.slotCount - used }
  }
}
