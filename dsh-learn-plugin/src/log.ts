import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-session-query'
import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { onQuizEvent, type QuizSettledEvent } from './quiz.js'

/**
 * dsh-learn-plugin lesson-log — mirror a session to an existing markdown file
 * (Obsidian callout format), ported from pi's `md-log` extension.
 *
 * Mirrors only reading-relevant content: user text (quote), assistant prose
 * (abstract), and quiz / ask_user_question Q&A blocks. Quiz questions are
 * written BEFORE the user answers (through the quiz module's in-process
 * `asked` event, which carries the true post-shuffle display order and no
 * answer), and the graded verdict block is appended on tool/result, where the
 * persisted presentationMeta replays the same displayed order. Other tools
 * and system noise are never written.
 *
 * Links are keyed by session id in a durable storage-domain table, so a
 * restarted or resumed session restores its link automatically. New links
 * backfill the session's history through `ctx.sessionQuery`.
 */

export const inject = ['tools', 'commands', 'storageDomain', 'sessionQuery']

const linkRecord = z.object({
  file: z.string(),
  linkedAt: z.string(),
})

// Boundary cast: checking the full spec against defineDomain's zod generics
// trips TS2589 (excessively deep); the runtime value is identical.
const defineDomainUntyped = defineDomain as unknown as (spec: Record<string, unknown>) => unknown
const domainSpec = defineDomainUntyped({
  name: 'learn_dsh_lesson_log',
  version: 1,
  global: { schema: z.object({}), initial: {} },
  tables: { links: domainTable(linkRecord) },
})

const QA_TOOLS = new Set(['quiz', 'ask_user_question'])

// ---------------------------------------------------------------------------
// Formatting (callout structure ported from tmp/learn/extensions/md-log.ts)
// ---------------------------------------------------------------------------

function callout(type: string, title: string, bodyLines: string[]): string {
  const lines = [`> [!${type}] ${title}`]
  for (const line of bodyLines) {
    lines.push(line.length === 0 ? '>' : `> ${line}`)
  }
  return lines.join('\n')
}

function userBlock(text: string): string {
  return `> [!quote] YOU\n\n${text}`
}

function assistantBlock(text: string): string {
  return `> [!abstract] DSH\n\n${text}`
}

function questionCallout(label: string, question: string, options: Array<{ label: string }>): string {
  const body: string[] = [...question.split('\n')]
  if (options.length > 0) {
    body.push('')
    body.push(...options.map((option, index) => `${index + 1}. ${option.label}`))
  }
  return callout('question', label, body)
}

function answerCalloutQuiz(meta: QuizSettledEvent): string {
  const dontKnow = meta.dontKnow === true
  const correct = meta.correct === true
  const type = dontKnow ? 'question' : correct ? 'success' : 'failure'
  const title = dontKnow ? 'Quiz — I don’t know' : correct ? 'Quiz — correct ✓' : 'Quiz — incorrect ✗'
  const body: string[] = []
  if (dontKnow) {
    body.push('Your answer: I don’t know')
  } else {
    const selected = new Set(meta.answers)
    const labels = meta.displayedOptions
      .map((option, index) => ({ label: option.label, index, value: option.value }))
      .filter((option) => selected.has(option.value))
      .map((option) => `${option.index + 1}. ${option.label}`)
    body.push(`Your answer: ${labels.join(', ') || '(none)'}`)
  }
  const correctLabels = meta.correctIndices
    .map((index) => meta.displayedOptions[index])
    .map((option) => option?.label ?? '?')
  body.push(`Correct answer: ${correctLabels.join(', ')}`)
  if (meta.customAnswer !== undefined && meta.customAnswer !== '') {
    body.push('')
    body.push(`Note: ${meta.customAnswer}`)
  }
  if (meta.explanation) {
    body.push('')
    body.push(...meta.explanation.split('\n'))
  }
  return callout(type, title, body)
}

interface AskAnswer {
  id: string
  selected: string[]
  custom?: string
}

function answerCalloutAsk(answers: AskAnswer[], questions: Array<{ id: string; question: string }>): string {
  const byId = new Map(questions.map((question) => [question.id, question.question]))
  const body: string[] = []
  for (const answer of answers) {
    const question = byId.get(answer.id)
    if (question !== undefined && answers.length > 1) body.push(question)
    const parts = [...answer.selected]
    if (answer.custom !== undefined && answer.custom !== '') parts.push(answer.custom)
    body.push(parts.length > 0 ? `→ ${parts.join(', ')}` : '→ (skipped)')
  }
  if (body.length === 0) body.push('(no answer)')
  return callout('example', 'Answer', body)
}

function warningCallout(title: string, text: string): string {
  return callout('warning', title, text.split('\n'))
}

function restoreNoteBlock(file: string): string {
  return callout('note', 'lesson-log restored', [`Mirroring to this file resumed: ${path.basename(file)}`])
}

/** DSH skill catalogs / system reminders are injected context, not user prose. */
function cleanUserText(text: string): string {
  return text
    .replace(/<available_skills>[\s\S]*?<\/available_skills>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<skill_content[\s\S]*?<\/skill_content>/g, '')
    .trim()
}

function textOfContent(content: unknown): string[] {
  if (!Array.isArray(content)) return []
  return content
    .filter((block): block is { type: 'string'; text: string } => {
      if (typeof block !== 'object' || block === null) return false
      const candidate = block as { type?: unknown; text?: unknown }
      return candidate.type === 'text' && typeof candidate.text === 'string'
    })
    .map((block) => block.text)
}

// ---------------------------------------------------------------------------
// Event views (defensive: session events are frozen JSON, shapes may evolve)
// ---------------------------------------------------------------------------

interface EventView {
  seq: number
  type: string
  data: unknown
}

interface ToolCallView {
  callId: string
  name: string
  arguments: unknown
}

interface ToolResultView {
  callId: string
  content: unknown
  isError?: boolean
  meta?: unknown
}

function asToolCall(data: unknown): ToolCallView | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const view = data as { callId?: unknown; name?: unknown; arguments?: unknown }
  if (typeof view.callId !== 'string' || typeof view.name !== 'string') return undefined
  // The persisted surface carries `arguments` as a JSON string; tolerate an
  // already-parsed object too (synthetic appends, older formats).
  let args: unknown = view.arguments
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args) as unknown
    } catch {
      args = undefined
    }
  }
  return { callId: view.callId, name: view.name, arguments: args }
}

function asToolResult(data: unknown): ToolResultView | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const view = data as { message?: unknown; meta?: unknown }
  if (typeof view.message !== 'object' || view.message === null) return undefined
  const message = view.message as {
    callId?: unknown
    toolCallId?: unknown
    source?: unknown
    content?: unknown
    isError?: unknown
  }
  // Real surface events identify the call via message.source.callId and the
  // mirrored message.toolCallId; accept a top-level callId as fallback.
  const source = typeof message.source === 'object' && message.source !== null
    ? (message.source as { callId?: unknown })
    : undefined
  const callId =
    typeof message.callId === 'string' && message.callId !== ''
      ? message.callId
      : typeof message.toolCallId === 'string' && message.toolCallId !== ''
        ? message.toolCallId
        : typeof source?.callId === 'string' && source.callId !== ''
          ? source.callId
          : undefined
  if (typeof callId !== 'string') return undefined
  return {
    callId,
    content: message.content,
    isError: message.isError === true,
    ...(view.meta !== undefined ? { meta: view.meta } : {}),
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

interface LinkState {
  file: string
  lastSeq: number
}

export function apply(ctx: Context): void {
  const links = new Map<string, LinkState>()
  const knownUnlinked = new Set<string>()
  const askedQuiz = new Set<string>()
  const callMeta = new Map<string, { name: string; args: unknown }>()

  type LinkRecord = z.infer<typeof linkRecord>
  interface OpenedDomain {
    table(name: string): KvTable<string, LinkRecord>
    close(): Promise<void>
  }
  let table: KvTable<string, LinkRecord> | undefined
  const ready = (async () => {
    try {
      // The boundary cast keeps tsc out of the deep zod-generic inference of
      // Domain<S> (which exhausts the compiler heap); the runtime call goes
      // through the service proxy normally. The opened shape is exactly
      // `table('links')` over this spec.
      const storageDomain = ctx.storageDomain as unknown as { open: (spec: unknown) => Promise<OpenedDomain> }
      const domain = await storageDomain.open(domainSpec)
      ctx.effect(() => () => {
        void domain.close()
      }, 'dsh-learn-plugin-log: domainClose')
      table = domain.table('links') as KvTable<string, LinkRecord>
    } catch (error) {
      console.error(`dsh-learn-plugin lesson-log: storage domain failed: ${String(error)}`)
      ctx.logger.warn(`dsh-learn-plugin lesson-log: storage domain unavailable (${String(error)}); links will not persist`)
    }
  })()

  // Serialization: events can fire close together; keep appends ordered.
  let writeLock: Promise<unknown> = Promise.resolve()
  function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = writeLock.then(fn, fn)
    writeLock = run.then(
      () => undefined,
      () => undefined,
    )
    return run as Promise<T>
  }

  async function appendToFile(file: string, text: string): Promise<void> {
    try {
      let current = ''
      if (fs.existsSync(file)) current = await fsp.readFile(file, 'utf8')
      const prefix = current.trim().length > 0 ? '\n\n' : ''
      await fsp.writeFile(file, current + prefix + text + '\n', 'utf8')
    } catch (error) {
      ctx.logger.warn(`dsh-learn-plugin lesson-log: append to "${file}" failed: ${String(error)}`)
    }
  }

  async function linkFor(sessionId: string): Promise<LinkState | undefined> {
    if (links.has(sessionId)) return links.get(sessionId)
    if (table === undefined || knownUnlinked.has(sessionId)) return undefined
    const record = table.get(sessionId)
    if (record === undefined) {
      knownUnlinked.add(sessionId)
      return undefined
    }
    // Restore the link for a resumed session before mirroring continues.
    const state: LinkState = { file: record.file, lastSeq: 0 }
    links.set(sessionId, state)
    knownUnlinked.delete(sessionId)
    await appendToFile(record.file, restoreNoteBlock(record.file))
    return state
  }

  function askQuestionsOf(args: unknown): Array<{ id: string; question: string; options: Array<{ label: string }> }> {
    if (typeof args !== 'object' || args === null) return []
    const questions = (args as { questions?: unknown }).questions
    if (!Array.isArray(questions)) return []
    const views: Array<{ id: string; question: string; options: Array<{ label: string }> }> = []
    for (const item of questions) {
      if (typeof item !== 'object' || item === null) continue
      const view = item as { id?: unknown; question?: unknown; options?: unknown }
      if (typeof view.id !== 'string' || typeof view.question !== 'string') continue
      const options = Array.isArray(view.options)
        ? view.options
            .map((option) => (typeof option === 'object' && option !== null && typeof (option as { label?: unknown }).label === 'string' ? { label: (option as { label: string }).label } : undefined))
            .filter((option): option is { label: string } => option !== undefined)
        : []
      views.push({ id: view.id, question: view.question, options })
    }
    return views
  }

  /** Blocks for one replayed event; shared by live mirroring and backfill. */
  function blocksForEvent(event: EventView, source: 'live' | 'replay'): string[] {
    if (event.type === 'user/message') {
      if (typeof event.data !== 'object' || event.data === null) return []
      const data = event.data as { content?: unknown; source?: { kind?: unknown } }
      if (data.source !== undefined && data.source.kind !== undefined && data.source.kind !== 'user') return []
      const text = cleanUserText(textOfContent(data.content).join('\n'))
      return text === '' ? [] : [userBlock(text)]
    }
    if (event.type === 'assistant/message') {
      if (typeof event.data !== 'object' || event.data === null) return []
      const data = event.data as { message?: { content?: unknown } }
      const parts = textOfContent(data.message?.content).map((part) => part.trim()).filter((part) => part !== '')
      return parts.length === 0 ? [] : [assistantBlock(parts.join('\n\n'))]
    }
    if (event.type === 'tool/call') {
      const call = asToolCall(event.data)
      if (call === undefined) return []
      callMeta.set(call.callId, { name: call.name, args: call.arguments })
      // ask_user_question never shuffles: its args are the true display
      // order, safe to write live before the answer. quiz 题面 comes from
      // the quiz module's asked event instead (args carry the answer).
      if (call.name !== 'ask_user_question') return []
      return askQuestionsOf(call.arguments).map((question) => questionCallout('Question', question.question, question.options))
    }
    if (event.type === 'tool/result') {
      const result = asToolResult(event.data)
      if (result === undefined) return []
      const call = callMeta.get(result.callId)
      if (call === undefined || !QA_TOOLS.has(call.name)) return []
      if (call.name === 'quiz') {
        if (result.isError === true) {
          askedQuiz.add(result.callId)
          return [warningCallout('Quiz — not asked', textOfContent(result.content).join('\n') || 'quiz call failed')]
        }
        const meta = result.meta as QuizSettledEvent | undefined
        if (meta === undefined || typeof meta !== 'object' || !Array.isArray(meta.displayedOptions)) return []
        const blocks: string[] = []
        // On live mirroring the question was already written through the
        // quiz asked event; on replay (backfill) write it here from the
        // persisted displayed order.
        if (source === 'replay' || !askedQuiz.has(result.callId)) {
          blocks.push(questionCallout('Quiz', meta.question, meta.displayedOptions))
        }
        askedQuiz.add(result.callId)
        blocks.push(answerCalloutQuiz(meta))
        return blocks
      }
      // ask_user_question: answers JSON in the first text block.
      const text = textOfContent(result.content).join('\n')
      let answers: AskAnswer[] = []
      try {
        const parsed: unknown = JSON.parse(text)
        if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { answers?: unknown }).answers)) {
          answers = (parsed as { answers: AskAnswer[] }).answers
        }
      } catch {
        answers = []
      }
      return [answerCalloutAsk(answers, askQuestionsOf(call.args))]
    }
    return []
  }

  ctx.on('session/event', (session: { id: string; seq: number }, event: unknown) => {
    const view = event as { seq?: unknown; type?: unknown; data?: unknown }
    if (typeof view.seq !== 'number' || typeof view.type !== 'string') return
    const typed: EventView = { seq: view.seq, type: view.type, data: view.data }
    void withLock(async () => {
      await ready
      const link = await linkFor(session.id)
      if (link === undefined) return
      if (typed.seq <= link.lastSeq) return
      const blocks = blocksForEvent(typed, 'live')
      if (blocks.length === 0) return
      link.lastSeq = typed.seq
      for (const block of blocks) await appendToFile(link.file, block)
    })
  })

  // Quiz questions carry the post-shuffle display order and no answer —
  // written through this hook the moment the question goes out, before the
  // user answers.
  onQuizEvent((quizEvent) => {
    if (quizEvent.phase !== 'asked') return
    void withLock(async () => {
      await ready
      const link = await linkFor(quizEvent.sessionId)
      if (link === undefined) return
      if (askedQuiz.has(quizEvent.callId)) return
      askedQuiz.add(quizEvent.callId)
      await appendToFile(link.file, questionCallout('Quiz', quizEvent.question, quizEvent.displayedOptions))
    })
  })

  // -----------------------------------------------------------------------
  // Link / unlink (tool + user command share one implementation)
  // -----------------------------------------------------------------------

  async function linkSession(session: { id: string; seq: number; header: { cwd?: string; origin?: string } } | undefined, fileArg: string): Promise<string> {
    if (session === undefined) throw new Error('lesson_log requires a live session')
    if (session.header.origin === 'subagent') {
      throw new Error('lesson_log must be called from the main session, not a subagent')
    }
    const trimmed = fileArg.trim()
    if (trimmed === '') throw new Error('lesson_log requires a file path')
    await ready
    if (table === undefined) throw new Error('lesson_log unavailable: plugin storage did not start')
    const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(session.header.cwd ?? process.cwd(), trimmed)
    if (!fs.existsSync(resolved)) throw new Error(`File does not exist: ${resolved} (lesson_log links an existing note; create it first — it never creates files)`)
    if (!fs.statSync(resolved).isFile()) throw new Error(`Not a file: ${resolved}`)

    // Backfill the session history through the query channel.
    let backfilled = 0
    let lastSeq = 0
    try {
      const log = await ctx.sessionQuery.readSession(session.id as Parameters<typeof ctx.sessionQuery.readSession>[0])
      const blocks: string[] = []
      for (const event of log.events) {
        const block = blocksForEvent(event as EventView, 'replay')
        if (block.length > 0) backfilled += 1
        blocks.push(...block)
        lastSeq = Math.max(lastSeq, (event as { seq?: unknown }).seq === undefined ? 0 : (event as { seq: number }).seq)
      }
      if (blocks.length > 0) await appendToFile(resolved, blocks.join('\n\n'))
    } catch (error) {
      ctx.logger.warn(`dsh-learn-plugin lesson-log: backfill failed: ${String(error)}`)
    }
    await table.put(session.id, { file: resolved, linkedAt: new Date().toISOString() })
    links.set(session.id, { file: resolved, lastSeq })
    knownUnlinked.delete(session.id)
    return `Linked: ${resolved} (${backfilled} entries backfilled)`
  }

  async function unlinkSession(session: { id: string } | undefined): Promise<string> {
    if (session === undefined) throw new Error('lesson_unlog requires a live session')
    await ready
    const link = links.get(session.id)
    links.delete(session.id)
    knownUnlinked.add(session.id)
    if (table !== undefined) await table.delete(session.id)
    if (link === undefined) return 'No file linked'
    return `Unlinked: ${path.basename(link.file)}`
  }

  ctx.tools.register(defineTool({
    name: 'lesson_log',
    description:
      'Link an EXISTING markdown file as this session’s lesson log: the plugin mirrors user questions, teaching prose, and quiz/ask_user_question Q&A into it as Obsidian callouts (history is backfilled; the link survives restarts). ' +
      'The file must already exist — this tool never creates files, so a typo cannot scatter new notes. Main session only.',
    parameters: {
      file: { type: 'string', required: true, description: 'Path to an existing .md file (absolute, or relative to the session working directory).' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const file = typeof (args as { file?: unknown }).file === 'string' ? ((args as { file: string }).file) : ''
      return linkSession(exec.agent?.session as Parameters<typeof linkSession>[0], file)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'lesson_unlog',
    description: 'Stop mirroring this session to its linked lesson log (the link can be re-established later, possibly to a different file).',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      return unlinkSession(exec.agent?.session as Parameters<typeof unlinkSession>[0])
    },
  }))

  ctx.commands.register({
    name: 'lesson-log',
    description: 'Mirror this session to an existing markdown file (backfills history)',
    input: { hint: '<file>' },
    handler: async ({ agent, rawInput }) => {
      try {
        return { kind: 'success' as const, text: await linkSession(agent.session as Parameters<typeof linkSession>[0], rawInput) }
      } catch (error) {
        return { kind: 'error' as const, text: error instanceof Error ? error.message : String(error) }
      }
    },
  })

  ctx.commands.register({
    name: 'lesson-unlog',
    description: 'Stop mirroring this session to its lesson log',
    handler: async ({ agent }) => {
      try {
        return { kind: 'success' as const, text: await unlinkSession(agent.session as Parameters<typeof unlinkSession>[0]) }
      } catch (error) {
        return { kind: 'error' as const, text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}
