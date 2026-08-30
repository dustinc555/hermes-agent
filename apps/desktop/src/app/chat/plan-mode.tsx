import { useCallback, useSyncExternalStore } from 'react'

import {
  $executionModes,
  type ExecutionMode,
  executionModeDraftKey,
  executionModeSessionKey
} from '@/store/execution-mode'

interface ExecutionModeSubmitOptions {
  executionMode?: ExecutionMode
  executionModeKey?: string
}

export function planModeKey(
  profile: string,
  storedId: string | null,
  composerTarget: string
): string {
  return storedId
    ? executionModeSessionKey(profile, storedId)
    : executionModeDraftKey(profile, composerTarget)
}

export function withExecutionModeSnapshot<T extends ExecutionModeSubmitOptions>(
  options: T | undefined,
  executionMode: ExecutionMode,
  executionModeKey: string
): T & Required<ExecutionModeSubmitOptions> {
  return {
    ...options,
    executionMode: options?.executionMode ?? executionMode,
    executionModeKey: options?.executionModeKey ?? executionModeKey
  } as T & Required<ExecutionModeSubmitOptions>
}

export function useExecutionMode(primaryKey: string, fallbackKey: string | null): ExecutionMode {
  const subscribe = useCallback(
    (notify: () => void) => $executionModes.listen(() => notify()),
    []
  )

  const getSnapshot = useCallback(() => {
    const modes = $executionModes.get()

    return modes[primaryKey] === 'plan' || (fallbackKey && modes[fallbackKey] === 'plan')
      ? 'plan'
      : 'normal'
  }, [fallbackKey, primaryKey])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const BLOCKED_TAB_TARGETS = [
  '[data-terminal]',
  'webview',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="dialog"]',
  '[data-slot="dialog-content"]',
  '[data-slot="settings-root"]',
].join(',')

export function shouldCapturePlanTab(
  event: KeyboardEvent,
  surface: HTMLElement,
  focused: boolean
): boolean {
  if (
    !focused ||
    event.key !== 'Tab' ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing
  ) {
    return false
  }

  const target = event.target

  if (!(target instanceof Element)) {
    return false
  }

  if (target.closest(BLOCKED_TAB_TARGETS)) {
    return false
  }

  if (target === document.body || target === document.documentElement) {
    return true
  }

  if (!surface.contains(target)) {
    return false
  }

  return Boolean(
    target.closest(
      '[data-slot="composer-rich-input"], [data-slot="aui_thread-viewport"], [data-chat-surface]'
    )
  )
}

export function PlanModeIndicator() {
  return (
    <div
      aria-label="Plan Mode on"
      className="pointer-events-none inline-flex h-(--composer-control-size) shrink-0 items-center px-1 font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-(--ui-purple)"
      data-slot="plan-mode-indicator"
      role="status"
    >
      PLAN
    </div>
  )
}
