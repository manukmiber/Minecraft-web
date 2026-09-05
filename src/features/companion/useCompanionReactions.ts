/**
 * Wiring the companion to the workspace.
 *
 * She reacts to the store rather than being called from each feature, which
 * matters for two reasons: nothing in the app has to know she exists, and
 * removing her means deleting one mount rather than unpicking calls from a
 * dozen call sites. Every reaction here is a comment on something the app has
 * already reported through a toast or the problems panel, so a muted companion
 * loses nothing but company.
 */

import { useEffect } from 'react'

import { useCompanion } from '../../state/companion'
import { useProject } from '../../state/project'

/** How long the workspace has to be untouched before she says so. */
const IDLE_AFTER_MS = 5 * 60 * 1000

function errorCount(problems: { severity: string }[]): number {
  return problems.filter((problem) => problem.severity === 'error').length
}

export function useCompanionReactions(): void {
  useEffect(() => {
    const unsubscribe = useProject.subscribe((state, previous) => {
      const { say } = useCompanion.getState()

      const nodes = state.project.nodes
      const before = previous.project.nodes
      if (nodes.length > before.length) {
        const added = nodes.find((node) => !before.some((old) => old.id === node.id))
        say('content-added', added?.displayName)
      } else if (nodes.length < before.length) {
        const removed = before.find((old) => !nodes.some((node) => node.id === old.id))
        say('content-deleted', removed?.displayName)
      }

      const errors = errorCount(state.problems)
      const errorsBefore = errorCount(previous.problems)
      if (errors > 0 && errorsBefore === 0) {
        say('problems-appeared', `${errors} ${errors === 1 ? 'error' : 'errors'}`)
      } else if (errors === 0 && errorsBefore > 0) {
        say('problems-cleared')
      }

      if (state.busy && state.busy !== previous.busy) {
        say('busy', state.busy.replace(/…$/, ''))
      }

      // Toasts are the app's own record of anything that finished, so reading
      // them keeps her commentary and the notification in step by definition.
      for (const toast of state.toasts) {
        if (previous.toasts.some((old) => old.id === toast.id)) continue
        if (toast.tone === 'error') say('failed', toast.detail ?? toast.title)
        else if (/^Saved/.test(toast.title)) say('saved')
        else if (/^Released/.test(toast.title)) say('released', toast.title.replace(/^Released\s*/, ''))
        else if (/^Exported/.test(toast.title)) say('exported', toast.title.replace(/^Exported\s*/, ''))
        else if (/^Applied/.test(toast.title)) say('preset-applied', toast.detail)
      }
    })

    return unsubscribe
  }, [])

  // Idle chatter, and only at the chattiest setting — see `dialogue.ts`.
  useEffect(() => {
    let timer = window.setTimeout(function tick() {
      const companion = useCompanion.getState()
      if (companion.asset && !companion.bubble) companion.say('idle')
      timer = window.setTimeout(tick, IDLE_AFTER_MS)
    }, IDLE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])
}
