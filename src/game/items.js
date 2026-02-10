export const ItemId = {
  LOG: 'log',
  STICK: 'stick',
  LEAF: 'leaf',
  STONE: 'stone',

  AXE: 'axe',
  TORCH: 'torch',
  CAMPFIRE: 'campfire',
}

export const ITEMS = {
  [ItemId.LOG]: { id: ItemId.LOG, name: 'Tronco', icon: '🪵', stackable: true },
  [ItemId.STICK]: { id: ItemId.STICK, name: 'Galho', icon: '🪵', stackable: true },
  [ItemId.LEAF]: { id: ItemId.LEAF, name: 'Folha', icon: '🍃', stackable: true },
  [ItemId.STONE]: { id: ItemId.STONE, name: 'Pedra', icon: '🪨', stackable: true },

  [ItemId.AXE]: { id: ItemId.AXE, name: 'Machado', icon: '🪓', stackable: false },
  [ItemId.TORCH]: { id: ItemId.TORCH, name: 'Tocha', icon: '🔥', stackable: false },
  [ItemId.CAMPFIRE]: { id: ItemId.CAMPFIRE, name: 'Fogueira', icon: '🪵', stackable: false },
}
