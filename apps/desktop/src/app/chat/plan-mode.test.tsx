import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { setExecutionMode } from '@/store/execution-mode'

import {
  planModeKey,
  PlanModeIndicator,
  shouldCapturePlanTab,
  useExecutionMode,
  withExecutionModeSnapshot
} from './plan-mode'

afterEach(cleanup)

describe('core Plan Mode chat UI', () => {
  it('repaints immediately when bare Tab updates the external mode store', () => {
    const key = 'default:draft:mode-repaint-test'
    const Harness = () => (useExecutionMode(key, null) === 'plan' ? <PlanModeIndicator /> : null)

    setExecutionMode(key, 'normal')
    render(<Harness />)
    expect(screen.queryByRole('status', { name: 'Plan Mode on' })).toBeNull()

    act(() => setExecutionMode(key, 'plan'))
    expect(screen.getByRole('status', { name: 'Plan Mode on' })).not.toBeNull()

    act(() => setExecutionMode(key, 'normal'))
  })

  it('keys durable chats by stored id and fresh chats by composer surface', () => {
    expect(planModeKey('profile-a', 'stored-1', 'main')).toBe('profile-a:session:stored-1')
    expect(planModeKey('profile-a', null, 'tile:new-a')).toBe('profile-a:draft:tile:new-a')
  })

  it('preserves an immutable queued Plan snapshot after the chat toggles Normal', () => {
    expect(
      withExecutionModeSnapshot(
        { executionMode: 'plan', fromQueue: true },
        'normal',
        'default:session:stored-a'
      )
    ).toMatchObject({ executionMode: 'plan', fromQueue: true })
  })


  it('captures only bare Tab from the focused chat composer', () => {
    const surface = document.createElement('div')
    surface.dataset.chatSurface = ''
    const editor = document.createElement('div')
    editor.dataset.slot = 'composer-rich-input'
    surface.append(editor)
    document.body.append(surface)

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    Object.defineProperty(event, 'target', { value: editor })

    expect(shouldCapturePlanTab(event, surface, true)).toBe(true)
    expect(shouldCapturePlanTab(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }), surface, true)).toBe(false)
    expect(shouldCapturePlanTab(event, surface, false)).toBe(false)
  })

  it('captures bare Tab when Chromium leaves focus on the document body', () => {
    const surface = document.createElement('div')
    surface.dataset.chatSurface = ''
    document.body.append(surface)
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    Object.defineProperty(event, 'target', { value: document.body })

    expect(shouldCapturePlanTab(event, surface, true)).toBe(true)
  })

  it('does not steal Tab from terminal, dialogs, or ordinary controls', () => {
    const surface = document.createElement('div')
    const targets = ['textarea', 'button', 'select']

    for (const tag of targets) {
      const target = document.createElement(tag)
      surface.replaceChildren(target)
      const event = new KeyboardEvent('keydown', { key: 'Tab' })
      Object.defineProperty(event, 'target', { value: target })
      expect(shouldCapturePlanTab(event, surface, true)).toBe(false)
    }

    const terminal = document.createElement('div')
    terminal.dataset.terminal = ''
    surface.replaceChildren(terminal)
    const terminalEvent = new KeyboardEvent('keydown', { key: 'Tab' })
    Object.defineProperty(terminalEvent, 'target', { value: terminal })
    expect(shouldCapturePlanTab(terminalEvent, surface, true)).toBe(false)
  })

  it('renders an unboxed PLAN indicator for the composer controls', () => {
    render(<PlanModeIndicator />)

    const indicator = screen.getByRole('status', { name: 'Plan Mode on' })
    expect(indicator.textContent).toBe('PLAN')
    expect(indicator.getAttribute('data-slot')).toBe('plan-mode-indicator')
    expect(indicator.className).not.toContain('border')
    expect(indicator.className).not.toContain('rounded')
    expect(screen.queryByText('PLAN MODE ON')).toBeNull()
  })
})
