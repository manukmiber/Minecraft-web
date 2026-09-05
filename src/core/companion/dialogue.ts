/**
 * What the companion says, and when.
 *
 * Kept out of the components on purpose: the line bank is content, it wants
 * reviewing as prose rather than as JSX, and it is the one part of the feature
 * that can be unit tested without a GPU.
 *
 * The rules it follows are the ones that decide whether a companion is company
 * or an irritant:
 *
 * - it never speaks over itself — a new line replaces the old one rather than
 *   queueing behind it;
 * - the same line does not come round twice in a row;
 * - a quiet setting means quiet, not "slightly less often";
 * - and nothing it says is load-bearing. Every event that produces a line also
 *   produces a toast or a panel entry, so muting the companion costs the user
 *   nothing but company.
 */

export type CompanionEvent =
  | 'greeting'
  | 'returning'
  | 'content-added'
  | 'content-deleted'
  | 'preset-applied'
  | 'texture-added'
  | 'problems-appeared'
  | 'problems-cleared'
  | 'saved'
  | 'exported'
  | 'released'
  | 'undo'
  | 'busy'
  | 'failed'
  | 'idle'
  | 'poked'

export type CompanionMoodName = 'idle' | 'happy' | 'thinking' | 'concerned' | 'proud' | 'sleepy'

export type CompanionGestureName = 'wave' | 'nod' | 'shake' | 'tilt' | 'cheer' | 'slump'

/** How much the companion is allowed to interrupt. */
export type ChatterLevel = 'quiet' | 'normal' | 'chatty'

export interface DialogueLine {
  text: string
  mood: CompanionMoodName
  gesture?: CompanionGestureName
  /** Roughly how long the bubble should stay up, in milliseconds. */
  hold: number
}

interface Entry {
  mood: CompanionMoodName
  gesture?: CompanionGestureName
  hold?: number
  /** Below this level the event passes silently. */
  minimum: ChatterLevel
  lines: string[]
}

const LEVEL_ORDER: Record<ChatterLevel, number> = { quiet: 0, normal: 1, chatty: 2 }

/**
 * `{n}` is substituted from the event's own detail — a count, a file name, a
 * release tag. Lines without it work whether or not a detail was supplied.
 */
const SCRIPT: Record<CompanionEvent, Entry> = {
  greeting: {
    mood: 'happy',
    gesture: 'wave',
    minimum: 'quiet',
    hold: 6000,
    lines: [
      'Hi! I am Kohane. I will keep an eye on the pack while you build.',
      'Ready when you are. Drop a block in and I will watch the file tree for you.',
      'Workspace is up. Say the word and we start shipping.',
    ],
  },
  returning: {
    mood: 'happy',
    gesture: 'nod',
    minimum: 'normal',
    hold: 5000,
    lines: [
      'Welcome back. Everything is exactly where you left it.',
      'Picked up where we stopped — {n} pieces of content still here.',
    ],
  },
  'content-added': {
    mood: 'happy',
    gesture: 'nod',
    minimum: 'normal',
    hold: 4200,
    lines: [
      'Added {n}. The pack tree already knows about it.',
      '{n} is in. Both packs regenerated, nothing out of sync.',
      'Nice — {n}. Want to give it a texture next?',
    ],
  },
  'content-deleted': {
    mood: 'thinking',
    minimum: 'chatty',
    hold: 3600,
    lines: ['{n} is gone, and so is everything it generated.', 'Removed. Undo is right there if that was a slip.'],
  },
  'preset-applied': {
    mood: 'happy',
    gesture: 'cheer',
    minimum: 'normal',
    hold: 5200,
    lines: [
      'Preset applied — {n} pieces of content arrived at once.',
      'That is {n} things added in one go. Worth a look at the Content panel.',
    ],
  },
  'texture-added': {
    mood: 'happy',
    minimum: 'chatty',
    hold: 3600,
    lines: ['Texture wired in. Atlas entry written for you.', 'Got it — that slot is filled and the path is set.'],
  },
  'problems-appeared': {
    mood: 'concerned',
    gesture: 'tilt',
    minimum: 'quiet',
    hold: 7000,
    lines: [
      '{n} in the way of a clean export. The Problems panel has the detail.',
      'Something will not generate — {n}. Shall we look?',
    ],
  },
  'problems-cleared': {
    mood: 'proud',
    gesture: 'nod',
    minimum: 'normal',
    hold: 4200,
    lines: ['All clear. The pack generates without a complaint.', 'Problems are gone. That exports cleanly now.'],
  },
  saved: {
    mood: 'proud',
    gesture: 'nod',
    minimum: 'normal',
    hold: 4200,
    lines: ['Saved to the project repo. That version is safe now.', 'Committed. Git has it, so it cannot be lost.'],
  },
  exported: {
    mood: 'happy',
    gesture: 'cheer',
    minimum: 'quiet',
    hold: 5200,
    lines: ['Export finished. {n} is ready to install.', 'Built and packaged — {n}. Go and try it in game.'],
  },
  released: {
    mood: 'proud',
    gesture: 'cheer',
    minimum: 'quiet',
    hold: 6000,
    lines: ['Published {n}. Anyone with the link can install it.', '{n} is live on the releases page.'],
  },
  undo: {
    mood: 'thinking',
    minimum: 'chatty',
    hold: 2600,
    lines: ['Rolled back.', 'Undone — the pack was regenerated from the older model.'],
  },
  busy: {
    mood: 'thinking',
    minimum: 'normal',
    hold: 20000,
    lines: ['{n}…', 'Working on it — {n}.'],
  },
  failed: {
    mood: 'concerned',
    gesture: 'slump',
    minimum: 'quiet',
    hold: 8000,
    lines: ['That did not go through. {n}', 'It failed: {n}'],
  },
  idle: {
    mood: 'sleepy',
    minimum: 'chatty',
    hold: 4200,
    lines: [
      'Still here whenever you want to carry on.',
      'Quiet in here. I will keep watching the pack.',
      'Take your time — nothing is unsaved right now.',
    ],
  },
  poked: {
    mood: 'happy',
    gesture: 'tilt',
    minimum: 'quiet',
    hold: 3600,
    lines: [
      'Hey — careful, that tickles.',
      'Yes? I am listening.',
      'Mm? Need something building?',
      'I am right here.',
    ],
  },
}

export interface DialogueRequest {
  event: CompanionEvent
  /** Substituted into `{n}`. */
  detail?: string
  level: ChatterLevel
  /** The last thing said, so the same line does not come round twice. */
  previous?: string | null
  /** Injectable so the tests are not at the mercy of chance. */
  random?: () => number
}

/**
 * Picks a line, or returns null when this event is below the chatter level.
 */
export function speak({
  event,
  detail,
  level,
  previous,
  random = Math.random,
}: DialogueRequest): DialogueLine | null {
  const entry = SCRIPT[event]
  if (!entry) return null
  if (LEVEL_ORDER[level] < LEVEL_ORDER[entry.minimum]) return null

  // A line that needs a detail it was not given would read as a typo, so those
  // are dropped before the choice rather than patched afterwards.
  const usable = entry.lines.filter((line) => detail !== undefined || !line.includes('{n}'))
  const pool = usable.length > 0 ? usable : entry.lines

  const fill = (line: string) => line.replace(/\{n\}/g, detail ?? '')
  const fresh = pool.filter((line) => fill(line) !== previous)
  const choices = fresh.length > 0 ? fresh : pool

  const text = fill(choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))])

  return {
    text,
    mood: entry.mood,
    gesture: entry.gesture,
    hold: entry.hold ?? 4200,
  }
}

/** Which events this chatter level lets through — used by the settings copy. */
export function audibleEvents(level: ChatterLevel): CompanionEvent[] {
  return (Object.keys(SCRIPT) as CompanionEvent[]).filter(
    (event) => LEVEL_ORDER[level] >= LEVEL_ORDER[SCRIPT[event].minimum],
  )
}

/** The mood the companion settles into with nothing happening. */
export const RESTING_MOOD: CompanionMoodName = 'idle'
