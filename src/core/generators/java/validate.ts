/**
 * Java-specific checks that are worth making before an export rather than
 * after an install.
 *
 * Deliberately separate from the emitters: a generator that also validates ends
 * up either duplicating a check across three call sites or skipping it in the
 * one place it mattered. These run once, over the finished model.
 */

import type { EmitProblem } from '../emit'
import { str } from '../../kinds/shared'
import { resolveStation } from '../../recipes/stations'
import type { JavaContext } from './context'
import { mapVanillaIdentifier, splitId } from './ids'

export { BEDROCK_TO_JAVA_ITEMS, mapVanillaIdentifier } from './ids'

/**
 * Recipe problems that only show up on Java.
 *
 * The interesting one is the last: a furnace-family recipe whose result is one
 * of the project's own items is fine on both platforms, but a *cooking* recipe
 * made at a custom station is Bedrock-impossible and Java-impossible for
 * different reasons, and saying which is more useful than a generic warning.
 */
export function collectRecipeProblems(ctx: JavaContext): EmitProblem[] {
  const problems: EmitProblem[] = []

  for (const node of ctx.project.nodes.filter((n) => n.kind === 'recipe')) {
    const { station } = resolveStation(ctx.project, node.data)
    const references = [
      str(node.data, 'result'),
      str(node.data, 'input'),
      ...(Array.isArray(node.data.grid)
        ? (node.data.grid as unknown[]).filter((cell): cell is string => typeof cell === 'string')
        : []),
    ]

    for (const reference of references) {
      const trimmed = reference.trim()
      if (!trimmed) continue
      const { namespace } = splitId(trimmed)
      if (namespace !== 'minecraft') continue
      const mapped = mapVanillaIdentifier(trimmed)
      if (mapped !== trimmed) {
        problems.push({
          severity: 'warning',
          nodeId: node.id,
          message: `"${trimmed}" is a Bedrock identifier; Java calls it "${mapped}". The export rewrites it, but the recipe reads more clearly if you change it in the builder.`,
        })
      }
    }

    if (station.blockNodeId && ctx.loader === 'datapack') {
      problems.push({
        severity: 'warning',
        nodeId: node.id,
        message: `"${node.displayName}" is made at a custom station, which a Java data pack cannot have. Export a mod loader target to include it.`,
      })
    }
  }

  return problems
}
