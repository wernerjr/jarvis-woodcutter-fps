import { ItemId } from './items.js'

export const RecipeId = {
  TORCH: 'torch',
  AXE: 'axe',
  CAMPFIRE: 'campfire',
  PICKAXE: 'pickaxe',
  FORGE: 'forge',
}

export const DURABILITY = {
  AXE_MAX: 60,
  PICKAXE_MAX: 80,
  TORCH_MAX: 180, // seconds
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
    id: RecipeId.AXE,
    name: 'Machado',
    output: { id: ItemId.AXE, qty: 1, meta: { dur: DURABILITY.AXE_MAX, maxDur: DURABILITY.AXE_MAX } },
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
    id: RecipeId.PICKAXE,
    name: 'Picareta',
    output: { id: ItemId.PICKAXE, qty: 1, meta: { dur: DURABILITY.PICKAXE_MAX, maxDur: DURABILITY.PICKAXE_MAX } },
    cost: [
      { id: ItemId.STICK, qty: 4 },
      { id: ItemId.STONE, qty: 6 },
    ],
  },
  {
    id: RecipeId.FORGE,
    name: 'Forja',
    output: { id: ItemId.FORGE, qty: 1 },
    // pedras + troncos: base pesada com alimentação a lenha
    cost: [
      { id: ItemId.STONE, qty: 14 },
      { id: ItemId.LOG, qty: 3 },
    ],
  },
]
