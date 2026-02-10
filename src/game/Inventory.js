import { ITEMS } from './items.js'

export class Inventory {
  /** @param {{slots?: number, maxStack?: number}} opts */
  constructor({ slots = 20, maxStack = 100 } = {}) {
    this.slotCount = slots
    this.maxStack = maxStack
    /** @type {(null | {id: string, qty: number})[]} */
    this.slots = Array.from({ length: slots }, () => null)
  }

  clear() {
    this.slots = Array.from({ length: this.slotCount }, () => null)
  }

  /**
   * Adds quantity of an item. Returns leftover (discarded).
   * @param {string} id
   * @param {number} qty
   */
  add(id, qty) {
    let left = Math.max(0, Math.floor(qty))
    if (!ITEMS[id]) throw new Error(`Unknown item id: ${id}`)
    if (left === 0) return 0

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

  /** @returns {{used:number, free:number}} */
  getUsage() {
    let used = 0
    for (const s of this.slots) if (s) used++
    return { used, free: this.slotCount - used }
  }
}
