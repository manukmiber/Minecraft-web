/**
 * The preset file format.
 *
 * One format serves both the built-in farming batch and the files another tool
 * (Claude Code, say) writes for you to drop into the inbox. Keeping them
 * identical means anything you can ship as a built-in, you can also hand-write
 * — and vice versa. docs/AI_ASSIST.md is the human-readable version of this
 * file.
 */

export const PRESET_FORMAT = 1

/**
 * References between nodes cannot use ids, because a preset has no idea what
 * ids a project will hand out. They are written as `#kind:name` and resolved
 * when the preset is applied, against nodes the preset creates and nodes that
 * already exist.
 */
export const REF_PREFIX = '#'

export interface PresetNode {
  kind: string
  /** Identifier name part. Must be lowercase `[a-z0-9_]`. */
  name: string
  displayName: string
  /** Field values for the kind. Omitted keys fall back to the kind's defaults. */
  data?: Record<string, unknown>
  /** Free-text note shown in the inspector. */
  notes?: string
}

export interface PresetFile {
  presetFormat: number
  id: string
  label: string
  description?: string
  author?: string
  createdAt?: string
  /** Only advisory — applying never changes the project's target profile. */
  targetProfileId?: string
  /** Content to create. An existing node with the same kind+name is replaced. */
  nodes: PresetNode[]
  /**
   * Raw files written straight into the project's overrides, for anything the
   * kinds cannot express yet. Paths are pack-relative, e.g.
   * `behavior_pack/entities/crow.json`.
   */
  files?: Array<{ path: string; content: string }>
  /** Shown to the user before they apply. */
  notes?: string[]
}

export interface PresetValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Checks a preset before it is offered for applying. Anything from the inbox is
 * untrusted input, so this is a real validation rather than a type assertion.
 */
export function validatePreset(raw: unknown, knownKinds: Set<string>): PresetValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['The file is not a JSON object.'], warnings }
  }
  const preset = raw as Partial<PresetFile>

  if (preset.presetFormat !== PRESET_FORMAT) {
    errors.push(
      `presetFormat is ${String(preset.presetFormat)}, but this build understands ${PRESET_FORMAT}.`,
    )
  }
  if (typeof preset.label !== 'string' || preset.label.trim() === '') {
    errors.push('A preset needs a "label".')
  }
  if (!Array.isArray(preset.nodes)) {
    errors.push('A preset needs a "nodes" array (it may be empty if it only ships "files").')
  } else {
    preset.nodes.forEach((node, index) => {
      const where = `nodes[${index}]`
      if (!node || typeof node !== 'object') {
        errors.push(`${where} is not an object.`)
        return
      }
      if (typeof node.kind !== 'string' || !knownKinds.has(node.kind)) {
        errors.push(`${where} uses unknown kind "${String(node.kind)}".`)
      }
      if (typeof node.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(node.name)) {
        errors.push(`${where}.name "${String(node.name)}" must be lowercase letters, digits and underscores.`)
      }
      if (typeof node.displayName !== 'string' || node.displayName.trim() === '') {
        warnings.push(`${where} has no displayName; the identifier name will be used instead.`)
      }
    })
  }

  if (preset.files) {
    if (!Array.isArray(preset.files)) {
      errors.push('"files" must be an array.')
    } else {
      for (const file of preset.files) {
        if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') {
          errors.push('Every entry in "files" needs a string "path" and "content".')
          break
        }
        if (!file.path.startsWith('behavior_pack/') && !file.path.startsWith('resource_pack/')) {
          warnings.push(
            `"${file.path}" is outside behavior_pack/ or resource_pack/ and will not ship.`,
          )
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function isRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(REF_PREFIX) && value.includes(':')
}

export function parseRef(value: string): { kind: string; name: string } | null {
  const body = value.slice(REF_PREFIX.length)
  const idx = body.indexOf(':')
  if (idx <= 0) return null
  return { kind: body.slice(0, idx), name: body.slice(idx + 1) }
}
