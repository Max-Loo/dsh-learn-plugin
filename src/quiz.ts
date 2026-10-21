import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-user-questions'
import { defineTool } from '@deepseek-ai/dsh-tools'

/**
 * dsh-learn-plugin quiz — the graded-question tool ported from pi's `learn` extension.
 *
 * execute() validates the call, shuffles the options (Fisher–Yates, on by
 * default), appends the automatic "I don't know" option, asks through the
 * userQuestions seam (blocking until answered), grades by option `value` with
 * exact set matching, and returns a structured result. The shuffled display
 * order and the feedback ride in `presentationMeta` so the Web card and the
 * lesson-log can replay what the user actually saw.
 *
 * Anti-leak: before the user answers, nothing user-visible may show
 * `correctAnswer` or `explanation` — `presentCall` carries the question only,
 * and the Web client view (client/index.js) never renders raw args.
 */

export const inject = ['tools', 'userQuestions']

export const DONT_KNOW_LABEL = "I don't know"

export interface QuizOptionInput {
  value: string
  label?: string
  description?: string
}

/** What a listener receives when a question goes out (no answer inside). */
export interface QuizAskedEvent {
  phase: 'asked'
  callId: string
  sessionId: string
  question: string
  displayedOptions: { value: string; label: string }[]
  multiSelect: boolean
}

/** What a listener receives when the graded result settles. */
export type QuizSettledEvent = Omit<QuizAskedEvent, 'phase'> & {
  phase: 'settled'
  status: 'correct' | 'incorrect' | 'dontKnow'
  answers: string[]
  customAnswer?: string
  correct: boolean
  dontKnow: boolean
  correctIndices: number[]
  correctAnswer: string[]
  explanation: string
}

export type QuizEvent = QuizAskedEvent | QuizSettledEvent

type QuizListener = (event: QuizEvent) => void
const listeners = new Set<QuizListener>()

/** Subscribe to quiz lifecycle events (used by the lesson-log mirror). */
export function onQuizEvent(listener: QuizListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(event: QuizEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event)
    } catch {
      // A misbehaving listener must not break the quiz flow.
    }
  }
}

/** Fisher–Yates shuffle on a copy. */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = copy[i] as T
    const b = copy[j] as T
    copy[i] = b
    copy[j] = a
  }
  return copy
}

class ValidationError extends Error {}

function asCorrectValues(raw: unknown): string[] {
  if (typeof raw === 'string') return [raw]
  if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) return [...raw]
  throw new ValidationError('correctAnswer must be an option value or an array of option values')
}

/** Safely pull the question text out of loose (index-signature) call args. */
function questionFromArgs(args: { [key: string]: unknown }): string {
  return typeof args.question === 'string' && args.question.trim() !== '' ? args.question : 'Quiz question'
}

interface NormalizedCall {
  question: string
  options: { value: string; label: string; description?: string }[]
  correctValues: string[]
  explanation: string
  shuffle: boolean
  multiSelect: boolean
  header?: string
}

/** Validate and normalize the model's (loosely typed) arguments; throws answer-free errors. */
function normalize(raw: { [key: string]: unknown }): NormalizedCall {
  if (typeof raw.question !== 'string' || raw.question.trim() === '') {
    throw new ValidationError('question must be a non-empty string')
  }
  if (!Array.isArray(raw.options)) throw new ValidationError('options must be an array')
  const rawOptions = raw.options as unknown[]
  const legal: string[] = []
  if (rawOptions.length < 2) {
    throw new ValidationError(`quiz requires at least 2 options (got ${rawOptions.length})`)
  }
  const seenValues = new Set<string>()
  const seenLabels = new Set<string>()
  const options = rawOptions.map((item, index) => {
    if (typeof item !== 'object' || item === null) throw new ValidationError(`options[${index}] must be an object`)
    const option = item as { value?: unknown; label?: unknown; description?: unknown }
    if (typeof option.value !== 'string' || option.value === '') {
      throw new ValidationError(`options[${index}].value must be a non-empty string`)
    }
    const value = option.value
    const label =
      typeof option.label === 'string' && option.label.trim() !== '' ? option.label.trim() : value
    if (seenValues.has(value)) throw new ValidationError(`quiz option values must be unique; duplicate value "${value}"`)
    if (seenLabels.has(label)) throw new ValidationError(`quiz option labels must be unique after resolution; duplicate label "${label}"`)
    if (label === DONT_KNOW_LABEL) {
      throw new ValidationError(`quiz options must not use the reserved label "${DONT_KNOW_LABEL}"; it is appended automatically`)
    }
    seenValues.add(value)
    seenLabels.add(label)
    legal.push(value)
    return {
      value,
      label,
      ...(typeof option.description === 'string' && option.description !== '' ? { description: option.description } : {}),
    }
  })
  const correctValues = asCorrectValues(raw.correctAnswer)
  if (correctValues.length === 0) {
    throw new ValidationError('quiz correctAnswer must name at least one option value')
  }
  const seenCorrect = new Set<string>()
  for (const value of correctValues) {
    if (!legal.includes(value)) {
      throw new ValidationError(`quiz correctAnswer "${value}" does not match any option value; legal values: ${legal.join(', ')}`)
    }
    if (seenCorrect.has(value)) throw new ValidationError(`quiz correctAnswer repeats value "${value}"`)
    seenCorrect.add(value)
  }
  const multiSelect = raw.multiSelect === true
  if (!multiSelect && correctValues.length > 1) {
    throw new ValidationError(`quiz is single-select but correctAnswer lists ${correctValues.length} values; pass multiSelect: true or one value`)
  }
  if (typeof raw.explanation !== 'string' || raw.explanation.trim() === '') {
    throw new ValidationError('quiz explanation is required (shown after the user answers)')
  }
  const header = typeof raw.header === 'string' && raw.header.trim() !== '' ? raw.header.trim() : undefined
  return {
    question: raw.question,
    options,
    correctValues,
    explanation: raw.explanation,
    shuffle: raw.shuffle !== false,
    multiSelect,
    ...(header !== undefined ? { header } : {}),
  }
}

function feedbackText(meta: {
  status: string
  question: string
  answers: string[]
  correctAnswer: string[]
  explanation: string
  dontKnow: boolean
}): string {
  const verdict =
    meta.dontKnow ? "I don't know (genuine knowledge gap, not a wrong guess)" : meta.status === 'correct' ? 'Correct ✓' : 'Incorrect ✗'
  const lines = [
    `Quiz result: ${verdict}`,
    `Question: ${meta.question}`,
    `Your answer: ${meta.answers.length > 0 ? meta.answers.join(', ') : '—'}`,
    `Correct answer: ${meta.correctAnswer.join(', ')}`,
    `Explanation: ${meta.explanation}`,
  ]
  return lines.join('\n')
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'quiz',
    description:
      'Ask the user ONE graded multiple-choice question and block until they answer. ' +
      'Main session only — a subagent call fails; return the question to the parent instead. ' +
      'Give each option a stable `value` and set `correctAnswer` to that value (not a position); ' +
      'grading matches the exact set of values. Options are shuffled by default (pass shuffle: false only when order carries meaning). ' +
      '"I don\'t know" is appended automatically and reported as dontKnow — a genuine knowledge gap, distinct from a wrong guess. ' +
      'explanation is required and shown only after the user answers.',
    parameters: {
      question: { type: 'string', required: true, description: 'The single question to ask.' },
      options: {
        type: 'array',
        required: true,
        description: '2–6 answer options; each carries a stable unique `value`.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            value: { type: 'string', required: true, description: 'Stable identifier used by correctAnswer.' },
            label: { type: 'string', description: 'Shown text; defaults to the value.' },
            description: { type: 'string', description: 'Optional helper text shown under the label.' },
          },
        },
      },
      correctAnswer: {
        oneOf: [
          { type: 'string', description: 'The correct option value (single-select).' },
          { type: 'array', items: { type: 'string' }, description: 'The complete correct value set (multi-select).' },
        ],
        required: true,
        description: 'The correct answer as option value(s), never a position.',
      },
      explanation: { type: 'string', required: true, description: 'Why the answer is correct; shown after the user answers.' },
      shuffle: { type: 'boolean', description: 'Randomize option order (default true).' },
      multiSelect: { type: 'boolean', description: 'Allow selecting a set of answers (default false).' },
      header: { type: 'string', description: 'Optional short card heading for the question.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          question: { type: 'string', required: true },
          answers: { type: 'array', required: true, items: { type: 'string' } },
          correctAnswer: { type: 'array', required: true, items: { type: 'string' } },
          correctIndices: { type: 'array', required: true, items: { type: 'integer' } },
          correct: { type: 'boolean', required: true },
          dontKnow: { type: 'boolean', required: true },
          explanation: { type: 'string', required: true },
          displayedOptions: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                value: { type: 'string', required: true },
                label: { type: 'string', required: true },
              },
            },
          },
          customAnswer: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: feedbackText(value) }],
      presentationMeta: (_args, value) => value,
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Quiz',
      kind: 'other',
      // Question only — never rawInput/correctAnswer/explanation: the user has
      // not answered yet.
      content: [{ type: 'text', text: questionFromArgs(args) }],
    }),
    presentResult: (_args, result) => {
      if (result.isError) return undefined
      const meta = result.meta as QuizSettledEvent | undefined
      if (meta === undefined || typeof meta !== 'object' || typeof meta.explanation !== 'string') return undefined
      return {
        card: 'generic',
        title: `Quiz — ${meta.dontKnow ? 'I don\u2019t know' : meta.correct ? 'Correct ✓' : 'Incorrect ✗'}`,
        kind: 'other',
        content: [{ type: 'text', text: feedbackText(meta) }],
      }
    },
    async execute(args, exec) {
      let call: NormalizedCall
      try {
        call = normalize(args)
      } catch (error) {
        if (error instanceof ValidationError) throw new Error(`quiz: ${error.message}`)
        throw error
      }
      const displayed = call.shuffle ? shuffled(call.options) : [...call.options]
      const callId = exec.callId
      const sessionId = exec.agent?.session?.id ?? 'unknown'
      const base = {
        callId,
        sessionId,
        question: call.question,
        displayedOptions: displayed.map((option) => ({ value: option.value, label: option.label })),
        multiSelect: call.multiSelect,
      }
      notify({ phase: 'asked', ...base })

      let answers: { id: string; selected: string[]; custom?: string }[]
      try {
        const result = await ctx.userQuestions.ask({
          questions: [
            {
              id: 'quiz',
              question: call.question,
              ...(call.header !== undefined ? { header: call.header } : {}),
              options: [
                ...displayed.map((option) => ({
                  label: option.label,
                  ...(option.description !== undefined ? { description: option.description } : {}),
                })),
                { label: DONT_KNOW_LABEL },
              ],
              multiSelect: call.multiSelect,
            },
          ],
          ...(exec.agent !== undefined ? { agent: exec.agent } : {}),
          signal: exec.signal,
          wait: { callId },
        })
        answers = result.answers
      } catch (error) {
        const code = (error as { code?: unknown }).code
        if (code === 'DELEGATED_CALLER' || code === 'CALLER_NOT_LIVE') {
          throw new Error(
            'quiz is only available in the main session: a subagent cannot open a human interaction. ' +
              'Return the question (not the answer) to the parent session and let it call quiz there.',
          )
        }
        if (code === 'NO_PROVIDER') {
          throw new Error('quiz is unavailable: no answer UI is connected. Ask the question as plain chat text instead.')
        }
        throw error
      }

      const first = answers[0]
      const selected = first?.selected ?? []
      const custom = first?.custom !== undefined && first.custom.trim() !== '' ? first.custom.trim() : undefined
      const dontKnow = selected.includes(DONT_KNOW_LABEL)
      const byLabel = new Map(displayed.map((option) => [option.label, option.value]))
      let effective = selected.filter((label) => label !== DONT_KNOW_LABEL).map((label) => byLabel.get(label) ?? label)
      let customAnswer: string | undefined
      if (custom !== undefined) {
        customAnswer = custom
        // Single-select custom text overrides the selection (platform rule).
        if (!call.multiSelect) effective = []
      }

      const correctSet = new Set(call.correctValues)
      const correct =
        !dontKnow &&
        (call.multiSelect
          ? effective.length === correctSet.size && effective.every((value) => correctSet.has(value))
          : effective.length === 1 && correctSet.has(effective[0] as string))
      const status: 'correct' | 'incorrect' | 'dontKnow' = dontKnow ? 'dontKnow' : correct ? 'correct' : 'incorrect'
      const correctIndices = displayed
        .map((option, index) => (correctSet.has(option.value) ? index : -1))
        .filter((index) => index >= 0)

      const value = {
        status,
        question: call.question,
        answers: effective,
        correctAnswer: [...call.correctValues],
        correctIndices,
        correct,
        dontKnow,
        explanation: call.explanation,
        displayedOptions: displayed.map((option) => ({ value: option.value, label: option.label })),
        ...(customAnswer !== undefined ? { customAnswer } : {}),
      }
      const settled: QuizSettledEvent = {
        ...base,
        ...value,
        phase: 'settled',
        ...(customAnswer !== undefined ? { customAnswer } : {}),
      }
      notify(settled)
      return value
    },
  }))
}
