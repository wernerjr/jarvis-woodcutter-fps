import { ItemId } from './items.js'

export const RecipeId = {
  TORCH: 'torch',
  AXE: 'axe',
  CAMPFIRE: 'campfire',
}

export const DURABILITY = {
  AXE_MAX: 60,
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
]
