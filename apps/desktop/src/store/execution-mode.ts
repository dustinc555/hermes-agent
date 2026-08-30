import { atom } from 'nanostores'

export type ExecutionMode = 'normal' | 'plan'
export type ExecutionModeOwner =
  | string
  | { profile?: string; targetProfile?: string }
  | null
  | undefined

const STORAGE_KEY = 'hermes.desktop.executionModes.v1'

function loadExecutionModes(): Record<string, ExecutionMode> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, ExecutionMode] => Boolean(entry[0]) && entry[1] === 'plan'
      )
    )
  } catch {
    return {}
  }
}

function persistExecutionModes(modes: Record<string, ExecutionMode>): void {
  try {
    const plans = Object.fromEntries(Object.entries(modes).filter(([, mode]) => mode === 'plan'))

    if (Object.keys(plans).length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Renderer storage can be unavailable in isolated tests or privacy modes.
  }
}

export const $executionModes = atom<Record<string, ExecutionMode>>(loadExecutionModes())

export function executionModeSessionKey(profile: string, storedId: string): string {
  return `${profile || 'default'}:session:${storedId}`
}

export function executionModeDraftKey(profile: string, composerTarget: string): string {
  return `${profile || 'default'}:draft:${composerTarget || 'main'}`
}

export function executionModeOwnerProfile(owner: ExecutionModeOwner): string {
  if (typeof owner === 'string') {
    return owner.trim() || 'default'
  }

  return owner?.profile?.trim() || owner?.targetProfile?.trim() || 'default'
}

export function migrateDraftExecutionModeToSession(
  sourceKey: string | undefined,
  profile: string,
  storedId: string
): void {
  const normalizedProfile = profile || 'default'

  if (!sourceKey?.startsWith(`${normalizedProfile}:draft:`)) {
    return
  }

  migrateExecutionMode(sourceKey, executionModeSessionKey(normalizedProfile, storedId))
}

export function getExecutionMode(key: string): ExecutionMode {
  return $executionModes.get()[key] === 'plan' ? 'plan' : 'normal'
}

export function setExecutionMode(key: string, mode: ExecutionMode): void {
  if (!key) {
    return
  }

  const current = $executionModes.get()
  const next = { ...current }

  if (mode === 'plan') {
    next[key] = 'plan'
  } else {
    delete next[key]
  }

  $executionModes.set(next)
  persistExecutionModes(next)
}

export function migrateExecutionMode(fromKey: string, toKey: string): void {
  if (!fromKey || !toKey || fromKey === toKey) {
    return
  }

  const current = $executionModes.get()
  const next = { ...current }
  const mode = current[fromKey]

  delete next[fromKey]

  if (mode === 'plan') {
    next[toKey] = 'plan'
  }

  $executionModes.set(next)
  persistExecutionModes(next)
}
