export const ItemId = {
  LOG: 'log',
  STICK: 'stick',
  LEAF: 'leaf',
  STONE: 'stone',
  IRON_ORE: 'iron_ore',
  IRON_INGOT: 'iron_ingot',

  AXE: 'axe',
  PICKAXE: 'pickaxe',
  TORCH: 'torch',
  CAMPFIRE: 'campfire',
  FORGE: 'forge',
}

export const ITEMS = {
  [ItemId.LOG]: { id: ItemId.LOG, name: 'Tronco', icon: '🪵', stackable: true },
  [ItemId.STICK]: { id: ItemId.STICK, name: 'Galho', icon: '🪵', stackable: true },
  [ItemId.LEAF]: { id: ItemId.LEAF, name: 'Folha', icon: '🍃', stackable: true },
  [ItemId.STONE]: { id: ItemId.STONE, name: 'Pedra', icon: '🪨', stackable: true },
  [ItemId.IRON_ORE]: { id: ItemId.IRON_ORE, name: 'Minério de Ferro', icon: '🔩', stackable: true },
  [ItemId.IRON_INGOT]: { id: ItemId.IRON_INGOT, name: 'Barra de Ferro', icon: '🧱', stackable: true },

  [ItemId.AXE]: { id: ItemId.AXE, name: 'Machado', icon: '🪓', stackable: false },
  [ItemId.PICKAXE]: { id: ItemId.PICKAXE, name: 'Picareta', icon: '⛏️', stackable: false },
  [ItemId.TORCH]: { id: ItemId.TORCH, name: 'Tocha', icon: '🔥', stackable: false },
  [ItemId.CAMPFIRE]: { id: ItemId.CAMPFIRE, name: 'Fogueira', icon: '🪵', stackable: false },
  [ItemId.FORGE]: { id: ItemId.FORGE, name: 'Forja', icon: '⚒️', stackable: false },
}
