import { ITEMS } from '../game/items.js';

/**
 * Minimal save payload (player only).
 * Keep it JSON-serializable and versioned.
 */
export function exportGameSave(game) {
  return {
    v: 1,
    score: game.score ?? 0,
    player: {
      position: {
        x: game.player?.position?.x ?? 0,
        y: game.player?.position?.y ?? 0,
        z: game.player?.position?.z ?? 0,
      },
    },
    inventory: {
      slots: (game.inventory?.slots || []).map((s) => (s ? { id: s.id, qty: s.qty, meta: s.meta ?? null } : null)),
    },
    hotbar: (game.hotbar || []).map((s) => (s ? { id: s.id, qty: s.qty, meta: s.meta ?? null } : null)),
  };
}

export function isValidSave(save) {
  return save && typeof save === 'object' && save.v === 1;
}

export function applyGameSave(game, save) {
  if (!isValidSave(save)) return false;

  // score
  game.score = Number(save.score ?? 0);
  game.ui?.setScore?.(game.score);

  // inventory
  const slots = Array.isArray(save.inventory?.slots) ? save.inventory.slots : [];
  game.inventory.clear();
  for (let i = 0; i < game.inventory.slots.length; i++) {
    const s = slots[i];
    if (!s) continue;
    if (!ITEMS[s.id]) continue;
    game.inventory.slots[i] = { id: s.id, qty: Number(s.qty ?? 0), meta: s.meta ?? undefined };
  }

  // hotbar
  const hb = Array.isArray(save.hotbar) ? save.hotbar : [];
  game.hotbar = Array.from({ length: 10 }, (_, i) => (i === 0 ? { id: 'hand', qty: 1 } : null));
  for (let i = 1; i < Math.min(10, hb.length); i++) {
    const s = hb[i];
    if (!s) continue;
    if (!ITEMS[s.id] && s.id !== 'hand') continue;
    game.hotbar[i] = { id: s.id, qty: Number(s.qty ?? 0), meta: s.meta ?? undefined };
  }

  // player position (best effort)
  const p = save.player?.position;
  if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') {
    game.player.position.set(p.x, p.y, p.z);
    game.player.velocity?.set?.(0, 0, 0);
  }

  return true;
}
