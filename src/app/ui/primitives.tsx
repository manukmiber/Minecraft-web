/**
 * Shared interface primitives.
 *
 * Small, unopinionated pieces that every panel builds from, so spacing, focus
 * rings and motion stay consistent across the app rather than being re-invented
 * per view.
 */

import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  Bird,
  Box,
  Hammer,
  Package,
  Sprout,
  type LucideIcon,
} from 'lucide-react'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(clsx(parts))
}

/** Icons referenced by name from the kind registry. */
const KIND_ICONS: Record<string, LucideIcon> = { Box, Package, Sprout, Bird, Hammer }

export function kindIcon(name: string): LucideIcon {
  return KIND_ICONS[name] ?? Box
}

export const ACCENT_CLASS: Record<string, string> = {
  accent: 'text-accent-500',
  mint: 'text-mint-500',
  amber: 'text-amber-500',
  rose: 'text-rose-500',
  violet: 'text-violet-500',
}

export const ACCENT_BG: Record<string, string> = {
  accent: 'bg-accent-500/12 border-accent-500/30',
  mint: 'bg-mint-500/12 border-mint-500/30',
  amber: 'bg-amber-500/12 border-amber-500/30',
  rose: 'bg-rose-500/12 border-rose-500/30',
  violet: 'bg-violet-500/12 border-violet-500/30',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'subtle' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'subtle', size = 'md', icon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border font-medium',
        'transition-[background-color,border-color,color,transform,box-shadow] duration-150',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        'focus-visible:focus-ring',
        size === 'sm' ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-xs',
        variant === 'primary' &&
          'border-accent-500/60 bg-accent-500/18 text-accent-400 hover:bg-accent-500/28 hover:border-accent-500',
        variant === 'subtle' &&
          'border-ink-600 bg-ink-750 text-ink-100 hover:bg-ink-700 hover:border-ink-500',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-ink-200 hover:bg-ink-750 hover:text-ink-50',
        variant === 'danger' &&
          'border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'good'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase',
        tone === 'neutral' && 'border-ink-600 bg-ink-800 text-ink-200',
        tone === 'accent' && 'border-accent-500/40 bg-accent-500/10 text-accent-400',
        tone === 'warn' && 'border-amber-500/40 bg-amber-500/10 text-amber-500',
        tone === 'danger' && 'border-rose-500/40 bg-rose-500/10 text-rose-500',
        tone === 'good' && 'border-mint-500/40 bg-mint-500/10 text-mint-500',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Sidebar / panel section with a sticky heading. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col', className)}>
      <header className="sticky top-0 z-10 flex h-8 items-center justify-between gap-2 bg-ink-900/85 px-3 backdrop-blur">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">
          {title}
        </h3>
        {action}
      </header>
      <div className="px-2 pb-3">{children}</div>
    </section>
  )
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon?: ReactNode
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-ink-600 px-4 py-8 text-center"
    >
      {icon ? <div className="text-ink-400">{icon}</div> : null}
      <p className="text-xs font-medium text-ink-100">{title}</p>
      {detail ? <p className="max-w-xs text-[11px] leading-relaxed text-ink-300">{detail}</p> : null}
      {action}
    </motion.div>
  )
}

/** Label + control + help text, the shape every wizard field uses. */
export function FieldRow({
  label,
  help,
  error,
  children,
  htmlFor,
}: {
  label: string
  help?: string
  error?: string | null
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-medium tracking-wide text-ink-100"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] leading-relaxed text-rose-500">{error}</p>
      ) : help ? (
        <p className="text-[11px] leading-relaxed text-ink-300">{help}</p>
      ) : null}
    </div>
  )
}

export const inputClass = cn(
  'h-8 w-full rounded-md border border-ink-600 bg-ink-850 px-2.5 text-xs text-ink-50',
  'placeholder:text-ink-400 transition-colors duration-150',
  'hover:border-ink-500 focus:border-accent-500 focus:outline-none focus:shadow-[0_0_0_3px_var(--color-accent-glow)]',
)

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-3 animate-spin rounded-full border-2 border-ink-500 border-t-accent-500',
        className,
      )}
    />
  )
}
