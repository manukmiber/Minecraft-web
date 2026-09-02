/**
 * The wizard.
 *
 * Every control on this page is generated from the active kind's `fields`
 * declaration — there is no per-kind form anywhere in the codebase. That is the
 * mechanism behind "add a kind, get a UI for free".
 */

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Plus, X } from 'lucide-react'

import { ACCENT_CLASS, Badge, FieldRow, cn, inputClass, kindIcon } from '../../app/ui/primitives'
import type { ContentNode } from '../../core/model/types'
import { getKind } from '../../core/registry/types'
import type { FieldSpec } from '../../core/registry/types'
import { isValidName } from '../../core/util/id'
import { projectBiomeTags } from '../../core/kinds/biome'
import { useProject } from '../../state/project'
import { TextureSlotDrop } from '../textures/TextureSlotDrop'
import { BiomeScatterField } from './BiomeScatterField'
import { LayerGridField } from './LayerGridField'
import { WeightedListField } from './WeightedListField'
import { RecipeStationField } from '../recipes/RecipeStationField'

/** Vanilla biome tags worth offering next to the project's own. */
const VANILLA_BIOME_TAGS = [
  'overworld',
  'plains',
  'forest',
  'jungle',
  'swamp',
  'savanna',
  'taiga',
  'desert',
  'beach',
  'river',
  'ocean',
  'mountains',
  'mesa',
  'nether',
  'the_end',
]

export function FormEditor({ node }: { node: ContentNode }) {
  const { project, updateNode, updateNodeData } = useProject()
  const kind = getKind(node.kind)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const groups = useMemo(() => {
    if (!kind) return []
    const visible = kind.fields.filter((field) => !field.when || field.when(node.data))
    const order: string[] = []
    const byGroup = new Map<string, FieldSpec[]>()
    for (const field of visible) {
      const group = field.group ?? 'General'
      if (!byGroup.has(group)) {
        byGroup.set(group, [])
        order.push(group)
      }
      byGroup.get(group)!.push(field)
    }
    return order.map((group) => ({ group, fields: byGroup.get(group)! }))
  }, [kind, node.data])

  if (!kind) {
    return (
      <div className="p-6 text-sm text-rose-500">
        This content uses the unknown kind “{node.kind}”. It probably came from a preset built for a
        newer version of the app.
      </div>
    )
  }

  const Icon = kindIcon(kind.icon)
  const slots = kind.textureSlots(node)
  const nameValid = isValidName(node.name)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5">
      <header className="flex items-start gap-3">
        <div
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg border',
            'border-ink-600 bg-ink-850',
          )}
        >
          <Icon size={18} className={ACCENT_CLASS[kind.accent]} />
        </div>

        <div className="min-w-0 flex-1">
          <input
            value={node.displayName}
            onChange={(event) => updateNode(node.id, { displayName: event.target.value })}
            aria-label="Display name"
            className="h-8 w-full rounded border border-transparent bg-transparent text-base font-semibold text-ink-50 transition-colors hover:border-ink-700 focus:border-accent-500 focus:bg-ink-850 focus:outline-none"
          />
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-ink-300">{project.namespace}:</span>
            <input
              value={node.name}
              // Kept permissive on purpose: slugifying every keystroke would eat
              // a trailing underscore the moment you typed it. Invalid input is
              // flagged instead, and the generator reports it too.
              onChange={(event) =>
                updateNode(node.id, {
                  name: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                })
              }
              aria-label="Identifier name"
              className={cn(
                'h-6 w-56 rounded border bg-ink-900 px-1.5 font-mono text-xs text-ink-100 focus:outline-none',
                nameValid ? 'border-ink-700 focus:border-accent-500' : 'border-rose-500/60',
              )}
            />
            <Badge tone="neutral">{kind.label}</Badge>
          </div>
        </div>
      </header>

      {node.notes ? (
        <p className="rounded-md border border-ink-700 bg-ink-850 px-2.5 py-2 text-xs leading-relaxed text-ink-300">
          {node.notes}
        </p>
      ) : null}

      {slots.length > 0 ? (
        <section className="rounded-lg border border-ink-700 bg-ink-850/60 p-3">
          <h3 className="pb-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
            Textures
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
            {slots.map((slot) => (
              <TextureSlotDrop key={slot.key} node={node} slot={slot} />
            ))}
          </div>
        </section>
      ) : null}

      {groups.map(({ group, fields }) => {
        const isCollapsed = collapsed[group]
        return (
          <section key={group} className="rounded-lg border border-ink-700 bg-ink-850/60">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-300 transition-colors hover:text-ink-100"
            >
              <motion.span animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.15 }}>
                <ChevronDown size={13} />
              </motion.span>
              {group}
            </button>

            <AnimatePresence initial={false}>
              {!isCollapsed ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-ink-700 px-3 pb-2">
                    {fields.map((field) => (
                      <Field
                        key={field.key}
                        field={field}
                        node={node}
                        onChange={(value) => updateNodeData(node.id, field.key, value)}
                      />
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        )
      })}
    </div>
  )
}

function Field({
  field,
  node,
  onChange,
}: {
  field: FieldSpec
  node: ContentNode
  onChange(value: unknown): void
}) {
  const { project, updateNode } = useProject()
  const value = node.data[field.key]
  const error = field.validate ? field.validate(value, node.data) : null
  const id = `${node.id}-${field.key}`

  const control = (() => {
    switch (field.type) {
      case 'boolean':
        return (
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={Boolean(value)}
            onClick={() => onChange(!value)}
            className={cn(
              'tap-target relative h-6 w-11 rounded-full border',
              'transition-colors [transition-duration:var(--duration-state)]',
              value ? 'border-accent-500 bg-accent-500/30' : 'border-edge bg-ink-800',
            )}
          >
            <motion.span
              layout
              transition={{ type: 'spring', stiffness: 620, damping: 34 }}
              className={cn(
                'absolute top-[3px] size-4 rounded-full',
                // Fill and position both move, so "on" is not a colour cue alone.
                value ? 'left-[23px] bg-accent-500' : 'left-[3px] bg-ink-300',
              )}
            />
          </button>
        )

      case 'slider': {
        const current = typeof value === 'number' ? value : (field.min ?? 0)
        return (
          <div className="flex items-center gap-3">
            <input
              id={id}
              type="range"
              min={field.min ?? 0}
              max={field.max ?? 1}
              step={field.step ?? 0.1}
              value={current}
              onChange={(event) => onChange(Number(event.target.value))}
              aria-valuetext={field.unit ? `${current} ${field.unit}` : String(current)}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600 accent-[var(--color-accent-500)]"
            />
            <span className="w-14 shrink-0 text-right font-mono text-xs text-ink-100">
              {current}
              {field.unit ? <span className="text-ink-300"> {field.unit}</span> : null}
            </span>
          </div>
        )
      }

      case 'number':
        return (
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={typeof value === 'number' ? value : ''}
              onChange={(event) => onChange(Number(event.target.value))}
              className={cn(inputClass, 'w-36 font-mono')}
            />
            {field.unit ? <span className="text-xs text-ink-300">{field.unit}</span> : null}
          </div>
        )

      case 'select':
        return (
          <select
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
                {option.hint ? ` — ${option.hint}` : ''}
              </option>
            ))}
          </select>
        )

      case 'multiselect': {
        const selected = Array.isArray(value) ? (value as string[]) : []
        return (
          <div className="flex flex-wrap gap-1.5">
            {field.options?.map((option) => {
              const on = selected.includes(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onChange(
                      on
                        ? selected.filter((v) => v !== option.value)
                        : [...selected, option.value],
                    )
                  }
                  className={cn(
                    'rounded border px-2 py-1 text-xs transition-colors',
                    on
                      ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                      : 'border-ink-600 bg-ink-800 text-ink-300 hover:border-ink-500',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        )
      }

      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={typeof value === 'string' && value.startsWith('#') ? value : '#888888'}
              onChange={(event) => onChange(event.target.value)}
              className="size-8 cursor-pointer rounded border border-ink-600 bg-ink-850"
            />
            <input
              id={id}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => onChange(event.target.value)}
              className={cn(inputClass, 'w-32 font-mono')}
            />
          </div>
        )

      case 'textarea':
        return (
          <textarea
            id={id}
            rows={3}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
            className={cn(inputClass, 'h-auto resize-y py-2')}
          />
        )

      case 'node-ref': {
        const candidates = project.nodes.filter(
          (candidate) =>
            candidate.id !== node.id &&
            (!field.refKinds || field.refKinds.includes(candidate.kind)),
        )
        return (
          <select
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          >
            <option value="">— none —</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName} ({project.namespace}:{candidate.name})
              </option>
            ))}
          </select>
        )
      }

      case 'item-ref':
      case 'block-ref': {
        const listId = `${id}-list`
        return (
          <>
            <input
              id={id}
              list={listId}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => onChange(event.target.value)}
              placeholder={field.placeholder ?? 'namespace:name'}
              className={cn(inputClass, 'font-mono')}
            />
            <datalist id={listId}>
              {project.nodes.map((candidate) => (
                <option
                  key={candidate.id}
                  value={`${project.namespace}:${candidate.name}`}
                  label={candidate.displayName}
                />
              ))}
              {field.type === 'block-ref' ? (
                <>
                  <option value="minecraft:farmland" />
                  <option value="minecraft:grass_block" />
                  <option value="minecraft:dirt" />
                </>
              ) : null}
            </datalist>
          </>
        )
      }

      case 'string-list': {
        const items = Array.isArray(value) ? (value as string[]) : []
        return (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              <AnimatePresence initial={false}>
                {items.map((item, index) => (
                  <motion.span
                    key={`${item}-${index}`}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-1 rounded border border-ink-600 bg-ink-800 py-0.5 pl-2 pr-1 font-mono text-xs text-ink-100"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => onChange(items.filter((_, i) => i !== index))}
                      aria-label={`Remove ${item}`}
                      className="tap-target grid size-5 place-items-center rounded text-ink-300 transition-colors [transition-duration:var(--duration-state)] hover:text-rose-500"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            <div className="flex gap-1.5">
              <input
                id={id}
                placeholder={field.placeholder ?? 'Add and press Enter'}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  const next = event.currentTarget.value.trim()
                  if (!next || items.includes(next)) return
                  onChange([...items, next])
                  event.currentTarget.value = ''
                }}
                className={cn(inputClass, 'font-mono')}
              />
              <button
                type="button"
                onClick={(event) => {
                  const input = event.currentTarget.previousElementSibling as HTMLInputElement
                  const next = input.value.trim()
                  if (!next || items.includes(next)) return
                  onChange([...items, next])
                  input.value = ''
                }}
                className="grid size-8 shrink-0 place-items-center rounded-md border border-ink-600 bg-ink-750 text-ink-200 transition-colors hover:bg-ink-700"
                aria-label="Add"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
        )
      }

      case 'recipe-station':
        // The only field that owns more than its own key: the builder writes
        // the station, the grid, the cooking slots and the result together.
        return (
          <RecipeStationField
            node={node}
            onPatch={(patch) => updateNode(node.id, { data: { ...node.data, ...patch } })}
          />
        )

      case 'weighted-list':
        return (
          <WeightedListField
            value={value}
            onChange={onChange}
            placeholder={field.placeholder}
            listId={`${id}-list`}
          />
        )

      case 'layer-grid':
        return <LayerGridField value={value} onChange={onChange} fieldId={id} />

      case 'biome-scatter':
        return <BiomeScatterField value={value} onChange={onChange} />

      case 'biome-ref': {
        const listId = `${id}-biomes`
        const own = projectBiomeTags(project)
        return (
          <>
            <input
              id={id}
              list={listId}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => onChange(event.target.value)}
              placeholder={field.placeholder ?? 'overworld'}
              className={cn(inputClass, 'font-mono')}
            />
            <datalist id={listId}>
              {own.map((option) => (
                <option key={option.value} value={option.value} label={option.label} />
              ))}
              {VANILLA_BIOME_TAGS.filter(
                (tag) => !own.some((option) => option.value === tag),
              ).map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </>
        )
      }

      default:
        return (
          <input
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
            className={cn(inputClass, field.type === 'identifier' && 'font-mono')}
          />
        )
    }
  })()

  return (
    <FieldRow label={field.label} help={field.help} error={error} htmlFor={id}>
      {control}
    </FieldRow>
  )
}
