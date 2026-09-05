import { describe, expect, it } from 'vitest'

import { buildVariantSelector, buildVariantSelectors } from './expressions'
import { COMPANION, FACE_EXPRESSIONS } from './bodies/companion'
import { getBodyPreset } from './geometry'
import type { BoneSpec } from './geometry'

const bone = (name: string, variant: string): BoneSpec => ({
  name,
  pivot: [0, 0, 0],
  cubes: [],
  variant: { group: 'face', name: variant },
})

describe('variant selectors', () => {
  it('writes one visibility predicate per bone, indexed in declaration order', () => {
    const selector = buildVariantSelectors(COMPANION, 'kohane')[0]

    expect(selector.order).toEqual([...FACE_EXPRESSIONS])
    FACE_EXPRESSIONS.forEach((expression, index) => {
      expect(selector.visibility[`face_${expression}`]).toBe(`v.kohane_face == ${index}`)
    })
  })

  it('assigns the variable in one pre-animation statement', () => {
    const selector = buildVariantSelectors(COMPANION, 'kohane')[0]
    expect(selector.statement.startsWith('v.kohane_face = ')).toBe(true)
    expect(selector.statement.endsWith(';')).toBe(true)
    // Balanced parentheses: an unclosed one is silently ignored by Molang and
    // shows up in game as a face that never changes.
    const opens = [...selector.statement].filter((c) => c === '(').length
    const closes = [...selector.statement].filter((c) => c === ')').length
    expect(opens).toBe(closes)
  })

  it('ranks pain above everything else and falls back to the first variant', () => {
    const selector = buildVariantSelectors(COMPANION, 'kohane')[0]
    const hurt = FACE_EXPRESSIONS.indexOf('hurt')
    // The outermost clause is the highest-priority rule.
    expect(selector.statement).toContain(`(q.hurt_time > 0) ? ${hurt} :`)
    // ...and the innermost fallback is variant 0.
    expect(selector.statement).toContain('? 2 : 0)')
  })

  it('skips rules for variants the body does not have', () => {
    const selector = buildVariantSelector(
      'face',
      [bone('face_a', 'neutral'), bone('face_b', 'blink')],
      'thing',
    )!
    expect(selector.statement).toContain('math.mod(q.life_time, 4.6)')
    // No sitting face was declared, so no clause mentions sitting.
    expect(selector.statement).not.toContain('q.is_sitting')
  })

  it('is nothing at all for a body with a single variant, or none', () => {
    expect(buildVariantSelector('face', [bone('only', 'neutral')], 'thing')).toBeNull()
    expect(buildVariantSelectors(getBodyPreset('biped'), 'farmer')).toEqual([])
  })
})
