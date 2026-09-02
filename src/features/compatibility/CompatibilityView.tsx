/**
 * The Compatibility panel: what survives each way of shipping this add-on.
 *
 * The reason this is a panel rather than a paragraph in the docs is that the
 * answer depends on the project. "Does this work on Java?" has no general
 * answer — an add-on that is only recipes and world generation ships to a Java
 * data pack almost untouched, and one built around custom blocks does not ship
 * to it at all. So the table is filtered to the kinds the project actually
 * uses, and the verdict at the top is about your add-on rather than about the
 * platform in the abstract.
 *
 * Rows that are less than "full" always carry their reason. A matrix of ticks
 * and crosses tells you where you are stuck without telling you why, which is
 * the state that makes people assume the tool is broken.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Boxes, CheckCircle2, Coffee, FileJson, MinusCircle, TriangleAlert } from 'lucide-react'

import { Badge, Section, cn } from '../../app/ui/primitives'
import {
  CAPABILITIES,
  DATAPACK_CANNOT_REGISTER,
  capabilitiesForProject,
  verdictFor,
} from '../../core/targets/capabilities'
import type { FeatureCapability, SupportLevel } from '../../core/targets/capabilities'
import { LOADERS } from '../../core/targets/platforms'
import type { ModLoader } from '../../core/targets/platforms'
import { useProject } from '../../state/project'

type Route = 'bedrock' | 'javaDatapack' | 'javaMod'

const ROUTES: Array<{ id: Route; label: string; short: string; icon: typeof Boxes; blurb: string }> = [
  {
    id: 'bedrock',
    label: 'Bedrock add-on',
    short: 'Bedrock',
    icon: Boxes,
    blurb: 'A .mcaddon. Pure JSON, no build step, works on console and mobile.',
  },
  {
    id: 'javaDatapack',
    label: 'Java data pack',
    short: 'Data pack',
    icon: FileJson,
    blurb: 'Two zips, no mod loader. Recipes, loot, tags and world generation only.',
  },
  {
    id: 'javaMod',
    label: 'Java mod',
    short: 'Mod',
    icon: Coffee,
    blurb: 'Fabric, Quilt, Forge or NeoForge. A Gradle project you build into a jar.',
  },
]

const LEVEL_ICON: Record<SupportLevel, typeof CheckCircle2> = {
  full: CheckCircle2,
  partial: TriangleAlert,
  none: MinusCircle,
}

const LEVEL_CLASS: Record<SupportLevel, string> = {
  full: 'text-mint-500',
  partial: 'text-amber-500',
  none: 'text-rose-500',
}

const LEVEL_WORD: Record<SupportLevel, string> = {
  full: 'Full support',
  partial: 'Partial support',
  none: 'Not supported',
}

export function CompatibilityView() {
  const project = useProject((state) => state.project)
  const [showAll, setShowAll] = useState(false)

  const relevant = useMemo(() => capabilitiesForProject(project), [project])
  const rows = showAll ? CAPABILITIES : relevant
  const verdicts = useMemo(
    () => ({
      bedrock: verdictFor(project, 'bedrock'),
      javaDatapack: verdictFor(project, 'javaDatapack'),
      javaMod: verdictFor(project, 'javaMod'),
    }),
    [project],
  )

  return (
    <div className="h-full overflow-y-auto pb-6">
      <Section title="This add-on, per platform">
        <p className="pb-3 text-xs leading-relaxed text-ink-300">
          {project.nodes.length === 0
            ? 'Nothing in the project yet. The table below shows every feature the builder can produce; add content and it narrows to what you actually use.'
            : `Judged against the ${project.nodes.length} pieces of content in this project, not the platform in general.`}
        </p>

        <div className="flex flex-col gap-2">
          {ROUTES.map((route) => {
            const verdict = verdicts[route.id]
            const Icon = route.icon
            const LevelIcon = LEVEL_ICON[verdict.level]
            return (
              <motion.div
                key={route.id}
                layout
                className="rounded-md border border-ink-700 bg-ink-850 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Icon size={15} aria-hidden="true" className="text-ink-300" />
                  <span className="text-sm font-medium text-ink-50">{route.label}</span>
                  {/* Word plus glyph: the colour is a third signal, never the only one. */}
                  <Badge
                    tone={
                      verdict.level === 'full' ? 'good' : verdict.level === 'partial' ? 'warn' : 'danger'
                    }
                  >
                    <LevelIcon size={11} aria-hidden="true" />
                    {LEVEL_WORD[verdict.level]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-300">{route.blurb}</p>
                {verdict.gaps.length > 0 ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-200">
                    {verdict.gaps.length} feature{verdict.gaps.length === 1 ? '' : 's'} in this
                    project {verdict.gaps.length === 1 ? 'is' : 'are'} not fully covered:{' '}
                    <span className="text-ink-300">
                      {verdict.gaps.map((gap) => gap.label).join(', ')}.
                    </span>
                  </p>
                ) : null}
              </motion.div>
            )
          })}
        </div>
      </Section>

      <Section
        title="Feature by feature"
        action={
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="text-xs text-ink-300 underline-offset-2 hover:text-ink-100 hover:underline"
          >
            {showAll ? 'Only what I use' : `Show all ${CAPABILITIES.length}`}
          </button>
        }
      >
        <div className="flex flex-col gap-2">
          {rows.length === 0 ? (
            <p className="px-1 text-xs leading-relaxed text-ink-300">
              Nothing to compare yet — add some content, or show the full table.
            </p>
          ) : (
            rows.map((capability) => <CapabilityRow key={capability.id} capability={capability} />)
          )}
        </div>
      </Section>

      <Section title="Why the middle column is thin">
        <p className="text-xs leading-relaxed text-ink-300">{DATAPACK_CANNOT_REGISTER}</p>
        <p className="mt-2 text-xs leading-relaxed text-ink-300">
          It is not a limitation of this builder and no exporter can work around it. If your add-on
          is mostly recipes, loot and world generation, the data pack is genuinely the easiest thing
          to hand someone — no loader, no build. If it adds blocks or items, pick a mod loader.
        </p>
      </Section>
    </div>
  )
}

function CapabilityRow({ capability }: { capability: FeatureCapability }) {
  const [open, setOpen] = useState(false)
  const loaderNotes = Object.entries(capability.loaderNotes ?? {}) as Array<[ModLoader, string]>

  return (
    <div className="rounded-md border border-ink-700 bg-ink-850">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left',
          'transition-colors [transition-duration:var(--duration-state)] hover:bg-ink-800',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-sm text-ink-50">{capability.label}</span>
        <span className="flex shrink-0 items-center gap-2.5">
          {ROUTES.map((route) => {
            const support = capability[route.id]
            const Icon = LEVEL_ICON[support.level]
            return (
              <span key={route.id} className="flex items-center gap-1">
                <Icon
                  size={13}
                  aria-hidden="true"
                  className={LEVEL_CLASS[support.level]}
                />
                <span className="sr-only">
                  {route.label}: {LEVEL_WORD[support.level]}
                </span>
                <span aria-hidden="true" className="text-[10px] uppercase tracking-wide text-ink-300">
                  {route.short}
                </span>
              </span>
            )
          })}
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-ink-700 px-3 py-2.5">
          {ROUTES.map((route) => {
            const support = capability[route.id]
            return (
              <div key={route.id} className="flex gap-2">
                <span className={cn('mt-0.5 shrink-0', LEVEL_CLASS[support.level])}>
                  {(() => {
                    const Icon = LEVEL_ICON[support.level]
                    return <Icon size={12} aria-hidden="true" />
                  })()}
                </span>
                <p className="text-xs leading-relaxed text-ink-300">
                  <span className="font-medium text-ink-100">{route.label}</span> — {support.note}
                </p>
              </div>
            )
          })}

          {loaderNotes.length > 0 ? (
            <div className="mt-1 border-t border-ink-700 pt-2">
              <p className="pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">
                Per loader
              </p>
              <ul className="flex flex-col gap-1">
                {loaderNotes.map(([loader, note]) => (
                  <li key={loader} className="text-xs leading-relaxed text-ink-300">
                    <span className="font-medium text-ink-100">{LOADERS[loader].label}</span> — {note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
