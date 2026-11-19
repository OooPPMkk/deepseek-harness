/** Bind independent disclosure state to a Chat seat's reset source. */
import { useCallback, useState, useSyncExternalStore } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { UseDisclosure } from '../contract/slots.ts'

/** One explicit reader choice, valid only for the reset generation it was made in. */
interface ReaderChoice {
  readonly version: number
  readonly open: boolean
}

/**
 * Own one disclosure for a reset generation.
 *
 * A reader's explicit toggle wins for the current generation. Advancing the
 * generation — the enclosing Turn hiding its process — discards that choice and
 * restores the initial state, so a reopened group shows rows the way the caller
 * asked for rather than however the reader last left them.
 * @param version - reset generation; unchanged generations retain the reader's choice.
 * @param initiallyExpanded - whether the disclosure starts open while the reader has made no choice.
 * @returns the open state, an explicit setter, and a toggle action.
 */
function useVersionedDisclosure(version: number, initiallyExpanded: boolean): ReturnType<UseDisclosure> {
  const [choice, setChoice] = useState<ReaderChoice | null>(null)
  const expanded = choice !== null && choice.version === version ? choice.open : initiallyExpanded
  const setExpanded = useCallback((open: boolean) => {
    setChoice({ version, open })
  }, [version])
  const toggle = useCallback(() => {
    setChoice({ version, open: !expanded })
  }, [version, expanded])
  return { expanded, setExpanded, toggle }
}

/**
 * Own one disclosure without an enclosing Turn, for callers outside a Chat seat.
 * @param initiallyExpanded - whether the disclosure starts open while the reader has made no choice.
 * @returns the open state, an explicit setter, and a toggle action.
 */
export function useDisclosure(initiallyExpanded = false): ReturnType<UseDisclosure> {
  return useVersionedDisclosure(0, initiallyExpanded)
}

/**
 * Bind a Hook without subscribing until a component calls it.
 * @param reset - stable source whose version advances when the seat is hidden by its Turn.
 * @returns a Hook accepting the initial open state, with independent state for each invocation.
 */
export function bindDisclosure(reset: ObservableSnapshot<number>): UseDisclosure {
  const subscribe = (listener: () => void) => reset.subscribe(listener)
  const getSnapshot = () => reset.getSnapshot()
  return function useBoundDisclosure(initiallyExpanded = false) {
    const version = useSyncExternalStore(subscribe, getSnapshot)
    return useVersionedDisclosure(version, initiallyExpanded)
  }
}
