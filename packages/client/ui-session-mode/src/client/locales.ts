/** `sessionMode` namespace dictionaries (the composer mode selector's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'agent.name': '智能体',
  'agent.description': '默认行为，使用全部工具。',
  'plan.name': '计划',
  'plan.description': '先探索和设计，提交计划等待批准。',
  'ask.name': '问答',
  'ask.description': '只答疑不改动工作区，权限固定为仅可查看。',
  'debug.name': '调试',
  'debug.description': '先复现问题、收集证据，再提出修复。',
  'multitask.name': '并行',
  'multitask.description': '把相互独立的工作拆给并行的子代理。',
  'trigger.aria': '对话模式，当前：{name}',
  'trigger.title': '选择对话模式',
  'switchFailed': '切换对话模式失败',
} satisfies Record<string, string>

/** The sessionMode namespace key union. */
export type SessionModeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'agent.name': 'Agent',
  'agent.description': 'Default behavior with every tool available.',
  'plan.name': 'Plan',
  'plan.description': 'Explore and design first, then submit the plan for approval.',
  'ask.name': 'Ask',
  'ask.description': 'Answer questions without changing the workspace; permission stays read-only.',
  'debug.name': 'Debug',
  'debug.description': 'Reproduce the problem and gather evidence before proposing a fix.',
  'multitask.name': 'Multitask',
  'multitask.description': 'Split independent work across parallel subagents.',
  'trigger.aria': 'Collaboration mode, current: {name}',
  'trigger.title': 'Choose a collaboration mode',
  'switchFailed': 'Could not switch collaboration mode',
} satisfies Record<SessionModeKey, string>

/** Japanese dictionary, checked against the English keys. */
export const ja = {
  'agent.name': 'エージェント',
  'agent.description': 'すべてのツールを使う既定の動作です。',
  'plan.name': '計画',
  'plan.description': 'まず調査と設計を行い、計画を承認依頼として提出します。',
  'ask.name': '質問',
  'ask.description': 'ワークスペースを変更せずに答えます。権限は読み取り専用に固定されます。',
  'debug.name': 'デバッグ',
  'debug.description': 'まず問題を再現して証拠を集め、その後に修正案を出します。',
  'multitask.name': '並列',
  'multitask.description': '独立した作業を並列のサブエージェントに分割します。',
  'trigger.aria': '対話モード、現在：{name}',
  'trigger.title': '対話モードを選択',
  'switchFailed': '対話モードを切り替えられませんでした',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'agent.name': 'Agente',
  'agent.description': 'Comportamiento predeterminado con todas las herramientas disponibles.',
  'plan.name': 'Plan',
  'plan.description': 'Explora y diseña primero, luego envía el plan para su aprobación.',
  'ask.name': 'Consulta',
  'ask.description': 'Responde sin modificar el espacio de trabajo; el permiso sigue en solo lectura.',
  'debug.name': 'Depuración',
  'debug.description': 'Reproduce el problema y reúne pruebas antes de proponer una corrección.',
  'multitask.name': 'Multitarea',
  'multitask.description': 'Reparte el trabajo independiente entre subagentes en paralelo.',
  'trigger.aria': 'Modo de colaboración, actual: {name}',
  'trigger.title': 'Elegir un modo de colaboración',
  'switchFailed': 'No se pudo cambiar el modo de colaboración',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'agent.name': 'Agent',
  'agent.description': 'Comportement par défaut avec tous les outils disponibles.',
  'plan.name': 'Plan',
  'plan.description': "Explorez et concevez d'abord, puis soumettez le plan pour approbation.",
  'ask.name': 'Question',
  'ask.description': "Répond sans modifier l'espace de travail ; l'autorisation reste en lecture seule.",
  'debug.name': 'Débogage',
  'debug.description': 'Reproduisez le problème et rassemblez des preuves avant de proposer un correctif.',
  'multitask.name': 'Multitâche',
  'multitask.description': 'Répartit le travail indépendant entre des sous-agents parallèles.',
  'trigger.aria': 'Mode de collaboration, actuel : {name}',
  'trigger.title': 'Choisir un mode de collaboration',
  'switchFailed': 'Impossible de changer le mode de collaboration',
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'agent.name': 'Agent',
  'agent.description': 'Standardverhalten mit allen verfügbaren Werkzeugen.',
  'plan.name': 'Planen',
  'plan.description': 'Erst erkunden und entwerfen, dann den Plan zur Freigabe einreichen.',
  'ask.name': 'Frage',
  'ask.description': 'Antwortet ohne den Arbeitsbereich zu ändern; die Berechtigung bleibt schreibgeschützt.',
  'debug.name': 'Debuggen',
  'debug.description': 'Problem zuerst reproduzieren und Belege sammeln, dann eine Korrektur vorschlagen.',
  'multitask.name': 'Parallel',
  'multitask.description': 'Unabhängige Arbeit auf parallele Unteragenten aufteilen.',
  'trigger.aria': 'Zusammenarbeitsmodus, aktuell: {name}',
  'trigger.title': 'Zusammenarbeitsmodus wählen',
  'switchFailed': 'Der Zusammenarbeitsmodus konnte nicht gewechselt werden',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'agent.name': 'Агент',
  'agent.description': 'Поведение по умолчанию со всеми доступными инструментами.',
  'plan.name': 'План',
  'plan.description': 'Сначала исследование и проектирование, затем план на утверждение.',
  'ask.name': 'Вопрос',
  'ask.description': 'Отвечает, не изменяя рабочую область; разрешения остаются только на чтение.',
  'debug.name': 'Отладка',
  'debug.description': 'Сначала воспроизвести проблему и собрать данные, затем предложить исправление.',
  'multitask.name': 'Параллельно',
  'multitask.description': 'Разделить независимую работу между параллельными субагентами.',
  'trigger.aria': 'Режим совместной работы, текущий: {name}',
  'trigger.title': 'Выбрать режим совместной работы',
  'switchFailed': 'Не удалось переключить режим совместной работы',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'agent.name': 'Agente',
  'agent.description': 'Comportamento padrão com todas as ferramentas disponíveis.',
  'plan.name': 'Plano',
  'plan.description': 'Explore e projete primeiro; depois envie o plano para aprovação.',
  'ask.name': 'Pergunta',
  'ask.description': 'Responde sem alterar o espaço de trabalho; a permissão permanece somente leitura.',
  'debug.name': 'Depuração',
  'debug.description': 'Reproduza o problema e reúna evidências antes de propor uma correção.',
  'multitask.name': 'Multitarefa',
  'multitask.description': 'Divide o trabalho independente entre subagentes paralelos.',
  'trigger.aria': 'Modo de colaboração, atual: {name}',
  'trigger.title': 'Escolher um modo de colaboração',
  'switchFailed': 'Não foi possível alterar o modo de colaboração',
} satisfies Record<keyof typeof en, string>

/** Locale namespace owned by this package. */
export const SESSION_MODE_NS = 'sessionMode'
