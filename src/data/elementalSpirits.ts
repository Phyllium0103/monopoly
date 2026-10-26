import { assetUrl } from './assetUrl';
import type { Element } from '../game/types';

// Generated from the reviewed 08 sprites by scripts/import-elemental-spirits.mjs.
export const SPIRIT_ICON_SIZE = 80;
export const SPIRIT_IDLE_INTERVAL_MS = 30_000;
export interface SpiritAnimationAsset { letter: string; url: string; columns: number; rows: number; frames: number; durationsMs: readonly number[]; }
export interface SpiritArt { idle: string; center: { x: number; y: number }; foot: { x: number; y: number }; actions: readonly SpiritAnimationAsset[]; }
const sources = {
  "metal": {
    "idle": "art/spirits/metal-idle.webp",
    "center": {
      "x": 0.5,
      "y": 0.64375
    },
    "actions": [
      {
        "letter": "A",
        "url": "art/spirits/metal-A.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          220,
          90,
          95,
          75,
          70,
          75,
          75,
          130,
          75,
          75,
          70,
          80,
          100,
          95,
          100,
          140
        ]
      },
      {
        "letter": "B",
        "url": "art/spirits/metal-B.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          220,
          100,
          100,
          100,
          110,
          110,
          100,
          120,
          100,
          100,
          100,
          110,
          100,
          100,
          100,
          160
        ]
      },
      {
        "letter": "C",
        "url": "art/spirits/metal-C.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110
        ]
      },
      {
        "letter": "D",
        "url": "art/spirits/metal-D.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110,
          110
        ]
      }
    ],
    "foot": {
      "x": 0.5,
      "y": 0.84375
    }
  },
  "wood": {
    "idle": "art/spirits/wood-idle.webp",
    "center": {
      "x": 0.503125,
      "y": 0.6
    },
    "actions": [
      {
        "letter": "A",
        "url": "art/spirits/wood-A.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          220,
          90,
          95,
          75,
          70,
          75,
          75,
          130,
          75,
          75,
          70,
          80,
          100,
          95,
          100,
          140
        ]
      },
      {
        "letter": "B",
        "url": "art/spirits/wood-B.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          220,
          100,
          100,
          100,
          110,
          110,
          100,
          120,
          100,
          100,
          100,
          110,
          100,
          100,
          100,
          160
        ]
      },
      {
        "letter": "C",
        "url": "art/spirits/wood-C.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          180,
          100,
          100,
          100,
          100,
          110,
          120,
          150,
          150,
          110,
          100,
          100,
          100,
          100,
          100,
          130
        ]
      },
      {
        "letter": "D",
        "url": "art/spirits/wood-D.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          180,
          100,
          100,
          100,
          100,
          110,
          120,
          150,
          150,
          110,
          100,
          100,
          100,
          100,
          100,
          130
        ]
      }
    ],
    "foot": {
      "x": 0.503125,
      "y": 0.84375
    }
  },
  "water": {
    "idle": "art/spirits/water-idle.webp",
    "center": {
      "x": 0.503125,
      "y": 0.596875
    },
    "actions": [
      {
        "letter": "A",
        "url": "art/spirits/water-A.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          220,
          90,
          95,
          75,
          70,
          75,
          75,
          130,
          75,
          75,
          70,
          80,
          100,
          95,
          100,
          140
        ]
      },
      {
        "letter": "B",
        "url": "art/spirits/water-B.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          220,
          100,
          100,
          100,
          110,
          110,
          100,
          120,
          100,
          100,
          100,
          110,
          100,
          100,
          100,
          160
        ]
      },
      {
        "letter": "C",
        "url": "art/spirits/water-C.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          180,
          100,
          100,
          100,
          100,
          110,
          120,
          150,
          150,
          110,
          100,
          100,
          100,
          100,
          100,
          130
        ]
      },
      {
        "letter": "D",
        "url": "art/spirits/water-D.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          180,
          100,
          100,
          100,
          100,
          110,
          120,
          150,
          150,
          110,
          100,
          100,
          100,
          100,
          100,
          130
        ]
      }
    ],
    "foot": {
      "x": 0.503125,
      "y": 0.84375
    }
  },
  "fire": {
    "idle": "art/spirits/fire-idle.webp",
    "center": {
      "x": 0.503125,
      "y": 0.590625
    },
    "actions": [
      {
        "letter": "A",
        "url": "art/spirits/fire-A.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          220,
          90,
          95,
          75,
          70,
          75,
          75,
          130,
          75,
          75,
          70,
          80,
          100,
          95,
          100,
          140
        ]
      },
      {
        "letter": "B",
        "url": "art/spirits/fire-B.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          220,
          100,
          100,
          100,
          110,
          110,
          100,
          120,
          100,
          100,
          100,
          110,
          100,
          100,
          100,
          160
        ]
      },
      {
        "letter": "C",
        "url": "art/spirits/fire-C.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          180,
          100,
          100,
          100,
          100,
          110,
          120,
          150,
          150,
          110,
          100,
          100,
          100,
          100,
          100,
          130
        ]
      },
      {
        "letter": "D",
        "url": "art/spirits/fire-D.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          180,
          100,
          100,
          100,
          100,
          110,
          120,
          150,
          150,
          110,
          100,
          100,
          100,
          100,
          100,
          130
        ]
      }
    ],
    "foot": {
      "x": 0.503125,
      "y": 0.84375
    }
  },
  "earth": {
    "idle": "art/spirits/earth-idle.webp",
    "center": {
      "x": 0.5,
      "y": 0.603125
    },
    "actions": [
      {
        "letter": "A",
        "url": "art/spirits/earth-A.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          220,
          90,
          95,
          75,
          70,
          75,
          75,
          130,
          75,
          75,
          70,
          80,
          100,
          95,
          100,
          140
        ]
      },
      {
        "letter": "B",
        "url": "art/spirits/earth-B.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          220,
          100,
          100,
          100,
          110,
          110,
          100,
          120,
          100,
          100,
          100,
          110,
          100,
          100,
          100,
          160
        ]
      },
      {
        "letter": "C",
        "url": "art/spirits/earth-C.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          180,
          100,
          100,
          100,
          100,
          110,
          120,
          150,
          150,
          110,
          100,
          100,
          100,
          100,
          100,
          130
        ]
      },
      {
        "letter": "D",
        "url": "art/spirits/earth-D.webp",
        "columns": 4,
        "rows": 4,
        "frames": 16,
        "durationsMs": [
          180,
          100,
          100,
          100,
          100,
          110,
          120,
          150,
          150,
          110,
          100,
          100,
          100,
          100,
          100,
          130
        ]
      }
    ],
    "foot": {
      "x": 0.5,
      "y": 0.84375
    }
  }
};
const resolveArt = (art: SpiritArt): SpiritArt => ({ ...art, idle: assetUrl(art.idle), actions: art.actions.map(action => ({ ...action, url: assetUrl(action.url) })) });
export const ELEMENTAL_SPIRIT_ART: Record<Element, SpiritArt> = {
  metal: resolveArt(sources.metal), wood: resolveArt(sources.wood), water: resolveArt(sources.water),
  fire: resolveArt(sources.fire), earth: resolveArt(sources.earth),
};
