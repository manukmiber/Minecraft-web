/**
 * Kohane, the companion.
 *
 * A worked example of everything the entity kind grew for this batch: the
 * detailed `companion` body, the tamed component group, the sitting pose, the
 * eight-face expression system, a hand-painted spawn egg, and — the part that
 * makes it more than a settings dump — artwork the preset carries with it, so
 * applying it gives you a character rather than an untextured mannequin.
 *
 * Everything below is an ordinary field on an ordinary kind. There is no
 * Kohane-shaped code path anywhere in the engine: swap the body preset and the
 * PNG and the same preset file describes somebody else entirely.
 */

import { COMPANION_TEXTURES } from '../../core/data/companionTextures'
import { PRESET_FORMAT } from '../../core/presets/format'
import type { PresetAsset, PresetFile } from '../../core/presets/format'

const ENTITY = 'entity:kohane'

/** The generated artwork, bound to the entity's texture slots. */
const artwork: PresetAsset[] = COMPANION_TEXTURES.map((texture) => ({
  node: ENTITY,
  slot: texture.slot,
  fileName: texture.fileName,
  url: texture.path,
  width: texture.width,
  height: texture.height,
}))

const kohane: PresetFile = {
  presetFormat: PRESET_FORMAT,
  id: 'companion.kohane',
  label: 'Kohane, the companion',
  description:
    'A tameable companion who follows you, sits when told, fights alongside you and reacts with eight facial expressions. Arrives with her skin and a painted spawn egg.',
  notes: [
    'Offer her a cookie to tame her; after that, interacting toggles sitting.',
    'The face reacts on its own — a blink, a wince when she is hurt, a grin while she walks, and a doze when she sits. It runs in the render controller, so it costs the server nothing.',
    'Feeding her cake heals her.',
    'Her skin is a 512px sheet over a 128-unit body, which is four times vanilla resolution. Open it in the Textures tab to repaint her.',
  ],
  nodes: [
    {
      kind: 'entity',
      name: 'kohane',
      displayName: 'Kohane',
      notes:
        'Companion. Tamed with a cookie, follows her owner, sits on interact, and defends whoever tamed her.',
      data: {
        families: ['companion', 'friendly'],
        isSummonable: true,
        hasSpawnEgg: true,
        // Only used if the painted egg icon is ever removed from the slot.
        eggBaseColor: '#e7d7b0',
        eggOverlayColor: '#e8306e',

        bodyPreset: 'companion',
        scale: 1,
        // Sturdier than a villager, well short of a player: she is meant to
        // come along, not to solo a raid.
        health: 24,
        movementSpeed: 0.3,
        collisionWidth: 0.6,
        collisionHeight: 1.9,

        temperament: 'companion',
        tameItems: ['minecraft:cookie', 'minecraft:cake'],
        followDistance: 9,
        canSit: true,
        defendsOwner: true,
        canBeLeashed: true,
        healItems: ['minecraft:cake', 'minecraft:pumpkin_pie'],
        healAmount: 6,
        attackDamage: 3,
        expressive: true,

        canFly: false,
        despawns: false,
        // She is a companion, not wildlife: no natural spawning, so the only
        // way to get one is the egg or a friend.
        spawnEnabled: false,
      },
    },
  ],
  assets: artwork,
}

export const COMPANION_PRESETS: PresetFile[] = [kohane]
