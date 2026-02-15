import { ItemId } from './items.js'

export const RecipeId = {
  TORCH: 'torch',
  AXE_STONE: 'axe_stone',
  CAMPFIRE: 'campfire',
  PICKAXE_STONE: 'pickaxe_stone',
  FORGE: 'forge',
  FORGE_TABLE: 'forge_table',
  CHEST: 'chest',
}

export const DURABILITY = {
  AXE_STONE_MAX: 100,
  AXE_METAL_MAX: 280,
  PICKAXE_STONE_MAX: 120,
  PICKAXE_METAL_MAX: 300,
  TORCH_MAX: 180, // seconds
}

export const TOOL_STATS = {
  axe_stone: { dmg: 12, maxDur: DURABILITY.AXE_STONE_MAX },
  axe_metal: { dmg: 18, maxDur: DURABILITY.AXE_METAL_MAX },
  pickaxe_stone: { dmg: 10, maxDur: DURABILITY.PICKAXE_STONE_MAX },
  pickaxe_metal: { dmg: 15, maxDur: DURABILITY.PICKAXE_METAL_MAX },
}

export const RECIPES = [
  {
    id: RecipeId.TORCH,
    name: 'Tocha',
    output: { id: ItemId.TORCH, qty: 1, meta: { dur: DURABILITY.TORCH_MAX, maxDur: DURABILITY.TORCH_MAX } },
    cost: [
      { id: ItemId.STICK, qty: 4 },
      { id: ItemId.LEAF, qty: 8 },
    ],
  },
  {
    id: RecipeId.AXE_STONE,
    name: 'Machado de Pedra',
    output: {
      id: ItemId.AXE_STONE,
      qty: 1,
      meta: { tool: 'axe', tier: 'stone', dmg: TOOL_STATS.axe_stone.dmg, dur: TOOL_STATS.axe_stone.maxDur, maxDur: TOOL_STATS.axe_stone.maxDur },
    },
    cost: [
      { id: ItemId.STICK, qty: 6 },
      { id: ItemId.STONE, qty: 3 },
    ],
  },
  {
    id: RecipeId.CAMPFIRE,
    name: 'Fogueira',
    output: { id: ItemId.CAMPFIRE, qty: 1 },
    cost: [
      { id: ItemId.STICK, qty: 8 },
      { id: ItemId.LEAF, qty: 12 },
    ],
  },
  {
    id: RecipeId.PICKAXE_STONE,
    name: 'Picareta de Pedra',
    output: {
      id: ItemId.PICKAXE_STONE,
      qty: 1,
      meta: {
        tool: 'pickaxe',
        tier: 'stone',
        dmg: TOOL_STATS.pickaxe_stone.dmg,
        dur: TOOL_STATS.pickaxe_stone.maxDur,
        maxDur: TOOL_STATS.pickaxe_stone.maxDur,
      },
    },
    cost: [
      { id: ItemId.STICK, qty: 4 },
      { id: ItemId.STONE, qty: 6 },
    ],
  },
  {
    id: RecipeId.FORGE,
    name: 'Forja (Fornalha)',
    output: { id: ItemId.FORGE, qty: 1 },
    // pedras + troncos: base pesada com alimentação a lenha
    cost: [
      { id: ItemId.STONE, qty: 14 },
      { id: ItemId.LOG, qty: 3 },
    ],
  },
  {
    id: RecipeId.FORGE_TABLE,
    name: 'Mesa de Forja',
    output: { id: ItemId.FORGE_TABLE, qty: 1 },
    cost: [
      { id: ItemId.STONE, qty: 10 },
      { id: ItemId.LOG, qty: 4 },
      { id: ItemId.IRON_INGOT, qty: 4 },
    ],
  },
  {
    id: RecipeId.CHEST,
    name: 'Baú',
    output: { id: ItemId.CHEST, qty: 1 },
    cost: [
      { id: ItemId.LOG, qty: 2 },
      { id: ItemId.STICK, qty: 8 },
      { id: ItemId.STONE, qty: 4 },
    ],
  },
]

export const FORGE_TABLE_RECIPES = [
  {
    id: 'axe_metal',
    name: 'Machado de Metal',
    output: {
      id: ItemId.AXE_METAL,
      qty: 1,
      meta: { tool: 'axe', tier: 'metal', dmg: TOOL_STATS.axe_metal.dmg, dur: TOOL_STATS.axe_metal.maxDur, maxDur: TOOL_STATS.axe_metal.maxDur },
    },
    cost: [
      { id: ItemId.IRON_INGOT, qty: 3 },
      { id: ItemId.STICK, qty: 4 },
    ],
  },
  {
    id: 'pickaxe_metal',
    name: 'Picareta de Metal',
    output: {
      id: ItemId.PICKAXE_METAL,
      qty: 1,
      meta: {
        tool: 'pickaxe',
        tier: 'metal',
        dmg: TOOL_STATS.pickaxe_metal.dmg,
        dur: TOOL_STATS.pickaxe_metal.maxDur,
        maxDur: TOOL_STATS.pickaxe_metal.maxDur,
      },
    },
    cost: [
      { id: ItemId.IRON_INGOT, qty: 4 },
      { id: ItemId.STICK, qty: 4 },
    ],
  },
]

