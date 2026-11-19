import { useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  IconAgentPresetOutlineRegular, IconBranchOutlineRegular, IconChevronDownOutlineRegular,
  IconLightOutlineRegular, IconPlanOutlineRegular, IconQuestionOutlineRegular, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the conversation-owned mode seat and the standard session
// projection hook into this package's Client face.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the `session-mode` projection key and the `plan` capability marker.
import type {} from '@deepseek-ai/dsh-session-mode/client'
import type {} from '@deepseek-ai/dsh-plan-mode/client'
import type { SessionModeKey } from './locales.ts'
import { SESSION_MODE_NS } from './locales.ts'
import css from './ModeSelect.module.css'

/** Mode id the empty recorded selection stands for; the default mode is recorded as `/mode off`. */
export const DEFAULT_SESSION_MODE = 'agent'

/**
 * Modes this selector offers. `plan` is a reserved id owned by `dsh-plan-mode`,
 * so its row appears only while that capability is composed. A deployment that
 * adds its own modes keeps them selectable through `/mode` and still sees the
 * current one named on the trigger.
 */
const BUILT_IN_MODES = [
  { id: 'agent', glyph: <IconAgentPresetOutlineRegular /> },
  { id: 'plan', glyph: <IconPlanOutlineRegular />, needsPlanMode: true },
  { id: 'ask', glyph: <IconQuestionOutlineRegular /> },
  { id: 'debug', glyph: <IconLightOutlineRegular /> },
  { id: 'multitask', glyph: <IconBranchOutlineRegular /> },
] as const

type BuiltInMode = (typeof BUILT_IN_MODES)[number]['id']

/** Business face injected by this package's slot registration. */
export interface ModeSelectInjected {
  /**
   * Submit one Session mode through the durable `/mode` command.
   * @param mode - mode id; the default mode is recorded as `/mode off`.
   * @returns whether the Session admitted the command.
   */
  select: (mode: string) => Promise<boolean>
}

/** Complete props derived from the conversation slot, injected face, and locale. */
export type ModeSelectProps =
  PropsRuntime<'conversation.input.mode'>
  & InjectFace<ModeSelectInjected>
  & PropsLocale<typeof SESSION_MODE_NS>

function nameKey(id: BuiltInMode): SessionModeKey {
  return `${id}.name`
}

function descriptionKey(id: BuiltInMode): SessionModeKey {
  return `${id}.description`
}

/** Host-configured mode ids outside the built-in set surface as their title-cased ids. */
function displayMode(id: string): string {
  return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
}

/**
 * Collaboration-mode selector over the host-computed `session-mode` projection.
 * Every mode keeps the same tool catalog and differs by prompt policy, so this
 * control records a `/mode` selection instead of swapping tools.
 */
export function ModeSelect({ locked, select, useProjection, t }: ModeSelectProps) {
  const projection = useProjection('session-mode')
  const plan = useProjection('plan')
  const [pick, setPick] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)

  // A locked composer or a withdrawn capability revokes the open menu rather
  // than leaving a choice that would act on stale host state.
  useEffect(() => {
    if (!locked && projection !== undefined) return
    setOpen(false)
  }, [locked, projection])

  if (projection === undefined) return null

  const current: string = pick ?? (projection.mode === '' ? DEFAULT_SESSION_MODE : projection.mode)
  const offered = BUILT_IN_MODES.filter(entry => !('needsPlanMode' in entry) || plan !== undefined)
  const known: (typeof BUILT_IN_MODES)[number] | undefined = offered.find(entry => entry.id === current)
  const currentLabel = known === undefined ? displayMode(current) : t(nameKey(known.id))
  const busy = pick !== null || projection.pending

  const items: MenuEntry[] = [
    // A deployment mode outside the built-in set still shows as the selected row.
    ...known === undefined ? [{ id: current, label: currentLabel }] : [],
    ...offered.map((entry): MenuEntry => ({
      id: entry.id,
      label: t(nameKey(entry.id)),
      icon: entry.glyph,
    })),
  ]

  const choose = (id: string): void => {
    setOpen(false)
    if (id === current) return
    setPick(id)
    setFailed(false)
    void select(id)
      .catch(() => false)
      .then((admitted) => {
        setPick(null)
        setFailed(!admitted)
      })
  }

  return (
    <>
      <Menu
        open={open}
        items={items}
        selectedId={current}
        onSelect={choose}
        onClose={() => { setOpen(false) }}
        side="top"
        portal
        anchor={
          <button
            type="button"
            className={css.trigger}
            aria-label={t('trigger.aria', { name: currentLabel })}
            title={known === undefined ? t('trigger.title') : t(descriptionKey(known.id))}
            disabled={locked || busy}
            onClick={() => { setOpen(!open) }}
          >
            <span className={css.triggerIcon} aria-hidden>
              {known === undefined ? <IconAgentPresetOutlineRegular /> : known.glyph}
            </span>
            <span className={css.triggerLabel}>{currentLabel}</span>
            <span className={clsx(css.chevron, open && css.chevronOpen)} aria-hidden>
              <IconChevronDownOutlineRegular />
            </span>
          </button>
        }
      />
      {failed && (
        <span className={css.error} role="status" title={t('switchFailed')}>{t('switchFailed')}</span>
      )}
    </>
  )
}
