/**
 * Reading a dropped MMD model into memory.
 *
 * Two shapes of drop are accepted, because both are what people actually have:
 * the `.zip` exactly as it was downloaded, or the unpacked folder. Either way
 * the result is a flat map of normalised paths, which is all the bundle
 * resolver wants.
 *
 * Nothing here leaves the browser. The model is read locally, kept locally,
 * and never uploaded — see `docs/COMPANION.md` for why that is deliberate
 * rather than incidental.
 */

import JSZip from 'jszip'

import { normalizePath, type ModelArchive } from '../../core/companion/bundle'

/** Enough for any character model; a guard against a mis-drop, not a policy. */
export const MAX_ARCHIVE_BYTES = 192 * 1024 * 1024

/**
 * Entry names in an MMD zip are usually Shift-JIS, because the models are made
 * on Japanese Windows and the zip's UTF-8 flag is off. Read as UTF-8 they come
 * out as mojibake, which does not break the load — texture names are ASCII —
 * but does make the file list unreadable in the picker.
 */
function decodeEntryName(raw: string[] | Uint8Array | ArrayLike<number>): string {
  // JSZip hands this back as a byte array, but its type also allows the
  // already-decoded form, which needs nothing done to it.
  if (Array.isArray(raw)) return raw.join('')
  const bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw)
  try {
    return new TextDecoder('shift_jis', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function assertSize(total: number): void {
  if (total > MAX_ARCHIVE_BYTES) {
    throw new Error(
      `That model unpacks to ${Math.round(total / 1024 / 1024)} MB, past the ${
        MAX_ARCHIVE_BYTES / 1024 / 1024
      } MB this can hold in the browser.`,
    )
  }
}

async function readZip(file: File): Promise<ModelArchive> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { decodeFileName: decodeEntryName })

  const files = new Map<string, Uint8Array>()
  const displayNames = new Map<string, string>()
  let total = 0

  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  for (const entry of entries) {
    // A readme is a third of some archives and none of it is ever read.
    if (/\.(txt|md|url|lnk|html?)$/i.test(entry.name)) continue
    const bytes = await entry.async('uint8array')
    total += bytes.byteLength
    assertSize(total)
    const path = normalizePath(entry.name)
    files.set(path, bytes)
    displayNames.set(path, entry.name)
  }

  return { files, displayNames }
}

async function readFolder(fileList: File[]): Promise<ModelArchive> {
  const files = new Map<string, Uint8Array>()
  const displayNames = new Map<string, string>()
  let total = 0

  for (const file of fileList) {
    // `webkitRelativePath` is what keeps `khn_tex/kao.png` distinct from a
    // `kao.png` at the root; a plain multi-file drop only has the name.
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const name = relative && relative.length > 0 ? relative : file.name
    if (/\.(txt|md|url|lnk|html?)$/i.test(name)) continue
    const bytes = new Uint8Array(await file.arrayBuffer())
    total += bytes.byteLength
    assertSize(total)
    const path = normalizePath(name)
    files.set(path, bytes)
    displayNames.set(path, name)
  }

  return { files, displayNames }
}

/**
 * Reads whatever was dropped or picked. A lone `.zip` is unpacked; anything
 * else is treated as the already-unpacked folder.
 */
export async function readModelArchive(input: File[] | FileList): Promise<ModelArchive> {
  const list = Array.from(input)
  if (list.length === 0) throw new Error('Nothing was dropped.')

  if (list.length === 1 && /\.zip$/i.test(list[0].name)) return readZip(list[0])

  const zips = list.filter((file) => /\.zip$/i.test(file.name))
  if (zips.length === 1 && list.length === 1) return readZip(zips[0])

  return readFolder(list)
}

/**
 * Walks a drag-and-drop payload, including folders.
 *
 * `DataTransferItem.webkitGetAsEntry` is the only way to see inside a dropped
 * directory, and it is not promise-shaped, hence the wrapping. Anything the
 * browser will not describe falls back to the plain file list.
 */
export async function filesFromDataTransfer(transfer: DataTransfer): Promise<File[]> {
  const items = Array.from(transfer.items ?? [])
  const entries = items
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry?.() ?? null : null))
    .filter((entry): entry is FileSystemEntry => entry !== null)

  if (entries.length === 0) return Array.from(transfer.files ?? [])

  const out: File[] = []
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      )
      // Re-label the file with its path inside the drop, so a folder drag
      // resolves textures the same way a folder picker does.
      Object.defineProperty(file, 'webkitRelativePath', {
        value: prefix + file.name,
        configurable: true,
      })
      out.push(file)
      return
    }

    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns at most 100 at a time and signals the end with an
    // empty batch, so it has to be drained in a loop.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      )
      if (batch.length === 0) break
      for (const child of batch) await walk(child, `${prefix}${entry.name}/`)
    }
  }

  for (const entry of entries) await walk(entry, '')
  return out
}
