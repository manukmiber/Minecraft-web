/**
 * Facial expressions, without a line of script.
 *
 * A body can declare several bones in one *variant group* — eight face planes
 * stacked in the same place, say. Exactly one of them is drawn at a time, and
 * which one is decided by a Molang expression the client evaluates every frame.
 *
 * The mechanism is two Bedrock features working together:
 *
 * - `scripts.pre_animation` on the client entity runs Molang each frame *before*
 *   animations, and is the only place a variable can be recomputed per frame
 *   without a behaviour script. It writes `v.<group>_variant`.
 * - `part_visibility` on the render controller hides every bone whose index does
 *   not match.
 *
 * The upshot is that the mob blinks, winces when it takes a hit, beams while it
 * follows you and dozes when it sits down, with no server-side work at all —
 * which matters, because the cheapest expression system is the one that costs
 * the world nothing per tick.
 */

import type { BoneSpec, GeometrySpec } from './geometry'
import { variantGroups } from './geometry'

export interface VariantSelector {
  /** Molang variable the render controller reads. */
  variable: string
  /** One statement for `scripts.pre_animation`. */
  statement: string
  /** `bone name -> Molang predicate`, ready for `part_visibility`. */
  visibility: Record<string, string>
  /** Variant names in index order, for the preview and for documentation. */
  order: string[]
}

/**
 * How a face is chosen, in priority order.
 *
 * Read as a list of "when this is true, wear that". The first match wins, so
 * pain beats sleepiness beats a blink beats whatever the mob is doing.
 * `query.hurt_time` is non-zero for the few ticks after damage; the two
 * `math.mod` clauses are timers — a blink roughly every four and a half seconds,
 * and a moment of quiet pleasure now and then while idle.
 */
const FACE_RULES: Array<{ when: string; variant: string; why: string }> = [
  { when: 'q.hurt_time > 0', variant: 'hurt', why: 'just took damage' },
  { when: 'q.is_sitting', variant: 'sleepy', why: 'sitting down' },
  { when: '!q.is_on_ground', variant: 'surprised', why: 'in the air' },
  { when: 'math.mod(q.life_time, 4.6) < 0.16', variant: 'blink', why: 'blink timer' },
  { when: 'q.modified_move_speed > 0.86', variant: 'sing', why: 'running' },
  { when: 'q.modified_move_speed > 0.08', variant: 'happy', why: 'walking' },
  { when: 'math.mod(q.life_time, 13) < 2.2', variant: 'smile', why: 'idle, every so often' },
]

/**
 * Builds the selector for one variant group.
 *
 * Variants the body does not declare are skipped rather than emitted as dead
 * clauses, so a body with three faces gets a three-clause expression.
 */
export function buildVariantSelector(
  group: string,
  bones: BoneSpec[],
  namePrefix: string,
): VariantSelector | null {
  if (bones.length < 2) return null

  const order = bones.map((bone) => bone.variant!.name)
  const indexOf = new Map(order.map((name, index) => [name, index]))
  const variable = `v.${namePrefix}_${group}`

  // Nested ternaries, innermost first: the fallback is variant 0.
  let expression = '0'
  for (const rule of [...FACE_RULES].reverse()) {
    const index = indexOf.get(rule.variant)
    if (index === undefined) continue
    // Parenthesised rather than relying on Molang's associativity: the whole
    // chain ends up in one JSON string, and a reader should not have to know
    // the precedence rules to check it.
    expression = expression === '0' ? `(${rule.when}) ? ${index} : 0` : `(${rule.when}) ? ${index} : (${expression})`
  }

  const visibility: Record<string, string> = {}
  bones.forEach((bone, index) => {
    visibility[bone.name] = `${variable} == ${index}`
  })

  return {
    variable,
    statement: `${variable} = ${expression};`,
    visibility,
    order,
  }
}

/** Every variant group a body declares, in bone order. */
export function buildVariantSelectors(spec: GeometrySpec, namePrefix: string): VariantSelector[] {
  return [...variantGroups(spec).entries()]
    .map(([group, bones]) => buildVariantSelector(group, bones, namePrefix))
    .filter((selector): selector is VariantSelector => selector !== null)
}

/** The rules, as prose — used by the docs and the inspector's help text. */
export function describeFaceRules(): Array<{ variant: string; why: string }> {
  return FACE_RULES.map(({ variant, why }) => ({ variant, why }))
}
