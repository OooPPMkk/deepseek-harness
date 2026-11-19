/** Two-pane local update record opened from the sidebar's local-build badge. */
import { useState } from 'react'
import clsx from 'clsx'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { RELEASE_NOTES, releaseNoteText, type ReleaseNoteEntry } from './release-notes.ts'
import css from './ReleaseNotesModal.module.css'

export interface ReleaseNotesModalProps {
  /** Whether the dialog is showing. */
  readonly open: boolean
  /** Application close command, Escape, or mask click. */
  readonly onClose: () => void
  /** Active locale id; entries read English outside Chinese. */
  readonly locale: string
  /** Sidebar namespace translator for this dialog's own copy. */
  readonly t: TranslateNS<'sidebar'>
}

/**
 * Show the local build's update record: days on the left, the selected day's
 * changes and their times on the right.
 * @param props - Open state, close command, active locale, and the sidebar translator.
 * @returns the dialog, or nothing while it is closed.
 */
export function ReleaseNotesModal({ open, onClose, locale, t }: ReleaseNotesModalProps) {
  const [selected, setSelected] = useState(RELEASE_NOTES[0]?.date ?? '')
  const entry = RELEASE_NOTES.find(candidate => candidate.date === selected) ?? RELEASE_NOTES[0]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('releaseNotes.title')}
      closeLabel={t('releaseNotes.close')}
      className={clsx(css.dialog)}
    >
      {entry === undefined
        ? <p className={css.empty}>{t('releaseNotes.empty')}</p>
        : (
          <div className={css.panes}>
            <nav className={css.listPane} aria-label={t('releaseNotes.entries')}>
              <ul className={css.list}>
                {RELEASE_NOTES.map(candidate => (
                  <li key={candidate.date}>
                    <button
                      type="button"
                      className={css.entryButton}
                      aria-current={candidate.date === entry.date ? 'true' : undefined}
                      data-modal-autofocus={candidate.date === entry.date ? true : undefined}
                      onClick={() => { setSelected(candidate.date) }}
                    >
                      <span className={css.entryTitle}>{releaseNoteText(candidate.title, locale)}</span>
                      <span className={css.entryDate}>{candidate.date}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <ReleaseNoteDetail entry={entry} locale={locale} />
          </div>
        )}
    </Modal>
  )
}

/**
 * Render one day's changes with each change's time.
 * @param props.entry - The day selected in the left column.
 * @param props.locale - Active locale id; entries read English outside Chinese.
 * @returns the detail pane.
 */
function ReleaseNoteDetail({ entry, locale }: { readonly entry: ReleaseNoteEntry; readonly locale: string }) {
  return (
    <section className={css.detailPane} aria-label={entry.date}>
      <header className={css.detailHeader}>
        <h3 className={css.detailTitle}>{releaseNoteText(entry.title, locale)}</h3>
        <span className={css.detailDate}>{entry.date}</span>
      </header>
      <ol className={css.items}>
        {entry.items.map(item => (
          <li key={item.time} className={css.item}>
            <div className={css.itemHead}>
              <time className={css.time} dateTime={`${entry.date}T${item.time}`}>{item.time}</time>
              <h4 className={css.itemTitle}>{releaseNoteText(item.title, locale)}</h4>
            </div>
            <p className={css.itemDetail}>{releaseNoteText(item.detail, locale)}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
