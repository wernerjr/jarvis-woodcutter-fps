import { ITEMS } from '../game/items.js'

/**
 * Minimal save payload (player only).
 * Keep it JSON-serializable and versioned.
 */
export function exportGameSave(game) {
  return {
    v: 3,
    score: game.score ?? 0,
    player: {
      inMine: !!game._inMine,
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
    equipment: {
      hat: game.equipment?.hat ? { id: game.equipment.hat.id, qty: game.equipment.hat.qty ?? 1, meta: game.equipment.hat.meta ?? null } : null,
      shirt: game.equipment?.shirt ? { id: game.equipment.shirt.id, qty: game.equipment.shirt.qty ?? 1, meta: game.equipment.shirt.meta ?? null } : null,
      pants: game.equipment?.pants ? { id: game.equipment.pants.id, qty: game.equipment.pants.qty ?? 1, meta: game.equipment.pants.meta ?? null } : null,
      boots: game.equipment?.boots ? { id: game.equipment.boots.id, qty: game.equipment.boots.qty ?? 1, meta: game.equipment.boots.meta ?? null } : null,
      gloves: game.equipment?.gloves ? { id: game.equipment.gloves.id, qty: game.equipment.gloves.qty ?? 1, meta: game.equipment.gloves.meta ?? null } : null,
      backpack: game.equipment?.backpack ? { id: game.equipment.backpack.id, qty: game.equipment.backpack.qty ?? 1, meta: game.equipment.backpack.meta ?? null } : null,
    },
    buffs: {
      luckUntilMs: Number(game.buffs?.luckUntilMs ?? 0) || 0,
    },
  };

}

export function isValidSave(save) {
  return save && typeof save === 'object' && (save.v === 1 || save.v === 2 || save.v === 3)
}

export function applyGameSave(game, save) {
  if (!isValidSave(save)) return false

  // score
  game.score = Number(save.score ?? 0)
  game.ui?.setScore?.(game.score)

  // equipment + buffs (v3)
  const eq = save.v >= 3 && save.equipment && typeof save.equipment === 'object' ? save.equipment : null;
  if (!game.equipment) {
    game.equipment = { hat: null, shirt: null, pants: null, boots: null, gloves: null, backpack: null };
  }
  const setEq = (k) => {
    const s = eq?.[k];
    if (!s) return (game.equipment[k] = null);
    if (!ITEMS[s.id]) return (game.equipment[k] = null);
    game.equipment[k] = { id: s.id, qty: Number(s.qty ?? 1) || 1, meta: s.meta ?? undefined };
  };
  setEq('hat');
  setEq('shirt');
  setEq('pants');
  setEq('boots');
  setEq('gloves');
  setEq('backpack');

  // Important: restore inventory capacity BEFORE filling slots,
  // so backpack slots (21-30) from save are not lost on load.
  game._recomputeInventoryCapacity?.();

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

  if (!game.buffs) game.buffs = { luckUntilMs: 0 };
  const buffs = save.v >= 3 && save.buffs && typeof save.buffs === 'object' ? save.buffs : null;
  game.buffs.luckUntilMs = Number(buffs?.luckUntilMs ?? 0) || 0;

  // player position (best effort)
  const p = save.player?.position;
  if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') {
    game.player.position.set(p.x, p.y, p.z);
    game.player.velocity?.set?.(0, 0, 0);
  }

  // mine visibility: v2 has explicit flag; v1 we infer by proximity.
  let inMine = false;
  if (save.v === 2 && typeof save.player?.inMine === 'boolean') {
    inMine = save.player.inMine;
  } else if (p && game.mine?.mineOrigin && game.mine?.entrance) {
    const dxMine = p.x - game.mine.mineOrigin.x;
    const dzMine = p.z - game.mine.mineOrigin.z;
    const d2Mine = dxMine * dxMine + dzMine * dzMine;

    const dxWorld = p.x - game.mine.entrance.x;
    const dzWorld = p.z - game.mine.entrance.z;
    const d2World = dxWorld * dxWorld + dzWorld * dzWorld;

    // Mine interior lives far away; proximity to mineOrigin is a strong signal.
    inMine = d2Mine < d2World;
  }

  game._inMine = inMine;
  if (inMine) {
    game.world?.setGroundVisible?.(false);
    game.mine?.setInteriorVisible?.(true);
    game.ores?.setVisible?.(true);
  } else {
    game.world?.setGroundVisible?.(true);
    game.mine?.setInteriorVisible?.(false);
    game.ores?.setVisible?.(false);
  }

  return true;
}
