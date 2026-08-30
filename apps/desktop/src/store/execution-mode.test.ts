import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadStore = () => import('./execution-mode')

describe('per-chat execution mode', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  it('defaults every chat to normal and isolates stored sessions', async () => {
    const store = await loadStore()

    expect(store.getExecutionMode('session-a')).toBe('normal')
    store.setExecutionMode('session-a', 'plan')

    expect(store.getExecutionMode('session-a')).toBe('plan')
    expect(store.getExecutionMode('session-b')).toBe('normal')
  })

  it('persists Plan until the user toggles that chat back to Normal', async () => {
    const first = await loadStore()
    first.setExecutionMode('session-a', 'plan')

    vi.resetModules()
    const reloaded = await loadStore()

    expect(reloaded.getExecutionMode('session-a')).toBe('plan')
    reloaded.setExecutionMode('session-a', 'normal')

    vi.resetModules()
    expect((await loadStore()).getExecutionMode('session-a')).toBe('normal')
  })

  it('moves a draft mode onto the durable chat created by its first send', async () => {
    const store = await loadStore()
    store.setExecutionMode('profile-a:draft:main', 'plan')

    store.migrateDraftExecutionModeToSession(
      'profile-a:draft:main',
      'profile-a',
      'stored-session-a'
    )

    expect(store.getExecutionMode('profile-a:session:stored-session-a')).toBe('plan')
    expect(store.getExecutionMode('profile-a:draft:main')).toBe('normal')
  })

  it('does not migrate a draft onto another profile chat', async () => {
    const store = await loadStore()
    store.setExecutionMode('profile-a:draft:main', 'plan')

    store.migrateDraftExecutionModeToSession(
      'profile-a:draft:main',
      'profile-b',
      'stored-session-b'
    )

    expect(store.getExecutionMode('profile-a:draft:main')).toBe('plan')
    expect(store.getExecutionMode('profile-b:session:stored-session-b')).toBe('normal')
  })
})
