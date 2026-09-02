/**
 * The biome preview.
 *
 * A biome has no shape to render, so this is the flat equivalent of the 3D
 * panel: the colours as the game will mix them, the plants that will actually
 * appear, and the crow population those plants support. Everything is read from
 * the same fields the generator reads, so a wrong-looking preview means a
 * wrong-looking biome, not a preview bug.
 */

import { Bird, FileJson, Link2, Sprout } from 'lucide-react'

import { Badge, Button, cn } from '../../app/ui/primitives'
import {
  biomeTag,
  biomeTagsFor,
  effectiveCrowDensity,
  estimateCrows,
  farmlandTag,
  readScatterEntries,
} from '../../core/kinds/biome'
import { bool, num, str } from '../../core/kinds/shared'
import type { ContentNode } from '../../core/model/types'
import { useProject } from '../../state/project'

const MATURITY_LABEL: Record<string, string> = {
  ripe: 'fully grown',
  half: 'half grown',
  sprout: 'sprout',
}

export function BiomePreview({ node }: { node: ContentNode }) {
  const { project, files, openNode, openFile, updateNodeData, toast } = useProject()
  const data = node.data

  const nested = str(data, 'placement', 'standalone') === 'nested'

  // A nested biome ships no colours of its own, so the scene is painted in
  // neutrals rather than in a palette the game will never read.
  const grass = nested ? '#6f7d63' : str(data, 'grassColor', '#79c05a')
  const foliage = nested ? '#7e8c6f' : str(data, 'foliageColor', '#59ae30')
  const water = nested ? '#4a6274' : str(data, 'waterColor', '#44aff5')
  const fog = nested ? '#9aa4b0' : str(data, 'fogColor', '#c9dfff')

  const entries = readScatterEntries(data)
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0)
  const attempts = num(data, 'scatterAttempts', 12)
  const chance = num(data, 'scatterChance', 70)
  const estimate = estimateCrows(attempts, chance, entries.length)
  const effective = effectiveCrowDensity(data)

  const isFarmland = bool(data, 'farmlandBiome')
  const crow = project.nodes.find((n) => n.id === str(data, 'crowEntity'))
  const scarecrow = project.nodes.find((n) => n.id === str(data, 'scarecrowEntity'))

  const ownTag = biomeTag(project.namespace, node.name)
  const wantedTag = farmlandTag(project.namespace)
  const tags = biomeTagsFor(project.namespace, node.name, data)

  // A crow spawning on "overworld" already reaches a biome tagged overworld —
  // reachability is about the tag sets overlapping, not about an exact match.
  const crowReaches =
    crow !== undefined &&
    bool(crow.data, 'spawnEnabled') &&
    tags.includes(str(crow.data, 'spawnBiomeTag').trim())
  const crowTuned =
    crow !== undefined &&
    Math.round(num(crow.data, 'spawnDensityLimit', 0)) === effective.densityLimit

  /**
   * Copies the estimate onto the crow entity. The crow's spawn rules stay the
   * crow's — this only fills in the two fields the biome has an opinion about,
   * rather than the biome growing its own copy of a spawn definition.
   */
  const linkCrow = (): void => {
    if (!crow) return
    updateNodeData(crow.id, 'spawnEnabled', true)
    updateNodeData(crow.id, 'spawnBiomeTag', wantedTag)
    updateNodeData(crow.id, 'spawnDensityLimit', effective.densityLimit)
    toast({
      tone: 'success',
      title: `${crow.displayName} now spawns here`,
      detail: `Biome tag ${wantedTag}, density limit ${effective.densityLimit}. It no longer spawns outside farmland biomes.`,
    })
  }

  // Deterministic: tuft i belongs to whichever plant owns the point (i+0.5)/n
  // on the weight line, so the row is a picture of the mix, not a random draw.
  const tuftCount = entries.length === 0 ? 0 : Math.round(clampNumber(estimate.plantsPerChunk / 2, 1, 11))
  const tufts: string[] = []
  for (let i = 0; i < tuftCount; i++) {
    const point = ((i + 0.5) / tuftCount) * totalWeight
    let running = 0
    for (const entry of entries) {
      running += entry.weight
      if (point <= running) {
        tufts.push(entry.plant)
        break
      }
    }
  }

  const generated = [...files.values()]
    .filter((file) => file.origin.nodeId === node.id)
    .map((file) => file.path)
    .sort()

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* -- ambience ------------------------------------------------------- */}
      <div className="relative h-40 shrink-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(180deg, ${mix(fog, '#5b8fd6', 0.45)} 0%, ${fog} 62%)` }}
        />

        {/* The ground, its far edge softened into the fog. */}
        <div
          className="absolute inset-x-0 bottom-0 h-24"
          style={{
            background: `linear-gradient(180deg, ${mix(grass, fog, 0.45)} 0%, ${grass} 55%, ${mix(grass, '#000000', 0.18)} 100%)`,
          }}
        />

        {/* A pond half-sunk into the ground, so the water colour sits beside
            the grass exactly as it does in game. */}
        <div
          className="absolute bottom-4 right-5 h-9 w-32 rounded-[50%]"
          style={{
            background: `radial-gradient(ellipse at 50% 30%, ${mix(water, '#ffffff', 0.25)} 0%, ${water} 70%)`,
          }}
        />

        {/* One tuft per expected plant, shared out by weight: a denser biome
            grows more of them, and the common crop takes more of the row. */}
        <div className="absolute inset-x-0 bottom-5 flex items-end justify-around px-3">
          {tufts.map((entry, index) => (
            <Tuft
              key={index}
              height={16 + ((index * 7) % 11)}
              color={index % 3 === 0 ? foliage : mix(foliage, grass, 0.35)}
              title={project.nodes.find((n) => n.id === entry)?.displayName ?? ''}
            />
          ))}
        </div>

        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <Badge tone={nested ? 'warn' : 'good'}>{nested ? 'Nested' : 'Overworld'}</Badge>
          {isFarmland ? <Badge tone="accent">Farmland</Badge> : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div>
          <p className="text-sm font-semibold text-ink-50">{node.displayName}</p>
          <p className="font-mono text-[10.5px] text-ink-300">
            {project.namespace}:{node.name}
          </p>
        </div>

        {nested ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-2 text-xs leading-relaxed text-ink-200">
            Nested in <span className="font-mono">{str(data, 'hostBiome', 'plains')}</span>. No new
            region of world is generated and no colours are shipped — the host biome keeps its own
            look, and this only adds the plants below.
          </p>
        ) : (
          <Swatches
            items={[
              ['Grass', grass],
              ['Foliage', foliage],
              ['Water', water],
              ['Fog', fog],
            ]}
          />
        )}

        {/* -- climate ------------------------------------------------------ */}
        <Panel title="Climate">
          <Meter label="Temperature" value={num(data, 'temperature', 0.8)} max={2} />
          <Meter label="Downfall" value={num(data, 'downfall', 0.8)} max={1} />
          <p className="pt-1 text-xs leading-relaxed text-ink-300">{climateSentence(data)}</p>
        </Panel>

        {/* -- plants ------------------------------------------------------- */}
        <Panel
          title="Grows wild here"
          right={
            entries.length > 0 ? (
              <span className="font-mono text-xs text-ink-300">
                ≈{estimate.plantsPerChunk}/chunk
              </span>
            ) : null
          }
        >
          {entries.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-ink-300">
              <Sprout size={12} /> Nothing assigned — this biome generates bare.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {entries.map((entry) => {
                const plant = project.nodes.find((n) => n.id === entry.plant)
                const share = totalWeight > 0 ? Math.round((entry.weight / totalWeight) * 100) : 0
                return (
                  <li key={entry.plant} className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => plant && openNode(plant.id)}
                      className="flex items-center gap-2 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-100">
                        {plant?.displayName ?? 'Deleted crop'}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-mint-500">{share}%</span>
                    </button>
                    <div className="h-1 overflow-hidden rounded-full bg-ink-800">
                      <div
                        className="h-full rounded-full bg-mint-500/70"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <p className="text-xs text-ink-300">
                      {MATURITY_LABEL[entry.maturity]}
                      {entry.needsWater ? ' · needs water beside it' : ''}
                      {entry.placeOn.length > 0 ? ` · on ${entry.placeOn.join(', ')}` : ''}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {/* -- crows -------------------------------------------------------- */}
        {isFarmland ? (
          <Panel title="Crows">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg text-ink-50">{effective.crowsPerChunk}</span>
              <span className="text-xs text-ink-300">crows per chunk</span>
              <Badge tone={num(data, 'crowDensity', 0) > 0 ? 'warn' : 'neutral'} className="ml-auto">
                {num(data, 'crowDensity', 0) > 0 ? 'manual' : 'estimated'}
              </Badge>
            </div>
            <p className="pt-1 text-xs leading-relaxed text-ink-300">
              {entries.length === 0
                ? 'No plants yet, so nothing draws crows here.'
                : `${estimate.plantsPerChunk} plants per chunk feeds about ${estimate.crowsPerChunk} birds — a spawn density limit of ${effective.densityLimit}.`}
            </p>

            {crow ? (
              <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-ink-700 bg-ink-900 p-2">
                <div className="flex items-center gap-2">
                  <Bird size={12} className="text-violet-500" />
                  <button
                    type="button"
                    onClick={() => openNode(crow.id)}
                    className="truncate text-xs text-ink-100 hover:text-ink-50"
                  >
                    {crow.displayName}
                  </button>
                  <Badge
                    tone={crowReaches ? (crowTuned ? 'good' : 'neutral') : 'warn'}
                    className="ml-auto shrink-0"
                  >
                    {crowReaches ? (crowTuned ? 'wired up' : 'reaches, untuned') : 'cannot reach'}
                  </Badge>
                </div>
                <p className="text-[10.5px] leading-relaxed text-ink-300">
                  Spawns on tag{' '}
                  <span className="font-mono">{str(crow.data, 'spawnBiomeTag') || 'none'}</span>,
                  density limit {num(crow.data, 'spawnDensityLimit', 0)}.
                </p>
                {crowReaches && crowTuned ? null : (
                  <Button size="sm" variant="primary" icon={<Link2 size={11} />} onClick={linkCrow}>
                    Point it at farmland, density {effective.densityLimit}
                  </Button>
                )}
              </div>
            ) : (
              <p className="pt-1.5 text-xs text-ink-300">
                Pick a crow under Crows in the form to see how its spawn rules line up.
              </p>
            )}

            {scarecrow ? (
              <p className="pt-2 text-xs leading-relaxed text-ink-300">
                <button
                  type="button"
                  onClick={() => openNode(scarecrow.id)}
                  className="text-ink-100 underline decoration-ink-600 underline-offset-2 hover:decoration-ink-400"
                >
                  {scarecrow.displayName}
                </button>{' '}
                keeps pests {num(scarecrow.data, 'avoidRadius', 16)} blocks away. That radius belongs
                to the entity, not to this biome — change it there.
              </p>
            ) : null}
          </Panel>
        ) : null}

        {/* -- what export writes ------------------------------------------- */}
        <Panel title="Generates">
          <p className="pb-1.5 text-xs text-ink-300">
            Scoped to <span className="font-mono text-ink-100">{nested ? str(data, 'hostBiome', 'plains') : ownTag}</span>
            {nested ? ' (host biome)' : ' (this biome only)'}.
          </p>
          <ul className="flex flex-col gap-0.5">
            {generated.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => openFile(path)}
                  title={path}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-ink-800"
                >
                  <FileJson size={10} className="shrink-0 text-ink-500" />
                  <span className="truncate font-mono text-xs text-ink-300">{path}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

/** A little crossed-plane plant, the shape the game draws a crop as. */
function Tuft({ height, color, title }: { height: number; color: string; title: string }) {
  return (
    <span className="relative block w-2" style={{ height }} title={title}>
      <span
        className="absolute bottom-0 left-1/2 h-full w-[3px] -translate-x-1/2 rounded-t-full"
        style={{ background: color }}
      />
      <span
        className="absolute bottom-0 left-1/2 h-2/3 w-[2.5px] origin-bottom -rotate-[28deg] rounded-t-full"
        style={{ background: color, opacity: 0.85 }}
      />
      <span
        className="absolute bottom-0 left-1/2 h-2/3 w-[2.5px] origin-bottom rotate-[28deg] rounded-t-full"
        style={{ background: color, opacity: 0.85 }}
      />
    </span>
  )
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function Panel({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-ink-700 bg-ink-850/60 p-2.5">
      <header className="flex items-center justify-between gap-2 pb-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
          {title}
        </h4>
        {right}
      </header>
      {children}
    </section>
  )
}

function Swatches({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {items.map(([label, color]) => (
        <div key={label} className="flex flex-col gap-1">
          <span
            className="h-6 rounded border border-ink-700"
            style={{ background: color }}
            title={color}
          />
          <span className="text-[9.5px] text-ink-300">{label}</span>
        </div>
      ))}
    </div>
  )
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((Math.min(Math.max(value, 0), max) / max) * 100)
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-20 shrink-0 text-xs text-ink-300">{label}</span>
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink-800">
        <span
          className={cn('block h-full rounded-full', label === 'Temperature' ? 'bg-amber-500' : 'bg-accent-500')}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-8 shrink-0 text-right font-mono text-xs text-ink-200">{value}</span>
    </div>
  )
}

/** Plain-language summary of what the climate numbers actually do in game. */
function climateSentence(data: Record<string, unknown>): string {
  const temperature = num(data, 'temperature', 0.8)
  const downfall = num(data, 'downfall', 0.8)

  const heat =
    temperature < 0.15
      ? 'Freezing — snow settles and water freezes'
      : temperature < 0.35
        ? 'Cold'
        : temperature < 0.75
          ? 'Temperate'
          : temperature < 1.05
            ? 'Warm'
            : 'Hot — no rain falls above 1.0, only the sky darkens'

  const wet = downfall < 0.1 ? 'and bone dry' : downfall < 0.5 ? 'and fairly dry' : 'and wet'
  return `${heat} ${wet}.`
}

/** Blends two hex colours, so the preview can fade ground into fog. */
function mix(a: string, b: string, amount: number): string {
  const pa = parseHex(a)
  const pb = parseHex(b)
  if (!pa || !pb) return a
  const channel = (index: number) => Math.round(pa[index] + (pb[index] - pa[index]) * amount)
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}

function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim().replace('#', '')
  if (hex.length === 3) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ]
  }
  if (hex.length !== 6) return null
  const parsed: [number, number, number] = [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ]
  return parsed.every((n) => Number.isFinite(n)) ? parsed : null
}
