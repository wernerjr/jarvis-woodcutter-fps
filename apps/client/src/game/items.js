export const ItemId = {
  LOG: 'log',
  STICK: 'stick',
  LEAF: 'leaf',
  COTTON_SEED: 'cotton_seed',
  FIBER: 'fiber',
  ROPE: 'rope',
  HOE_METAL: 'hoe_metal',
  STONE: 'stone',
  IRON_ORE: 'iron_ore',
  IRON_INGOT: 'iron_ingot',

  BACKPACK: 'backpack',

  AXE_STONE: 'axe_stone',
  AXE_METAL: 'axe_metal',
  PICKAXE_STONE: 'pickaxe_stone',
  PICKAXE_METAL: 'pickaxe_metal',
  TORCH: 'torch',
  CAMPFIRE: 'campfire',
  FORGE: 'forge',
  FORGE_TABLE: 'forge_table',
  CHEST: 'chest',
}

// (Keep ITEMS below in sync with ItemId)

export const ITEMS = {
  [ItemId.LOG]: { id: ItemId.LOG, name: 'Tronco', icon: '🪵', stackable: true },
  [ItemId.STICK]: { id: ItemId.STICK, name: 'Galho', icon: '🪵', stackable: true },
  [ItemId.LEAF]: { id: ItemId.LEAF, name: 'Folha', icon: '🍃', stackable: true },
  [ItemId.COTTON_SEED]: { id: ItemId.COTTON_SEED, name: 'Semente de Algodão', icon: '🌱', stackable: true },
  [ItemId.FIBER]: { id: ItemId.FIBER, name: 'Fibra', icon: '🧵', stackable: true },
  [ItemId.ROPE]: { id: ItemId.ROPE, name: 'Corda', icon: '🪢', stackable: true },
  [ItemId.HOE_METAL]: { id: ItemId.HOE_METAL, name: 'Enxada de Metal', icon: '⛏️🌾', stackable: false },
  [ItemId.STONE]: { id: ItemId.STONE, name: 'Pedra', icon: '🪨', stackable: true },
  [ItemId.IRON_ORE]: { id: ItemId.IRON_ORE, name: 'Minério de Ferro', icon: '🔩', stackable: true },
  [ItemId.IRON_INGOT]: { id: ItemId.IRON_INGOT, name: 'Barra de Ferro', icon: '🧱', stackable: true },

  [ItemId.BACKPACK]: { id: ItemId.BACKPACK, name: 'Mochila', icon: '🎒', stackable: false, equipSlot: 'backpack' },

  [ItemId.AXE_STONE]: { id: ItemId.AXE_STONE, name: 'Machado de Pedra', icon: '🪓🪨', stackable: false },
  [ItemId.AXE_METAL]: { id: ItemId.AXE_METAL, name: 'Machado de Metal', icon: '🪓⚙️', stackable: false },
  [ItemId.PICKAXE_STONE]: { id: ItemId.PICKAXE_STONE, name: 'Picareta de Pedra', icon: '⛏️🪨', stackable: false },
  [ItemId.PICKAXE_METAL]: { id: ItemId.PICKAXE_METAL, name: 'Picareta de Metal', icon: '⛏️⚙️', stackable: false },
  [ItemId.TORCH]: { id: ItemId.TORCH, name: 'Tocha', icon: '🔥', stackable: false },
  [ItemId.CAMPFIRE]: { id: ItemId.CAMPFIRE, name: 'Fogueira', icon: '🪵', stackable: false },
  [ItemId.FORGE]: { id: ItemId.FORGE, name: 'Forja (Fornalha)', icon: '⚒️', stackable: false },
  [ItemId.FORGE_TABLE]: { id: ItemId.FORGE_TABLE, name: 'Mesa de Forja', icon: '🧰', stackable: false },
  [ItemId.CHEST]: { id: ItemId.CHEST, name: 'Baú', icon: '🧰', stackable: false },
}
