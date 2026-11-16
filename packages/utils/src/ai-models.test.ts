import { describe, expect, it, vi } from 'vitest'
import { AI_MODEL_CHOICES, AI_MODEL_DEFAULTS, createStoredModelReader, isAiModel, parseStoredAiModel, resolveAiModel, type AiPurpose } from './ai-models'

const purposes = Object.keys(AI_MODEL_DEFAULTS) as AiPurpose[]

describe('resolveAiModel', () => {
  it('uses exactly the old model for every feature when nothing is set', () => {
    expect(resolveAiModel('chat', {})).toBe('claude-sonnet-4-6')
    expect(resolveAiModel('extras', {})).toBe('claude-haiku-4-5-20251001')
    expect(resolveAiModel('vision', {})).toBe('claude-sonnet-4-6')
  })
  it('every default is itself an allowed model', () => {
    for (const p of purposes) expect(isAiModel(AI_MODEL_DEFAULTS[p]), p).toBe(true)
  })
  it('AI_MODEL changes every feature', () => {
    for (const p of purposes) expect(resolveAiModel(p, { AI_MODEL: 'claude-opus-5-5' }), p).toBe('claude-opus-5-5')
  })
  it('a feature setting beats AI_MODEL', () => {
    expect(resolveAiModel('extras', { AI_MODEL: 'claude-opus-5-5', AI_MODEL_EXTRAS: 'claude-haiku-5-5' })).toBe('claude-haiku-5-5')
    expect(resolveAiModel('chat', { AI_MODEL: 'claude-haiku-5-5' })).toBe('claude-haiku-5-5')
  })
  it('keeps AI_VISION_MODEL working for vision only', () => {
    expect(resolveAiModel('vision', { AI_VISION_MODEL: 'claude-opus-5-5' })).toBe('claude-opus-5-5')
    expect(resolveAiModel('chat', { AI_VISION_MODEL: 'claude-opus-5-5' })).toBe('claude-sonnet-4-6')
  })
  it('ignores an unknown model with a warning and keeps the default', () => {
    const warn = vi.fn()
    expect(resolveAiModel('chat', { AI_MODEL_CHAT: 'claude-typo' }, warn)).toBe('claude-sonnet-4-6')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('claude-typo')
  })
  it('an unknown feature value falls through to a valid AI_MODEL', () => {
    expect(resolveAiModel('chat', { AI_MODEL_CHAT: 'nope', AI_MODEL: 'claude-haiku-5-5' }, () => {})).toBe('claude-haiku-5-5')
  })
  it('treats blank values as not set', () => expect(resolveAiModel('chat', { AI_MODEL: '  ', AI_MODEL_CHAT: '' })).toBe('claude-sonnet-4-6'))
  it('accepts only listed ids', () => {
    expect(AI_MODEL_CHOICES.length).toBeGreaterThan(5)
    for (const bad of ['', 'gpt-4', undefined, null, 'claude-sonnet-5-5 ']) expect(isAiModel(bad), String(bad)).toBe(false)
  })
})

describe('the admin portal choice', () => {
  it('is used for the main features', () => {
    for (const p of ['chat', 'search', 'trip', 'corporate', 'vision'] as const) expect(resolveAiModel(p, {}, () => {}, 'claude-opus-5-5'), p).toBe('claude-opus-5-5')
  })
  it('never raises the background features off their small model', () => {
    expect(resolveAiModel('extras', {}, () => {}, 'claude-opus-5-5')).toBe('claude-haiku-4-5-20251001')
    expect(resolveAiModel('maintenance', {}, () => {}, 'claude-opus-5-5')).toBe('claude-haiku-4-5-20251001')
  })
  it('loses to a server setting for the same feature but beats AI_MODEL', () => {
    expect(resolveAiModel('chat', { AI_MODEL_CHAT: 'claude-haiku-5-5' }, () => {}, 'claude-opus-5-5')).toBe('claude-haiku-5-5')
    expect(resolveAiModel('chat', { AI_MODEL: 'claude-haiku-5-5' }, () => {}, 'claude-opus-5-5')).toBe('claude-opus-5-5')
  })
  it('is ignored when it is not one of the admin choices', () => {
    expect(resolveAiModel('chat', {}, () => {}, 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6') // the built-in default, not a choice
    expect(resolveAiModel('chat', {}, () => {}, 'retired-model')).toBe('claude-sonnet-4-6')
    expect(resolveAiModel('chat', {}, () => {}, null)).toBe('claude-sonnet-4-6')
  })
  it('parses stored values strictly', () => {
    expect(parseStoredAiModel('claude-haiku-5-5')).toBe('claude-haiku-5-5')
    for (const bad of [null, undefined, 5, {}, 'claude-fable-5-2', '']) expect(parseStoredAiModel(bad), String(bad)).toBeNull()
  })
})

describe('createStoredModelReader', () => {
  it('reads once and remembers the value for a minute', async () => {
    let t = 0
    const read = vi.fn(async () => 'claude-opus-5-5')
    const get = createStoredModelReader(read, { now: () => t })
    expect(await get()).toBe('claude-opus-5-5')
    t = 59_000
    expect(await get()).toBe('claude-opus-5-5')
    expect(read).toHaveBeenCalledTimes(1)
    t = 61_000
    await get()
    expect(read).toHaveBeenCalledTimes(2)
  })
  it('picks up a change after the minute', async () => {
    let t = 0
    let value: unknown = 'claude-haiku-5-5'
    const get = createStoredModelReader(async () => value, { now: () => t })
    expect(await get()).toBe('claude-haiku-5-5')
    value = null
    t = 61_000
    expect(await get()).toBeNull()
  })
  it('never throws: a failing read means no choice, then keeps the last good value', async () => {
    let t = 0
    const read = vi.fn<[], Promise<unknown>>().mockRejectedValue(new Error('table does not exist'))
    const get = createStoredModelReader(read, { now: () => t })
    expect(await get()).toBeNull()
    t = 5_000
    await get()
    expect(read).toHaveBeenCalledTimes(1) // not hammered while failing
    read.mockResolvedValueOnce('claude-sonnet-5-5')
    t = 20_000
    expect(await get()).toBe('claude-sonnet-5-5')
    read.mockRejectedValue(new Error('blip'))
    t = 100_000
    expect(await get()).toBe('claude-sonnet-5-5') // last good value survives a blip
  })
  it('treats a value that is not an allowed choice as no choice', async () => {
    expect(await createStoredModelReader(async () => 'claude-mystery')()).toBeNull()
  })
})
