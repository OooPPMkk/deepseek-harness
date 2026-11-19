/**
 * Local build update record rendered by the sidebar's release-notes dialog.
 *
 * Entries are curated by hand rather than derived from Git: the sidebar shows
 * product changes a reader recognises, one entry per calendar day, and each
 * change keeps the wall-clock time it landed. Adding a change appends an item
 * to that day's entry; a new day prepends an entry.
 */

/** One sentence pair, authored in both baseline locales. */
export interface ReleaseNoteText {
  /** Simplified Chinese copy. */
  readonly zh: string
  /** English copy. */
  readonly en: string
}

/** One change within a day. */
export interface ReleaseNoteItem {
  /** Local wall-clock time on the entry's date, `HH:MM`. */
  readonly time: string
  /** One-line summary of what changed. */
  readonly title: ReleaseNoteText
  /** What the change does and what it affects. */
  readonly detail: ReleaseNoteText
}

/** Every change that landed on one calendar day. */
export interface ReleaseNoteEntry {
  /** Calendar date, `YYYY-MM-DD`. */
  readonly date: string
  /** The day's overall theme, shown in the entry list. */
  readonly title: ReleaseNoteText
  /** Changes in ascending time order. */
  readonly items: readonly ReleaseNoteItem[]
}

/**
 * Read one authored sentence in the reader's language.
 * @param text - Sentence authored in both baseline locales.
 * @param locale - Active locale id; any language beyond Chinese reads English.
 * @returns The sentence to render.
 */
export function releaseNoteText(text: ReleaseNoteText, locale: string): string {
  return locale.startsWith('zh') ? text.zh : text.en
}

/** Published record, newest day first. */
export const RELEASE_NOTES: readonly ReleaseNoteEntry[] = [
  {
    date: '2026-11-18',
    title: { zh: '思考偏好、修复与本地配色', en: 'Reasoning preference, a fix, and local color' },
    items: [
      {
        time: '10:40',
        title: { zh: '新增「思考内容」偏好', en: 'New reasoning disclosure preference' },
        detail: {
          zh: '设置 → 偏好新增「思考内容」，可选默认收起或默认展开。选默认展开时，推理正文随生成直接展开，不必每次手动点开。',
          en: 'Settings → Preferences gains a Thinking Content row: keep reasoning collapsed or open it by default. With the expanded choice the reasoning body streams open instead of waiting for a click.',
        },
      },
      {
        time: '14:45',
        title: { zh: '修复设置点了又回退', en: 'Fixed a preference that flashed and reverted' },
        detail: {
          zh: 'Host 的插件配置在进程启动时载入，运行中的旧进程不认识新增字段，写入被校验拒绝后视图回落到默认值。重启 Host 后写入正常，并补了覆盖落盘的回归测试。',
          en: 'The Host loads plugin configuration when its process starts, so a process started before the field existed rejected the write and the view fell back to the default. A restarted Host persists it, and a regression test now covers the persisted value.',
        },
      },
      {
        time: '15:05',
        title: { zh: '本地构建旁新增更新记录入口', en: 'Update record beside the local build badge' },
        detail: {
          zh: '左上角本地构建右侧的图标打开更新记录：左栏按日期列出，右栏显示当天每条改动及其时间点。',
          en: 'An icon beside the local build badge opens this record: dates on the left, the selected day\u2019s changes and their times on the right.',
        },
      },
      {
        time: '15:30',
        title: { zh: '浅色转蓝、深色转紫', en: 'Azure in light, violet in dark' },
        detail: {
          zh: '在主题之上加了一层本地覆盖：浅色把画布和侧栏压成淡蓝白，深色把底色换成带紫的深灰，链接、焦点环、选中态和导航强调跟随主题色。大面积只带 4–8% 彩度，饱和色只出现在小面积，主按钮、提示条和遮罩保留中性色做锚点，避免整屏单一色相。删掉这一层即可还原原配色。',
          en: 'A local override layer sits on top of the theme: light pushes the canvas and sidebar toward blue-white, dark moves the base to a violet-tinted grey, and links, focus ring, selection and nav accents follow that hue. Large surfaces carry only 4\u20138% chroma, saturated ink stays on small area, and primary buttons, toasts and masks keep neutral fills as anchors so no screen fills with a single hue. Deleting the layer restores the original palette.',
        },
      },
    ],
  },
  {
    date: '2026-11-17',
    title: { zh: '过程分组与逐项耗时', en: 'Grouped process and per-step timing' },
    items: [
      {
        time: '16:30',
        title: { zh: '思考与工具调用改为过程分组', en: 'Reasoning and tool calls grouped per process' },
        detail: {
          zh: '一轮过程按组折叠展示，组头说明这一组做了什么，工具结果默认可见。',
          en: 'A turn\u2019s process folds by group: the header says what the group did, and tool results stay visible.',
        },
      },
      {
        time: '17:10',
        title: { zh: '耗时改为逐项显示', en: 'Timing moved to individual steps' },
        detail: {
          zh: '去掉与总用时重复的分组耗时，改为在每个思考分项上显示各自耗时。',
          en: 'The group duration that repeated the total is gone; each reasoning step now states its own duration.',
        },
      },
      {
        time: '18:00',
        title: { zh: '中文思考引导', en: 'Chinese reasoning guidance' },
        detail: {
          zh: '人设后缀要求用中文推理，新会话首轮即生效，无需再手动提示。',
          en: 'The persona suffix asks for Chinese reasoning, so the first turn of a new session reasons in Chinese without a manual prompt.',
        },
      },
    ],
  },
]
