import { describe, expect, it } from 'vitest'

import { audibleEvents, speak } from './dialogue'

describe('speak', () => {
  it('fills the detail into the line', () => {
    const line = speak({ event: 'content-added', detail: 'Rice', level: 'normal', random: () => 0 })
    expect(line?.text).toContain('Rice')
    expect(line?.text).not.toContain('{n}')
  })

  it('never picks a line that needs a detail when there is none', () => {
    for (let i = 0; i < 20; i++) {
      const line = speak({ event: 'content-added', level: 'normal', random: () => i / 20 })
      expect(line?.text ?? '').not.toContain('{n}')
    }
  })

  it('avoids repeating the line that is already showing', () => {
    const first = speak({ event: 'poked', level: 'quiet', random: () => 0 })
    const second = speak({ event: 'poked', level: 'quiet', previous: first?.text, random: () => 0 })
    expect(second?.text).not.toBe(first?.text)
  })

  it('falls back to the pool rather than going silent when every line is stale', () => {
    // Only reachable when an event has a single line, which is the shape a
    // future line bank could easily end up in.
    const line = speak({ event: 'busy', detail: 'Exporting', level: 'normal', random: () => 0 })
    const again = speak({
      event: 'busy',
      detail: 'Exporting',
      level: 'normal',
      previous: line?.text,
      random: () => 0,
    })
    expect(again).not.toBeNull()
  })

  it('honours the chatter level', () => {
    expect(speak({ event: 'undo', level: 'quiet' })).toBeNull()
    expect(speak({ event: 'undo', level: 'normal' })).toBeNull()
    expect(speak({ event: 'undo', level: 'chatty' })).not.toBeNull()

    // Anything a person needs to know still gets through on quiet.
    expect(speak({ event: 'problems-appeared', detail: '2 errors', level: 'quiet' })).not.toBeNull()
    expect(speak({ event: 'failed', detail: 'no token', level: 'quiet' })).not.toBeNull()
  })

  it('lets the settings panel describe what each level allows', () => {
    expect(audibleEvents('quiet').length).toBeLessThan(audibleEvents('normal').length)
    expect(audibleEvents('normal').length).toBeLessThan(audibleEvents('chatty').length)
    expect(audibleEvents('quiet')).toContain('problems-appeared')
    expect(audibleEvents('quiet')).not.toContain('idle')
  })

  it('carries a mood and a hold with every line', () => {
    const line = speak({ event: 'released', detail: 'v1.2.0', level: 'quiet' })
    expect(line?.mood).toBe('proud')
    expect(line?.gesture).toBe('cheer')
    expect(line?.hold).toBeGreaterThan(1000)
  })
})
