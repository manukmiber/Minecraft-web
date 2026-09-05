/**
 * The Companion panel.
 *
 * Also the only place the model can be brought in, which is deliberate: the
 * import is where the licensing question has to be answered, and it should be
 * answered in front of the person doing it rather than buried in a doc.
 */

import { useEffect, useRef, useState } from 'react'
import {
  FolderOpen,
  Hand,
  Info,
  PersonStanding,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react'

import { Badge, Button, EmptyState, FieldRow, Section, Spinner, cn, inputClass } from '../../app/ui/primitives'
import type { ChatterLevel, CompanionMoodName } from '../../core/companion/dialogue'
import type { CompanionAsset } from './buildModel'
import { describeModel, type CompanionGesture } from './rig'
import { filesFromDataTransfer } from '../../integrations/companion/archive'
import {
  COMPANION_MAX_SIZE,
  COMPANION_MIN_SIZE,
  useCompanion,
  type CompanionCorner,
  type CompanionFraming,
} from '../../state/companion'

const CHATTER_HELP: Record<ChatterLevel, string> = {
  quiet: 'Only what you would want interrupting you: problems, exports, releases and failures.',
  normal: 'The above, plus content you add, presets you apply and saves.',
  chatty: 'Everything, including undo, textures and the occasional word when the workspace goes quiet.',
}

const MOODS: Array<{ mood: CompanionMoodName; label: string }> = [
  { mood: 'idle', label: 'Neutral' },
  { mood: 'happy', label: 'Happy' },
  { mood: 'thinking', label: 'Thinking' },
  { mood: 'concerned', label: 'Concerned' },
  { mood: 'proud', label: 'Proud' },
  { mood: 'sleepy', label: 'Sleepy' },
]

const GESTURES: Array<{ gesture: CompanionGesture; label: string }> = [
  { gesture: 'wave', label: 'Wave' },
  { gesture: 'nod', label: 'Nod' },
  { gesture: 'shake', label: 'Shake' },
  { gesture: 'tilt', label: 'Tilt' },
  { gesture: 'cheer', label: 'Cheer' },
  { gesture: 'slump', label: 'Slump' },
]

const chipClass = cn(
  'rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-[11px] text-ink-200',
  'transition-colors [transition-duration:var(--duration-state)]',
  'hover:border-accent-500/50 hover:bg-ink-700 hover:text-ink-50',
)

export function CompanionPanel() {
  const companion = useCompanion()
  const [dragging, setDragging] = useState(false)
  const folderInput = useRef<HTMLInputElement | null>(null)

  // `webkitdirectory` is not in the React DOM typings, and setting it through
  // a ref is the only way to keep the folder picker without casting props.
  useEffect(() => {
    if (folderInput.current) folderInput.current.setAttribute('webkitdirectory', '')
  }, [])

  const asset = companion.asset

  return (
    <div className="h-full overflow-y-auto pb-6">
      <Section title="Model">
        {companion.status === 'ready' && asset ? (
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border border-ink-700 bg-ink-850 p-2.5">
              <p className="truncate text-sm font-medium text-ink-50" title={companion.modelLabel ?? ''}>
                {asset.source.info.name || companion.modelLabel}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10.5px] text-ink-300">
                {companion.modelLabel}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="neutral">{asset.source.materials.length} materials</Badge>
                <Badge tone="neutral">{asset.source.bones.length} bones</Badge>
                <Badge tone="neutral">{asset.morphs.size} expressions</Badge>
                <Badge tone="neutral">
                  {(asset.source.geometry.indices.length / 3).toLocaleString()} triangles
                </Badge>
              </div>
            </div>

            {companion.warnings.length > 0 ? (
              <details className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-amber-500">
                  <TriangleAlert size={13} aria-hidden="true" />
                  {companion.warnings.length} thing
                  {companion.warnings.length === 1 ? '' : 's'} the archive did not have
                </summary>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {companion.warnings.map((warning) => (
                    <li key={warning} className="font-mono text-[10.5px] leading-relaxed text-ink-200">
                      {warning}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {companion.alternates.length > 0 ? (
              <div className="rounded-lg border border-ink-700 bg-ink-850 p-2.5">
                <p className="text-xs font-medium text-ink-100">
                  Also in this archive
                </p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-300">
                  A model often ships several outfits. Switching reads from the copy
                  already imported — no need to drop the archive in again.
                </p>
                <div className="mt-1.5 flex flex-col gap-1">
                  {companion.alternates.map((alternate) => (
                    <button
                      key={alternate.path}
                      type="button"
                      onClick={() => void companion.switchModel(alternate.path)}
                      title={alternate.label}
                      className={cn(
                        'truncate rounded px-1.5 py-1 text-left text-[11px] text-ink-200',
                        'transition-colors [transition-duration:var(--duration-state)]',
                        'hover:bg-ink-700 hover:text-ink-50',
                      )}
                    >
                      {alternate.label.split('/').pop()}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button
                variant="subtle"
                size="sm"
                icon={<Hand size={13} />}
                onClick={() => companion.play('wave')}
              >
                Say hello
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => void companion.forget()}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : companion.status === 'loading' ? (
          <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 p-3 text-xs text-ink-200">
            <Spinner label="Reading the model" />
            Reading the model — a dressed character is usually a few seconds.
          </div>
        ) : (
          <label
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void filesFromDataTransfer(event.dataTransfer).then((files) =>
                companion.importModel(files),
              )
            }}
            className={cn(
              'block cursor-pointer rounded-lg transition-colors [transition-duration:var(--duration-state)]',
              dragging && 'ring-2 ring-accent-500',
            )}
          >
            <input
              type="file"
              accept=".zip,.pmx"
              multiple
              className="sr-only"
              onChange={(event) => {
                if (event.target.files?.length) void companion.importModel(event.target.files)
                event.target.value = ''
              }}
            />
            <EmptyState
              icon={<PersonStanding size={20} />}
              title="No companion yet"
              detail="Drop an MMD model here — the .zip exactly as you downloaded it, or the unpacked folder. It is read in this browser and stays in this browser."
              action={
                <span className="mt-1 flex items-center gap-1.5 text-xs font-medium text-accent-400">
                  <Upload size={13} aria-hidden="true" />
                  Choose a .zip
                </span>
              }
            />
          </label>
        )}

        {companion.status !== 'ready' ? (
          <div className="mt-2 flex justify-center">
            <input
              ref={folderInput}
              type="file"
              multiple
              className="sr-only"
              id="companion-folder"
              onChange={(event) => {
                if (event.target.files?.length) void companion.importModel(event.target.files)
                event.target.value = ''
              }}
            />
            <label
              htmlFor="companion-folder"
              className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-300 underline underline-offset-2 hover:text-ink-100"
            >
              <FolderOpen size={13} aria-hidden="true" />
              …or pick an unpacked folder
            </label>
          </div>
        ) : null}

        {companion.error ? (
          <p
            role="alert"
            className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/5 p-2.5 text-xs leading-relaxed text-rose-500"
          >
            <TriangleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{companion.error}</span>
          </p>
        ) : null}
      </Section>

      {companion.status === 'ready' && asset ? (
        <Section title="Check the model">
          <p className="pb-1.5 text-[10.5px] leading-relaxed text-ink-300">
            Every model names its morphs differently, so what she can pull is decided by
            what yours happens to have. Try one and watch her.
          </p>

          <div className="flex flex-wrap gap-1">
            {MOODS.map((entry) => (
              <button
                key={entry.mood}
                type="button"
                onClick={() => companion.setMood(entry.mood)}
                aria-pressed={companion.mood === entry.mood}
                className={cn(
                  chipClass,
                  companion.mood === entry.mood && 'border-accent-500 bg-accent-500/15 text-ink-50',
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {GESTURES.map((entry) => (
              <button
                key={entry.gesture}
                type="button"
                onClick={() => companion.play(entry.gesture)}
                className={chipClass}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <ModelReport asset={asset} />
        </Section>
      ) : null}

      <Section title="Presence">
        <label className="flex items-start gap-2 py-2 text-xs leading-relaxed text-ink-100">
          <input
            type="checkbox"
            checked={companion.enabled}
            onChange={(event) => companion.setEnabled(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent-500)]"
          />
          <span>
            Show her in the workspace
            <span className="block text-ink-300">
              Off leaves the model imported and stops rendering it — no GPU cost at all.
            </span>
          </span>
        </label>

        <FieldRow
          label="Corner"
          htmlFor="companion-corner"
          help="She never covers the activity rail or the status bar."
        >
          <select
            id="companion-corner"
            value={companion.corner}
            onChange={(event) => companion.setCorner(event.target.value as CompanionCorner)}
            className={inputClass}
          >
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
          </select>
        </FieldRow>

        <FieldRow
          label="Framing"
          htmlFor="companion-framing"
          help="A bust takes up far less of the corner, and is the better choice on a small screen."
        >
          <select
            id="companion-framing"
            value={companion.framing}
            onChange={(event) => companion.setFraming(event.target.value as CompanionFraming)}
            className={inputClass}
          >
            <option value="full">Head to toe</option>
            <option value="bust">Head and shoulders</option>
          </select>
        </FieldRow>

        <FieldRow label={`Size — ${companion.size}px`}>
          <input
            type="range"
            min={COMPANION_MIN_SIZE}
            max={COMPANION_MAX_SIZE}
            step={4}
            value={companion.size}
            onChange={(event) => companion.setSize(Number(event.target.value))}
            className="w-full accent-[var(--color-accent-500)]"
            aria-label="Companion size in pixels"
          />
        </FieldRow>

        {companion.offsetX !== 0 || companion.offsetY !== 0 ? (
          <Button variant="ghost" size="sm" onClick={companion.resetPlacement}>
            Put her back in the corner
          </Button>
        ) : null}
      </Section>

      <Section title="Behaviour">
        <FieldRow
          label="How much she says"
          htmlFor="companion-chatter"
          help={CHATTER_HELP[companion.chatter]}
        >
          <select
            id="companion-chatter"
            value={companion.chatter}
            onChange={(event) => companion.setChatter(event.target.value as ChatterLevel)}
            className={inputClass}
          >
            <option value="quiet">Quiet</option>
            <option value="normal">Normal</option>
            <option value="chatty">Chatty</option>
          </select>
        </FieldRow>

        <label className="flex items-start gap-2 py-2 text-xs leading-relaxed text-ink-100">
          <input
            type="checkbox"
            checked={companion.sway}
            onChange={(event) => companion.setSway(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent-500)]"
          />
          <span>
            Hair and skirt move
            <span className="block text-ink-300">
              Spring bones, worked out from the model's own physics bodies. Turn off to save a
              little CPU.
            </span>
          </span>
        </label>

        <p className="pt-1 text-[10.5px] leading-relaxed text-ink-300">
          Reduced motion in Settings stills her completely — she keeps the pose and stops
          breathing, blinking and following the pointer.
        </p>
      </Section>

      <Section title="About the model">
        <p className="flex items-start gap-2 text-[10.5px] leading-relaxed text-ink-300">
          <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-500" />
          <span>
            Nothing you import here is uploaded, committed or exported. It is held in this
            browser's IndexedDB and nowhere else, because MMD models are usually distributed
            under terms that forbid redistribution — and a copy in a git repo or an object
            store would be exactly that. Check what your model's own readme allows before
            using it; <span className="font-mono">docs/COMPANION.md</span> goes through it.
          </span>
        </p>
      </Section>
    </div>
  )
}

/**
 * What the rig found in this particular model.
 *
 * Collapsed by default: it is diagnostic rather than daily, and it is the
 * first thing worth opening when an expression does not seem to land.
 */
function ModelReport({ asset }: { asset: CompanionAsset }) {
  const found = describeModel(asset)

  return (
    <details className="mt-2 rounded-lg border border-ink-700 bg-ink-850 p-2.5">
      <summary className="cursor-pointer text-xs text-ink-200">
        {found.expressions.length} expressions matched, {found.springBones} bones will swing
      </summary>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {found.expressions.map((entry) => (
          <li key={entry.slot} className="flex items-baseline justify-between gap-2 text-[10.5px]">
            <span className="text-ink-300">{entry.label}</span>
            <span className="truncate font-mono text-ink-100">{entry.morph}</span>
          </li>
        ))}
      </ul>
      {found.missing.length > 0 ? (
        <p className="mt-1.5 border-t border-ink-700 pt-1.5 text-[10.5px] leading-relaxed text-ink-300">
          Not in this model: {found.missing.join(', ')}. She simply does not use those.
        </p>
      ) : null}
      <p className="mt-1.5 text-[10.5px] text-ink-300">{found.posedBones} bones posed directly.</p>
    </details>
  )
}
