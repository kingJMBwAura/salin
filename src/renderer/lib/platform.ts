import { api } from './api'

/**
 * True when the window has no native title bar and the app draws its own.
 *
 * Everything keyed off this — the drag strip and the traffic-light clearance —
 * exists to stand in for a title bar that isn't there. On Windows the real one
 * is, so all of it must switch off.
 */
export const IS_MAC = api.platform === 'darwin'

/** Vertical clearance for the traffic lights, or nothing off macOS. */
export const TOP_INSET = IS_MAC ? 'pt-9' : 'pt-4'
