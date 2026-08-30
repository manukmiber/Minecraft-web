/**
 * Wires Monaco to the bundled copy instead of the CDN default.
 *
 * `@monaco-editor/react` otherwise fetches Monaco over the network at runtime,
 * which would make the code view fail on a bad connection and add a third-party
 * dependency to a tool meant to run from its own deployment.
 *
 * Only the languages this app actually shows are pulled in — the full
 * `monaco-editor` entry point drags in every language Monaco supports, which is
 * megabytes of Abap and Solidity nobody here will ever open.
 */

import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

let configured = false

export function setupMonaco(): void {
  if (configured) return
  configured = true

  // Language services run in workers; without this Monaco falls back to the
  // main thread and JSON schema validation is unavailable.
  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'json') return new jsonWorker()
      return new editorWorker()
    },
  }

  loader.config({ monaco })
}
