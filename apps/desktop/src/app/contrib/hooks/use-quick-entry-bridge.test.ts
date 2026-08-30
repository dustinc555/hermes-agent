import { beforeEach, describe, expect, it } from 'vitest'

import {
  executionModeSessionKey,
  setExecutionMode
} from '@/store/execution-mode'
import { setSessions } from '@/store/session'
import type { SessionInfo } from '@/types/hermes'

import { quickEntryExecutionModeSnapshot } from './use-quick-entry-bridge'

const row = (over: Partial<SessionInfo>): SessionInfo =>
  ({
    ended_at: null,
    id: 'stored-plan',
    input_tokens: 0,
    is_active: false,
    last_active: 0,
    message_count: 1,
    model: null,
    output_tokens: 0,
    preview: null,
    profile: 'default',
    source: null,
    started_at: 0,
    title: null,
    ...over
  }) as SessionInfo

describe('Quick Entry execution-mode snapshots', () => {
  beforeEach(() => {
    setSessions([row({})])
    setExecutionMode(executionModeSessionKey('default', 'stored-plan'), 'normal')
  })

  it('captures the picked chat mode before asynchronous resume', () => {
    setExecutionMode(executionModeSessionKey('default', 'stored-plan'), 'plan')

    const snapshot = quickEntryExecutionModeSnapshot('stored-plan', 'default')
    setExecutionMode(executionModeSessionKey('default', 'stored-plan'), 'normal')

    expect(snapshot).toEqual({
      executionMode: 'plan',
      executionModeKey: 'default:session:stored-plan'
    })
  })
})
