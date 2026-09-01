/**
 * "The thing this recipe makes does not exist yet."
 *
 * A short form that creates real content rather than a placeholder: it writes
 * an item, a block, or an item that places a block, hands the recipe the new
 * identifier, and lets the ordinary generation pass wire the behaviour pack and
 * the resource pack together — the same path the wizard uses, so there is no
 * second way for content to come into existence.
 */

import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Boxes, Image as ImageIcon, Pencil, Sparkles, Upload, X } from 'lucide-react'

import { Badge, Button, FieldRow, Spinner, cn, inputClass } from '../../app/ui/primitives'
import { MENU_CATEGORY_OPTIONS } from '../../core/kinds/shared'
import type { AssetRef } from '../../core/model/types'
import { slugify } from '../../core/util/id'
import { useProject } from '../../state/project'
import { assets as assetStore } from '../../state/services'
import { openTextureMaker } from '../../state/textureMaker'
import { useAssetUrl } from '../textures/useAssetUrl'

export interface NewItemResult {
  /** `namespace:name` to drop into the recipe's output slot. */
  identifier: string
  createdKinds: string[]
}

export function NewItemDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose(): void
  onCreated(result: NewItemResult): void
}) {
  const { project, createContent, registerAsset, toast } = useProject()
  const fileRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [category, setCategory] = useState('items')
  const [asset, setAsset] = useState<AssetRef | null>(null)
  const [uploading, setUploading] = useState(false)

  const [edible, setEdible] = useState(false)
  const [nutrition, setNutrition] = useState(4)
  const [saturation, setSaturation] = useState(0.6)
  const [alwaysEat, setAlwaysEat] = useState(false)

  const [placeable, setPlaceable] = useState(false)

  const url = useAssetUrl(asset)
  const effectiveName = (nameTouched ? name : slugify(displayName)) || ''
  const ready = displayName.trim().length > 0 && effectiveName.length > 0

  const reset = () => {
    setDisplayName('')
    setName('')
    setNameTouched(false)
    setCategory('items')
    setAsset(null)
    setEdible(false)
    setNutrition(4)
    setSaturation(0.6)
    setAlwaysEat(false)
    setPlaceable(false)
  }

  const acceptFile = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await assetStore.importFile(file, project.id, 16)
      registerAsset(result.asset)
      setAsset(result.asset)
      if (result.warning) {
        toast({ tone: 'warning', title: 'Texture added, with a caveat', detail: result.warning })
      }
    } catch (failure) {
      toast({
        tone: 'error',
        title: 'Could not use that file',
        detail: failure instanceof Error ? failure.message : String(failure),
      })
    } finally {
      setUploading(false)
    }
  }

  const draw = () => {
    openTextureMaker({
      title: `${displayName.trim() || 'New item'} · Icon`,
      size: 16,
      startFrom: asset,
      fileName: effectiveName || 'new_item',
      onSave: (next) => setAsset(next),
    })
  }

  const submit = () => {
    if (!ready) return

    const created: string[] = []
    let blockNodeId: string | null = null
    let identifier = ''

    // A placeable result is a block. If it is also edible it needs an item to
    // carry the food components, so the block takes its own identifier and the
    // item places it — the way a seed and its crop already work.
    if (placeable) {
      const block = createContent('block', edible ? `${displayName.trim()} Block` : displayName.trim(), {
        name: edible ? `${effectiveName}_block` : effectiveName,
        data: {
          category: category === 'items' ? 'construction' : category,
          // Anything drawn at 16px with transparency needs the cut-out render
          // method, or Bedrock draws the transparent pixels black.
          renderMethod: 'alpha_test',
        },
        textures: asset ? { main: asset.id } : undefined,
        notes: 'Created from the recipe builder.',
        open: false,
      })
      blockNodeId = block.id
      identifier = `${project.namespace}:${block.name}`
      created.push(`block ${identifier}`)
    }

    if (!placeable || edible) {
      const item = createContent('item', displayName.trim(), {
        name: effectiveName,
        data: {
          category,
          maxStackSize: edible ? 16 : 64,
          isFood: edible,
          nutrition,
          saturation,
          canAlwaysEat: alwaysEat,
          placesBlock: blockNodeId ?? '',
        },
        textures: asset ? { main: asset.id } : undefined,
        notes: 'Created from the recipe builder.',
        open: false,
      })
      identifier = `${project.namespace}:${item.name}`
      created.push(`item ${identifier}`)
    }

    onCreated({ identifier, createdKinds: created })
    toast({
      tone: 'success',
      title: `${displayName.trim()} created`,
      detail: `${created.join(' and ')} — behaviour and resource files were generated and linked.`,
    })
    reset()
    onClose()
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-40 flex items-start justify-center bg-ink-950/65 p-6 pt-[8vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 440, damping: 34 }}
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-ink-600 bg-ink-850 shadow-float"
          >
            <header className="sticky top-0 flex items-center gap-2 border-b border-ink-700 bg-ink-850/95 px-4 py-3 backdrop-blur">
              <Sparkles size={14} className="text-mint-500" />
              <h3 className="flex-1 text-xs font-semibold text-ink-50">New result item</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded p-1 text-ink-300 transition-colors hover:bg-ink-750 hover:text-ink-50"
              >
                <X size={14} />
              </button>
            </header>

            <div className="px-4 pb-2">
              <FieldRow label="Name" htmlFor="new-item-name">
                <input
                  id="new-item-name"
                  autoFocus
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Fried Egg"
                  className={inputClass}
                />
              </FieldRow>

              <FieldRow
                label="Identifier"
                help="Generated from the name. Change it if you want something else."
                htmlFor="new-item-id"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-ink-400">{project.namespace}:</span>
                  <input
                    id="new-item-id"
                    value={effectiveName}
                    onChange={(event) => {
                      setNameTouched(true)
                      setName(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
                    }}
                    className={cn(inputClass, 'font-mono')}
                  />
                </div>
              </FieldRow>

              <FieldRow label="Icon" help="Upload a PNG, or draw one now without leaving this form.">
                <div className="flex items-center gap-2">
                  <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-ink-600 bg-ink-900">
                    {uploading ? (
                      <Spinner />
                    ) : url ? (
                      <img
                        src={url}
                        alt="Icon"
                        className="size-full object-contain p-1 [image-rendering:pixelated]"
                      />
                    ) : (
                      <ImageIcon size={16} className="text-ink-400" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Button
                      size="sm"
                      variant="subtle"
                      icon={<Upload size={12} />}
                      onClick={() => fileRef.current?.click()}
                    >
                      Upload PNG
                    </Button>
                    <Button size="sm" variant="primary" icon={<Pencil size={12} />} onClick={draw}>
                      {asset ? 'Edit in texture maker' : 'Draw it'}
                    </Button>
                  </div>
                </div>
              </FieldRow>

              <FieldRow label="Creative tab" htmlFor="new-item-category">
                <select
                  id="new-item-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className={inputClass}
                >
                  {MENU_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FieldRow>

              <Toggle label="Can be eaten" value={edible} onChange={setEdible} />

              <AnimatePresence initial={false}>
                {edible ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="ml-3 border-l border-ink-700 pl-3">
                      <FieldRow label="Nutrition" help="Half-drumsticks restored. A cooked steak is 8.">
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={20}
                            step={1}
                            value={nutrition}
                            onChange={(event) => setNutrition(Number(event.target.value))}
                            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600 accent-[var(--color-accent-500)]"
                          />
                          <span className="w-8 text-right font-mono text-[11px] text-ink-100">
                            {nutrition}
                          </span>
                        </div>
                      </FieldRow>
                      <FieldRow label="Saturation modifier">
                        <input
                          type="number"
                          min={0}
                          max={4}
                          step={0.1}
                          value={saturation}
                          onChange={(event) => setSaturation(Number(event.target.value))}
                          className={cn(inputClass, 'w-32 font-mono')}
                        />
                      </FieldRow>
                      <Toggle
                        label="Edible even on a full hunger bar"
                        value={alwaysEat}
                        onChange={setAlwaysEat}
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <Toggle
                label="Can be placed in the world"
                value={placeable}
                onChange={setPlaceable}
                help="Placeable content is a block, so this creates one through the same block builder the wizard uses."
              />
            </div>

            <footer className="sticky bottom-0 flex items-center gap-2 border-t border-ink-700 bg-ink-850/95 px-4 py-3 backdrop-blur">
              <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-[11px] text-ink-400">
                <Boxes size={11} />
                Creates
                {placeable ? <Badge tone="accent">block</Badge> : null}
                {!placeable || edible ? <Badge tone="good">item</Badge> : null}
                {placeable && edible ? <span>— the item places the block.</span> : null}
              </p>
              <Button size="sm" variant="subtle" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" disabled={!ready} onClick={submit}>
                Create and use
              </Button>
            </footer>

            <input
              ref={fileRef}
              type="file"
              accept="image/png"
              hidden
              onChange={(event) => {
                void acceptFile(event.target.files)
                event.target.value = ''
              }}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function Toggle({
  label,
  help,
  value,
  onChange,
}: {
  label: string
  help?: string
  value: boolean
  onChange(next: boolean): void
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-ink-100">{label}</p>
        {help ? <p className="pt-0.5 text-[11px] leading-relaxed text-ink-300">{help}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
          value ? 'border-accent-500 bg-accent-500/30' : 'border-ink-600 bg-ink-800',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 620, damping: 34 }}
          className={cn(
            'absolute top-0.5 size-3.5 rounded-full',
            value ? 'left-[18px] bg-accent-500' : 'left-0.5 bg-ink-400',
          )}
        />
      </button>
    </div>
  )
}
