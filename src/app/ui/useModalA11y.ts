/**
 * The keyboard contract every modal in the app owes its user.
 *
 * A dialog that only closes by clicking its X strands anyone on a keyboard, and
 * one that lets Tab wander into the page behind it leaves them typing into
 * controls they cannot see. This hook gives a plain `<div role="dialog">` the
 * three behaviours that make it usable: Escape closes, Tab cycles inside, and
 * focus goes back where it came from on the way out.
 *
 * Returns a ref to spread onto the dialog element.
 */

import { useEffect, useRef } from 'react'

/** Everything that can hold focus, minus anything deliberately taken out of the order. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useModalA11y<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Read during a commit that has already rendered, so it is true by the time
  // the newly mounted dialog moves focus into itself.
  const openRef = useRef(open)
  openRef.current = open

  // Where focus was before the dialog opened.
  //
  // Reading `document.activeElement` when the open effect fires is too late:
  // React commits the dialog and its `autoFocus` control first, so the
  // "previous" element would be the textarea that is about to unmount and focus
  // would end up on `<body>`. Focus is therefore tracked continuously, and
  // anything that happens once the dialog is open is ignored — `ref.current`
  // alone is not enough, because React attaches a parent's ref *after* running
  // a descendant's autoFocus.
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const remember = (event: FocusEvent) => {
      if (openRef.current) return
      const target = event.target as HTMLElement | null
      if (!target || ref.current?.contains(target)) return
      returnTo.current = target
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = ref.current
      if (!dialog) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        // offsetParent is null for anything display:none, so a hidden control
        // never becomes a dead stop in the cycle.
        (element) => element.offsetParent !== null || element === document.activeElement,
      )
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (!dialog.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // Capture phase, so the dialog answers Escape before any window-level
    // shortcut further down the page does.
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Only if the trigger is still on the page — it may have been the very
      // control the dialog's action removed.
      const previous = returnTo.current
      if (previous?.isConnected) previous.focus()
    }
  }, [open])

  return ref
}
