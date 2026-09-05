/**
 * The companion, standing in the corner of the workspace.
 *
 * Three rules shaped this: she must never be in the way, she must never be
 * load-bearing, and she must be reachable without a mouse. So the dock is
 * pointer-transparent except for the figure herself, everything she says is
 * also said by a toast, and the whole thing can be moved, resized and
 * dismissed from the keyboard.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GripVertical, Minus, Plus, X } from 'lucide-react'

import { cn } from '../../app/ui/primitives'
import { useCompanion } from '../../state/companion'
import { useSettings } from '../../state/settings'
import { useUi } from '../../state/ui'
import { CompanionStage, type LookTarget } from './CompanionStage'
import { useCompanionReactions } from './useCompanionReactions'

/** Distance in pixels at which the pointer counts as fully off to one side. */
const LOOK_RADIUS = 460

export function CompanionDock() {
  useCompanionReactions()

  const {
    enabled,
    status,
    asset,
    bubble,
    mood,
    gesture,
    sway,
    framing,
    corner,
    size,
    offsetX,
    offsetY,
    setSize,
    nudge,
    setEnabled,
    clearBubble,
    restore,
    say,
  } = useCompanion()
  const reducedMotion = useSettings((state) => state.reducedMotion)
  const setSideView = useUi((state) => state.setSideView)

  const look = useRef<LookTarget>({ x: 0, y: 0 })
  const frame = useRef<HTMLDivElement | null>(null)
  const [hovered, setHovered] = useState(false)

  // Bring back whatever was imported last session, once.
  useEffect(() => {
    void restore()
  }, [restore])

  // Say hello the first time she is actually standing there.
  const greeted = useRef(false)
  useEffect(() => {
    if (status !== 'ready' || greeted.current) return
    greeted.current = true
    const timer = window.setTimeout(() => say('returning'), 900)
    return () => window.clearTimeout(timer)
  }, [status, say])

  useEffect(() => {
    if (!bubble) return
    const timer = window.setTimeout(() => clearBubble(bubble.id), Math.max(0, bubble.until - Date.now()))
    return () => window.clearTimeout(timer)
  }, [bubble, clearBubble])

  // Pointer tracking through a ref: this fires constantly and must not cause
  // a React render.
  useEffect(() => {
    if (!enabled || status !== 'ready') return
    const onMove = (event: PointerEvent) => {
      const box = frame.current?.getBoundingClientRect()
      if (!box) return
      const dx = event.clientX - (box.left + box.width / 2)
      const dy = event.clientY - (box.top + box.height * 0.32)
      look.current = {
        x: Math.max(-1, Math.min(1, dx / LOOK_RADIUS)),
        y: Math.max(-1, Math.min(1, -dy / LOOK_RADIUS)),
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [enabled, status])

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const handle = event.currentTarget
      handle.setPointerCapture(event.pointerId)
      let last = { x: event.clientX, y: event.clientY }

      const onMove = (move: PointerEvent) => {
        // The corner the dock is pinned to decides which way "away" is.
        const signX = corner === 'bottom-right' ? -1 : 1
        nudge((move.clientX - last.x) * signX, -(move.clientY - last.y))
        last = { x: move.clientX, y: move.clientY }
      }
      const stop = () => {
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', stop)
        handle.removeEventListener('pointercancel', stop)
      }
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', stop)
      handle.addEventListener('pointercancel', stop)
    },
    [corner, nudge],
  )

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 32 : 8
    const signX = corner === 'bottom-right' ? -1 : 1
    switch (event.key) {
      case 'ArrowLeft':
        nudge(step * signX * -1, 0)
        break
      case 'ArrowRight':
        nudge(step * signX, 0)
        break
      case 'ArrowUp':
        nudge(0, step)
        break
      case 'ArrowDown':
        nudge(0, -step)
        break
      case '+':
      case '=':
        setSize(size + 24)
        break
      case '-':
        setSize(size - 24)
        break
      default:
        return
    }
    event.preventDefault()
  }

  if (!enabled || status !== 'ready' || !asset) return null

  // A bust wants a squarer frame; a standing figure wants a tall thin one.
  const width = Math.round(size * (framing === 'bust' ? 1 : 0.78))

  return (
    <div
      // Bottom edge sits clear of the status bar; the rail is 48px wide, so
      // the left-hand corner starts beyond it.
      className={cn(
        'pointer-events-none fixed bottom-9 z-30 flex flex-col items-center gap-2',
        corner === 'bottom-right' ? 'right-4' : 'left-16',
        // Never let her cover a narrow screen: below `sm` the workspace needs
        // every pixel more than it needs company.
        'max-sm:hidden',
      )}
      style={{
        transform: `translate(${corner === 'bottom-right' ? -offsetX : offsetX}px, ${-offsetY}px)`,
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <AnimatePresence>
        {bubble ? (
          <motion.div
            key={bubble.id}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            // Announced politely: it is commentary, never the only copy of
            // anything, so it must not interrupt a screen reader mid-sentence.
            role="status"
            aria-live="polite"
            className={cn(
              'pointer-events-auto relative max-w-[16rem] rounded-xl border border-ink-600 bg-ink-850/95 px-3 py-2',
              'text-xs leading-relaxed text-ink-100 shadow-float backdrop-blur',
            )}
          >
            <span className="sr-only">Kohane says: </span>
            {bubble.text}
            {/* The tail, drawn as a rotated corner of the same panel. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute -bottom-1 size-2 rotate-45 border-b border-r border-ink-600 bg-ink-850',
                corner === 'bottom-right' ? 'right-6' : 'left-6',
              )}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div ref={frame} className="relative" style={{ width, height: size }}>
        <CompanionStage
          asset={asset}
          mood={mood}
          speaking={Boolean(bubble)}
          gesture={gesture}
          sway={sway}
          reducedMotion={reducedMotion}
          look={look}
          framing={framing === 'bust' ? 0 : 1}
        />

        {/*
          The whole figure is one button. Raycasting the mesh would be more
          precise and would cost more per frame than the render does.
        */}
        <button
          type="button"
          onClick={() => say('poked')}
          onKeyDown={onKeyDown}
          aria-label="Kohane, the workspace companion. Activate for a word; arrow keys move her, plus and minus resize."
          className={cn(
            'pointer-events-auto absolute inset-0 rounded-xl',
            'transition-shadow [transition-duration:var(--duration-state)]',
            'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent-500)]',
          )}
        />

        <AnimatePresence>
          {hovered ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-auto absolute -top-1 right-0 flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-850/95 p-0.5 shadow-float backdrop-blur"
            >
              <button
                type="button"
                onPointerDown={startDrag}
                aria-label="Move Kohane"
                title="Drag to move"
                className="grid size-6 cursor-grab place-items-center rounded text-ink-300 hover:bg-ink-700 hover:text-ink-50 active:cursor-grabbing"
              >
                <GripVertical size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setSize(size - 32)}
                aria-label="Smaller"
                className="grid size-6 place-items-center rounded text-ink-300 hover:bg-ink-700 hover:text-ink-50"
              >
                <Minus size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setSize(size + 32)}
                aria-label="Larger"
                className="grid size-6 place-items-center rounded text-ink-300 hover:bg-ink-700 hover:text-ink-50"
              >
                <Plus size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEnabled(false)
                  setSideView('companion')
                }}
                aria-label="Hide Kohane"
                title="Hide — the Companion panel brings her back"
                className="grid size-6 place-items-center rounded text-ink-300 hover:bg-ink-700 hover:text-ink-50"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
