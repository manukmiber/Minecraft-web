/**
 * The workspace store.
 *
 * Holds the project model and everything derived from it. Any mutation goes
 * through `commit`, which regenerates the whole pack tree — that single rule is
 * what guarantees the file view, the problems list and the export can never
 * drift from the model.
 */

import { create } from 'zustand'

import { emitProject } from '../core/generators/emit'
import type { EmitProblem } from '../core/generators/emit'
import {
  addAsset as addAssetToProject,
  createNode,
  createProject,
  removeNode as removeNodeFromProject,
  setOverride as setOverrideOnProject,
  upsertNode,
} from '../core/model/project'
import type { AssetRef, ContentNode, ProjectModel } from '../core/model/types'
import { applyPreset } from '../core/presets/apply'
import type { ApplyReport } from '../core/presets/apply'
import type { PresetFile } from '../core/presets/format'
import type { VirtualFs } from '../core/vfs/types'
import { installBuiltinKinds } from '../core/kinds'
import { useSettings } from './settings'

// The store generates a pack the moment it is created, so the registry has to
// be populated first. Calling it here rather than only from main.tsx keeps
// tests and any other entry point honest.
installBuiltinKinds()

/** An open editor tab: either a piece of content or a generated file. */
export type Tab =
  | { id: string; type: 'node'; nodeId: string }
  | { id: string; type: 'file'; path: string }

export type EditorMode = 'wizard' | 'code'

export interface Toast {
  id: string
  tone: 'info' | 'success' | 'warning' | 'error'
  title: string
  detail?: string
}

const HISTORY_LIMIT = 60

/**
 * Edits closer together than this collapse into a single undo step. Without it,
 * typing a display name would push one entry per keystroke and undo would be
 * useless for anything larger.
 */
const HISTORY_COALESCE_MS = 700

let lastCommitAt = 0

interface ProjectStore {
  project: ProjectModel
  files: VirtualFs
  problems: EmitProblem[]

  /** Which save slot the model came from, and whether it has drifted since. */
  activeSlot: string
  dirty: boolean
  busy: string | null

  tabs: Tab[]
  activeTabId: string | null
  editorMode: EditorMode
  previewOpen: boolean

  past: ProjectModel[]
  futureStack: ProjectModel[]

  toasts: Toast[]

  // -- mutations -----------------------------------------------------------
  commit(next: ProjectModel, options?: { silent?: boolean }): void
  replaceProject(next: ProjectModel, slot?: string): void
  newProject(): void

  addNode(kindId: string, displayName: string): ContentNode
  updateNode(nodeId: string, patch: Partial<ContentNode>): void
  updateNodeData(nodeId: string, key: string, value: unknown): void
  setNodeTexture(nodeId: string, slotKey: string, assetId: string | null): void
  deleteNode(nodeId: string): void
  registerAsset(asset: AssetRef): void

  setOverride(path: string, content: string | null): void
  applyPresetFile(preset: PresetFile): ApplyReport

  undo(): void
  redo(): void

  // -- editor --------------------------------------------------------------
  openNode(nodeId: string): void
  openFile(path: string): void
  closeTab(tabId: string): void
  setActiveTab(tabId: string): void
  setEditorMode(mode: EditorMode): void
  togglePreview(): void

  // -- misc ----------------------------------------------------------------
  setActiveSlot(slot: string): void
  markSaved(slot: string): void
  setBusy(label: string | null): void
  toast(toast: Omit<Toast, 'id'>): void
  dismissToast(id: string): void
}

function regenerate(project: ProjectModel): { files: VirtualFs; problems: EmitProblem[] } {
  return emitProject(project)
}

function bootstrapProject(): ProjectModel {
  const settings = useSettings.getState()
  return createProject({
    namespace: settings.defaultNamespace,
    author: settings.author,
    targetProfileId: settings.defaultTargetProfileId,
  })
}

const initialProject = bootstrapProject()
const initialGenerated = regenerate(initialProject)

export const useProject = create<ProjectStore>((set, get) => ({
  project: initialProject,
  files: initialGenerated.files,
  problems: initialGenerated.problems,

  activeSlot: 'main',
  dirty: false,
  busy: null,

  tabs: [],
  activeTabId: null,
  editorMode: 'wizard',
  previewOpen: true,

  past: [],
  futureStack: [],

  toasts: [],

  commit(next, options) {
    const { project, past } = get()
    const generated = regenerate(next)

    const now = Date.now()
    const coalesce = past.length > 0 && now - lastCommitAt < HISTORY_COALESCE_MS
    lastCommitAt = now

    set({
      project: next,
      ...generated,
      dirty: options?.silent ? get().dirty : true,
      // Coalescing replaces the newest history entry rather than adding one, so
      // the step being undone is the one before this burst of edits started.
      past: coalesce ? past : [...past.slice(-HISTORY_LIMIT + 1), project],
      futureStack: [],
    })
  },

  replaceProject(next, slot) {
    const generated = regenerate(next)
    set({
      project: next,
      ...generated,
      activeSlot: slot ?? get().activeSlot,
      dirty: false,
      past: [],
      futureStack: [],
      // Tabs referencing the previous project's nodes would dangle.
      tabs: [],
      activeTabId: null,
    })
  },

  newProject() {
    get().replaceProject(bootstrapProject(), 'main')
  },

  addNode(kindId, displayName) {
    const node = createNode(get().project, kindId, displayName)
    get().commit(upsertNode(get().project, node))
    get().openNode(node.id)
    return node
  },

  updateNode(nodeId, patch) {
    const node = get().project.nodes.find((n) => n.id === nodeId)
    if (!node) return
    const updated = { ...node, ...patch, updatedAt: new Date().toISOString() }
    get().commit(upsertNode(get().project, updated))
  },

  updateNodeData(nodeId, key, value) {
    const node = get().project.nodes.find((n) => n.id === nodeId)
    if (!node) return
    get().updateNode(nodeId, { data: { ...node.data, [key]: value } })
  },

  setNodeTexture(nodeId, slotKey, assetId) {
    const node = get().project.nodes.find((n) => n.id === nodeId)
    if (!node) return
    get().updateNode(nodeId, { textures: { ...node.textures, [slotKey]: assetId } })
  },

  deleteNode(nodeId) {
    const { project, tabs, activeTabId } = get()
    get().commit(removeNodeFromProject(project, nodeId))
    const remaining = tabs.filter((tab) => !(tab.type === 'node' && tab.nodeId === nodeId))
    set({
      tabs: remaining,
      activeTabId: remaining.some((t) => t.id === activeTabId)
        ? activeTabId
        : (remaining.at(-1)?.id ?? null),
    })
  },

  registerAsset(asset) {
    // Assets are additive metadata; they do not count as a project edit on
    // their own, only once a slot actually references them.
    get().commit(addAssetToProject(get().project, asset), { silent: true })
  },

  setOverride(path, content) {
    get().commit(setOverrideOnProject(get().project, path, content))
  },

  applyPresetFile(preset) {
    const report = applyPreset(get().project, preset)
    get().commit(report.project)
    return report
  },

  undo() {
    const { past, project, futureStack } = get()
    const previous = past.at(-1)
    if (!previous) return
    set({
      project: previous,
      ...regenerate(previous),
      past: past.slice(0, -1),
      futureStack: [...futureStack, project],
      dirty: true,
    })
  },

  redo() {
    const { futureStack, project, past } = get()
    const next = futureStack.at(-1)
    if (!next) return
    set({
      project: next,
      ...regenerate(next),
      futureStack: futureStack.slice(0, -1),
      past: [...past, project],
      dirty: true,
    })
  },

  openNode(nodeId) {
    const id = `node:${nodeId}`
    const { tabs } = get()
    set({
      tabs: tabs.some((t) => t.id === id) ? tabs : [...tabs, { id, type: 'node', nodeId }],
      activeTabId: id,
    })
  },

  openFile(path) {
    const id = `file:${path}`
    const { tabs } = get()
    set({
      tabs: tabs.some((t) => t.id === id) ? tabs : [...tabs, { id, type: 'file', path }],
      activeTabId: id,
      editorMode: 'code',
    })
  },

  closeTab(tabId) {
    const { tabs, activeTabId } = get()
    const index = tabs.findIndex((t) => t.id === tabId)
    const remaining = tabs.filter((t) => t.id !== tabId)
    const nextActive =
      activeTabId === tabId
        ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
        : activeTabId
    set({ tabs: remaining, activeTabId: nextActive })
  },

  setActiveTab(tabId) {
    set({ activeTabId: tabId })
  },

  setEditorMode(mode) {
    set({ editorMode: mode })
  },

  togglePreview() {
    set({ previewOpen: !get().previewOpen })
  },

  setActiveSlot(slot) {
    set({ activeSlot: slot })
  },

  markSaved(slot) {
    set({ dirty: false, activeSlot: slot })
  },

  setBusy(label) {
    set({ busy: label })
  },

  toast(toast) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    set({ toasts: [...get().toasts, { ...toast, id }] })
    const ttl = toast.tone === 'error' ? 9000 : 4500
    setTimeout(() => get().dismissToast(id), ttl)
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
}))

/** The node behind the active tab, if the active tab is a node. */
export function useActiveNode(): ContentNode | null {
  return useProject((state) => {
    const tab = state.tabs.find((t) => t.id === state.activeTabId)
    if (!tab || tab.type !== 'node') return null
    return state.project.nodes.find((n) => n.id === tab.nodeId) ?? null
  })
}
