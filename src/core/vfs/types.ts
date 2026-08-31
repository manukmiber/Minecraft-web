/**
 * The virtual file system the generators write into.
 *
 * Nothing touches disk: a generation pass produces an in-memory tree that the
 * explorer renders, Monaco edits, and the exporter zips into a `.mcaddon`.
 */

export type FileBody =
  | { type: 'json'; value: unknown }
  | { type: 'text'; value: string }
  /** Binary passthrough — resolved from the asset store at export time. */
  | { type: 'asset'; assetId: string }

export interface VirtualFile {
  /** Pack-relative path, e.g. `behavior_pack/blocks/rice.json`. */
  path: string
  body: FileBody
  /** Which node produced this file, for explorer grouping and "go to source". */
  origin: {
    nodeId?: string
    kind?: string
    /** Short human label, e.g. "Block · Rice Crop" or "Pack". */
    label: string
  }
  /** True when a hand-edit in Code View replaced the generated content. */
  overridden?: boolean
}

export type VirtualFs = Map<string, VirtualFile>

export function serializeBody(body: FileBody): string {
  switch (body.type) {
    case 'json':
      return JSON.stringify(body.value, null, 2) + '\n'
    case 'text':
      return body.value
    case 'asset':
      return ''
  }
}

/** Groups a flat file list into a nested tree for the explorer. */
export interface FsTreeNode {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: FsTreeNode[]
  file?: VirtualFile
}

export function buildTree(files: Iterable<VirtualFile>): FsTreeNode {
  const root: FsTreeNode = { name: '', path: '', kind: 'dir', children: [] }

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  for (const file of sorted) {
    const parts = file.path.split('/')
    let cursor = root
    for (let i = 0; i < parts.length; i++) {
      const isLeaf = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')
      if (isLeaf) {
        cursor.children!.push({ name: parts[i], path, kind: 'file', file })
        break
      }
      let next = cursor.children!.find((c) => c.kind === 'dir' && c.name === parts[i])
      if (!next) {
        next = { name: parts[i], path, kind: 'dir', children: [] }
        cursor.children!.push(next)
      }
      cursor = next
    }
  }

  // Directories before files, alphabetical within each group — VS Code order.
  const sortNode = (node: FsTreeNode): void => {
    if (!node.children) return
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortNode)
  }
  sortNode(root)

  return root
}
