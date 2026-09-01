import { describe, expect, it } from 'vitest'

import { FileDiffPanel as CoreFileDiffPanel } from '@/components/chat/diff-lines'

import { FileDiffPanel } from './index'

describe('plugin SDK diff renderer', () => {
  it('exports the core virtualized syntax-highlighted panel', () => {
    expect(FileDiffPanel).toBe(CoreFileDiffPanel)
  })
})