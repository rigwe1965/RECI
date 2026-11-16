import { describe, expect, it, vi } from 'vitest'
import { AI_MODEL_CHOICES, AI_MODEL_DEFAULTS, isAiModel, resolveAiModel, type AiPurpose } from './ai-models'

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
