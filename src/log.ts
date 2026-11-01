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

export const inject = ['tools', 'commands', 'storageDomain', 'sessionQuery', 'sessions', 'userQuestions']

const linkRecord = z.object({
  file: z.string(),
  linkedAt: z.string(),
  // v2: durable mirror watermark. Optional so v1 records (which lack it) stay
  // valid against this schema; the restore path backfills it (see linkFor).
  lastSeq: z.number().optional(),
  // Task 2.3 (design D3): set once the one-time restore note has landed, so a
  // repeat resume appends no second note. Optional — older v2 records without
  // it simply count as "not noted yet" and keep their pre-field behavior.
  restoredNotedAt: z.string().optional(),
})

/** The v1 record shape, for reading the legacy unit during migration. */
const linkRecordV1 = z.object({
  file: z.string(),
  linkedAt: z.string(),
})

// Task 2.2 (design D2): a record moved here on unlink keeps {file, lastSeq}
// so re-linking the SAME file resumes from the watermark instead of re-running
// the full backfill. A separate table (not a soft-delete flag) means the
// harden-lesson-log code never sees these rows at all, so a rollback cannot
// mistake an unlinked session for a live link.
const unlinkedRecord = z.object({
  file: z.string(),
  lastSeq: z.number(),
  unlinkedAt: z.string(),
})

// Boundary cast: checking the full spec against defineDomain's zod generics
// trips TS2589 (excessively deep); the runtime value is identical.
const defineDomainUntyped = defineDomain as unknown as (spec: Record<string, unknown>) => unknown

// Task 1.1 — migration path audit (design D4), settled empirically against
// `@deepseek-ai/dsh-storage-domain` 0.2.1-rc.2:
// 1. There is NO automatic migration hook — a stored unit whose stamped
//    version differs from the spec rejects at open with `version-mismatch`
//    (package README, "Known Limitations": "No data migration … changing a
//    schema requires migrating the stored data by hand").
// 2. `compatibleVersions` does NOT help here: the host json backend enforces
//    exact-version reads for `single`-layout whole-unit files (verified live:
//    opening this spec as version 2 over a version-1 unit rejected with
//    "stored version 1 != expected 2"), so a same-name v1→v2 upgrade cannot
//    open the legacy data at all — and a hard dual-open (open v1 spec, copy,
//    reopen v2 spec) fails the same way, because the version stamp lives on
//    the unit file itself.
// 3. Therefore D4's fallback is the chosen path: migrate by hand into a NEW
//    domain name (`_v2` suffix, version 2). On start the v2 domain opens
//    first; the legacy unit is then opened under its exact v1 spec, its
//    records are copied across, and it is closed but NEVER deleted — the
//    previous plugin version can still open it, so a rollback loses only the
//    new watermark and behaves exactly like the pre-upgrade build (design
//    D4's rollback semantics, satisfied literally).
const domainSpec = defineDomainUntyped({
  name: 'learn_dsh_lesson_log_v2',
  version: 2,
  global: { schema: z.object({}), initial: {} },
  // Task 1.2/design Migration Plan: the `unlinked` table and the optional
  // `restoredNotedAt` field evolve INSIDE the v2 domain (version stays 2) —
  // no data migration. Old v2 records without the new optional field open
  // unchanged; the new table simply starts empty in existing units.
  tables: { links: domainTable(linkRecord), unlinked: domainTable(unlinkedRecord) },
})

const legacyDomainSpec = defineDomainUntyped({
  name: 'learn_dsh_lesson_log',
  version: 1,
  global: { schema: z.object({}), initial: {} },
  tables: { links: domainTable(linkRecordV1) },
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
  const body: string[] = question.split('\n')
  if (options.length > 0) {
    body.push('')
    body.push(...options.map((option, index) => `${index + 1}. ${option.label}`))
  }
  return callout('question', label, body)
}

function answerCalloutQuiz(meta: QuizSettledEvent): string {
  const skipped = meta.skipped === true
  const dontKnow = meta.dontKnow === true
  const correct = meta.correct === true
  // Task 4.1 (design D5): a skipped panel (no option chosen, no custom text)
  // rides the dontKnow channel — never incorrect, no ✗ — and the title says
  // so, distinguishing it from an explicit "I don't know" answer.
  const type = skipped || dontKnow ? 'question' : correct ? 'success' : 'failure'
  const title = skipped
    ? 'Quiz — skipped'
    : dontKnow
      ? 'Quiz — I don’t know'
      : correct
        ? 'Quiz — correct ✓'
        : 'Quiz — incorrect ✗'
  const body: string[] = []
  if (skipped) {
    body.push('Your answer: (skipped — no answer given)')
  } else if (dontKnow) {
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
  linkedAt: string
  lastSeq: number
  /**
   * Blocks awaiting a successful append, in arrival order (task 2.2: a failed
   * write stays here and the watermark does not move until it lands).
   */
  pending: PendingWrite[]
  /** Consecutive failed append attempts; cleared on the next success. */
  failures: number
  /**
   * Task 2.3 (design D3): timestamp persisted after the one-time restore note
   * lands; a later resume with it set skips the note entirely.
   */
  restoredNotedAt?: string
  /**
   * Task 2.1 (design D1): placeholder-phase marker. While true, live events
   * for this session are staged instead of mirrored, and the restore path
   * (linkFor) is never entered — the fake-"restored"-note race cannot fire.
   */
  linking?: boolean
  /** Live items captured during the placeholder phase, in arrival order. */
  staging: StagedItem[]
}

type StagedItem =
  | { kind: 'event'; event: EventView }
  | { kind: 'quizAsked'; callId: string; question: string; displayedOptions: Array<{ value: string; label: string }> }

interface PendingWrite {
  /** Event seq this write is tied to; the watermark advances to it on success. */
  seq: number
  blocks: string[]
  /** Task 2.3: landing this write completes the one-time restore note. */
  restoreNote?: boolean
}

/** Consecutive append failures before the write problem is surfaced (design D2). */
const FAILURE_THRESHOLD = 3

/**
 * Task 3.1: dev-harness diagnostics key. The collections themselves are
 * parked on globalThis under this symbol while the plugin runs (NOT on ctx:
 * the cordis context is a service proxy and swallows unknown property
 * writes). Exported so the harness imports the SAME symbol object instead of
 * relying on cross-realm Symbol.for behavior. Not part of any runtime
 * behavior.
 */
export const LOG_DIAGNOSTICS_KEY = Symbol.for('dsh-learn-plugin.log.diagnostics')

/**
 * Task 2.1 (design D1 risk bound): staging cap for the link-establishment
 * window. Backfill reads are local and fast, so in practice this never
 * fills; if it does, the oldest staged block is dropped and a warning
 * callout is left in the log.
 */
const STAGING_LIMIT = 256

/**
 * Task 3.1 (design D4): FIFO cap for the mirror's in-process bookkeeping
 * collections (`callMeta`, `askedQuiz`, `knownUnlinked`). The mirror only
 * ever needs recent call context — a callId whose verdict already landed
 * (or whose session is long gone) has no pending block to decide.
 */
const FIFO_LIMIT = 1024

/** Per-link retry backoff timers, so a stalled mirror retries without new events. */
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function apply(ctx: Context): void {
  // Task 3.1 (design D4): `links` entries are removed when their session is
  // disposed (see the 'session/disposed' hook below); the other three
  // collections are FIFO-capped at FIFO_LIMIT on every insert.
  const links = new Map<string, LinkState>()
  const knownUnlinked = new Set<string>()
  const askedQuiz = new Set<string>()
  const callMeta = new Map<string, { name: string; args: unknown }>()
  // Task 3.2 (design D6): the persisted history is replay-searched at most
  // once per session per process — the first unmatched tool/result triggers
  // it; everything after that comes from memory (live tool/call events keep
  // callMeta fresh).
  const rebuiltSessions = new Set<string>()

  // Task 3.1: FIFO-bounded inserts. Updating an existing key only replaces
  // the value (Map/Set insertion order is untouched, so "oldest" stays
  // meaningful); exceeding the cap evicts the oldest member.
  function boundedAdd(set: Set<string>, value: string): void {
    if (!set.has(value)) {
      set.add(value)
      while (set.size > FIFO_LIMIT) {
        const oldest = set.values().next().value
        if (oldest === undefined) return
        set.delete(oldest)
      }
    }
  }
  function boundedSetMeta(callId: string, value: { name: string; args: unknown }): void {
    if (!callMeta.has(callId)) {
      callMeta.set(callId, value)
      while (callMeta.size > FIFO_LIMIT) {
        const oldest = callMeta.keys().next().value
        if (oldest === undefined) return
        callMeta.delete(oldest)
      }
    } else {
      callMeta.set(callId, value)
    }
  }

  // Task 3.1: dev-harness diagnostics — the same live collections exposed
  // under the exported well-known symbol so the harness can assert the
  // bounds. Not part of any runtime behavior.
  ;(globalThis as unknown as Record<symbol, unknown>)[LOG_DIAGNOSTICS_KEY] = { links, knownUnlinked, askedQuiz, callMeta }

  type LinkRecord = z.infer<typeof linkRecord>
  type UnlinkedRecord = z.infer<typeof unlinkedRecord>
  type LinkRecordV1 = z.infer<typeof linkRecordV1>
  interface OpenedDomain {
    table(name: string): KvTable<string, LinkRecord | UnlinkedRecord>
    close(): Promise<void>
  }
  let table: KvTable<string, LinkRecord> | undefined
  let unlinkedTable: KvTable<string, UnlinkedRecord> | undefined
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
      unlinkedTable = domain.table('unlinked') as KvTable<string, UnlinkedRecord>
    } catch (error) {
      console.error(`dsh-learn-plugin lesson-log: storage domain failed: ${String(error)}`)
      ctx.logger.warn(`dsh-learn-plugin lesson-log: storage domain unavailable (${String(error)}); links will not persist`)
      return
    }
    // Task 1.2 — one-time v1 migration (design D4 fallback): open the legacy
    // unit under its exact v1 spec, copy records the v2 table is missing, and
    // close it WITHOUT deleting it, so the previous plugin version can still
    // open it after a rollback. Copies carry no watermark; the restore path
    // (linkFor) backfills it from the persisted session history.
    try {
      const storageDomain = ctx.storageDomain as unknown as { open: (spec: unknown) => Promise<OpenedDomain> }
      const legacy = await storageDomain.open(legacyDomainSpec)
      try {
        const legacyLinks = legacy.table('links') as unknown as KvTable<string, LinkRecordV1>
        for (const [key, record] of legacyLinks.entries()) {
          if (table === undefined || table.get(key) !== undefined) continue
          await table.put(key, { file: record.file, linkedAt: record.linkedAt })
        }
      } finally {
        await legacy.close()
      }
    } catch (error) {
      // No legacy unit (fresh installs) or an unreadable one — either way the
      // v2 domain is authoritative and this is not a failure.
      ctx.logger.warn(`dsh-learn-plugin lesson-log: v1 migration skipped (${String(error)})`)
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

  // True append (task 2.1, design D1): one fsp.appendFile per write, never a
  // full-file read-modify-write — existing content is never rewritten,
  // reordered, or truncated, and a crashed write cannot destroy it. A
  // pre-write stat decides the blank-line separator (size 0 → treat the file
  // as empty → omit the leading "\n\n"). Failures propagate: the caller owns
  // watermark advancement and retry (task 2.2).
  async function appendToFile(file: string, text: string): Promise<void> {
    let size = 0
    try {
      size = (await fsp.stat(file)).size
    } catch {
      size = 0 // absent/unreadable → treat as empty; appendFile surfaces real errors
    }
    const prefix = size > 0 ? '\n\n' : ''
    await fsp.appendFile(file, prefix + text + '\n', 'utf8')
  }

  // Design D3/D5: after a successful append, persist the record (watermark
  // and restore-note flag) at once so a crash can only ever repeat one block,
  // never silently drop one.
  async function persistLinkRecord(sessionId: string, link: LinkState): Promise<void> {
    if (table === undefined) return
    try {
      await table.put(sessionId, {
        file: link.file,
        linkedAt: link.linkedAt,
        lastSeq: link.lastSeq,
        ...(link.restoredNotedAt !== undefined ? { restoredNotedAt: link.restoredNotedAt } : {}),
      })
    } catch (error) {
      ctx.logger.warn(`dsh-learn-plugin lesson-log: record persist failed for "${link.file}": ${String(error)}`)
    }
  }

  // Design D2: surface a stalled mirror — logger always; a session-visible
  // system notice when the sessions service can answer (headless runs keep
  // the log-only path). Notice source.kind ≠ 'user' so the mirror itself
  // never mirrors this warning.
  function reportWriteFailure(sessionId: string, link: LinkState, error: unknown): void {
    const detail = `${link.failures} consecutive appends to "${link.file}" failed; mirroring is paused and pending blocks will be appended in order once the file is writable again. Last error: ${String(error)}`
    ctx.logger.error(`dsh-learn-plugin lesson-log: ${detail}`)
    try {
      const session = ctx.sessions.get(sessionId as never)
      if (session === undefined) return
      session.append('user/message', {
        id: `lesson-log-write-failure-${Date.now()}`,
        role: 'user',
        content: [{ type: 'text', text: `lesson-log: ${detail}` }],
        source: { kind: 'dsh-learn-plugin', form: 'notice', summary: 'lesson-log write failure' },
      } as never, { surfaceOp: 'append' } as never)
    } catch {
      // No live session in this process — the logger.error above is the report.
    }
  }

  // Retry a stalled link after a backoff, without waiting for new events.
  function scheduleRetry(sessionId: string, link: LinkState): void {
    if (retryTimers.has(sessionId)) return
    const delay = Math.min(2000 * 2 ** Math.min(link.failures - 1, 4), 30000)
    const timer = setTimeout(() => {
      retryTimers.delete(sessionId)
      void withLock(async () => {
        await ready
        if (links.get(sessionId) !== link) return // unlinked or re-linked meanwhile
        await flushLink(sessionId, link)
      }).catch(() => {})
    }, delay)
    timer.unref?.()
    retryTimers.set(sessionId, timer)
  }

  // Task 2.2: drain a link's pending writes strictly in order. A failed head
  // stops the drain (ordering preserved), counts a failure, reports at the
  // threshold, and schedules a backoff retry; a success clears the flag,
  // advances the watermark to the write's seq, and persists it. A write
  // carrying `restoreNote` additionally flags the record (task 2.3), so the
  // note is written once per link even across restarts.
  async function flushLink(sessionId: string, link: LinkState): Promise<void> {
    while (link.pending.length > 0) {
      const head = link.pending[0]
      if (head === undefined) break
      try {
        for (const block of head.blocks) await appendToFile(link.file, block)
      } catch (error) {
        link.failures += 1
        if (link.failures >= FAILURE_THRESHOLD) reportWriteFailure(sessionId, link, error)
        scheduleRetry(sessionId, link)
        return
      }
      link.pending.shift()
      link.failures = 0
      if (head.restoreNote === true && link.restoredNotedAt === undefined) {
        // Task 2.3 (design D3): the note landed — flag and persist it so
        // every later resume skips the note.
        link.restoredNotedAt = new Date().toISOString()
        await persistLinkRecord(sessionId, link)
      }
      if (head.seq > link.lastSeq) {
        link.lastSeq = head.seq
        await persistLinkRecord(sessionId, link)
      }
    }
  }

  // Task 2.1 (design D1): capture one live item during the placeholder phase.
  // The cap drops the OLDEST staged block and leaves a warning callout in the
  // (already existing) log file — the window is millisecond-scale in practice,
  // so overflow means something is deeply wrong and the reader should know.
  async function stageItem(link: LinkState, item: StagedItem): Promise<void> {
    if (link.staging.length >= STAGING_LIMIT) {
      const dropped = link.staging.shift()
      const detail = dropped?.kind === 'event' ? ` (seq ${dropped.event.seq})` : ''
      try {
        await appendToFile(link.file, warningCallout(
          'lesson-log staging overflow',
          `The link was being established faster than its history could be read; the oldest staged block${detail} was dropped to stay within ${STAGING_LIMIT}.`,
        ))
      } catch {
        // The log file itself is unwritable; the staging queue is no worse off.
      }
    }
    link.staging.push(item)
  }

  // Task 2.1 (design D1): release the staged window in order after the link
  // goes live. Snapshot-covered events (seq ≤ backfill watermark) are skipped;
  // everything else replays through the same live paths. Quiz 题面 items honor
  // the askedQuiz marker with the same self-healing failure semantics as the
  // asked hook (a failed pre-write folds the question into the verdict block).
  async function releaseStaged(sessionId: string, link: LinkState): Promise<void> {
    const staged = link.staging
    link.staging = []
    for (const item of staged) {
      if (item.kind === 'quizAsked') {
        if (askedQuiz.has(item.callId)) continue
        try {
          await appendToFile(link.file, questionCallout('Quiz', item.question, item.displayedOptions))
        } catch (error) {
          ctx.logger.warn(`dsh-learn-plugin lesson-log: staged quiz pre-write failed (will be folded into the verdict block): ${String(error)}`)
          continue
        }
        boundedAdd(askedQuiz, item.callId)
        continue
      }
      const event = item.event
      if (event.seq <= link.lastSeq) continue
      const blocks = blocksForEvent(event, 'live')
      if (blocks.length === 0) {
        // Contentless events advance the in-memory boundary only (same rule
        // as the steady-state live path; a quiz call's watermark is persisted
        // because a restart must not re-ask its question).
        if (event.seq > link.lastSeq) {
          link.lastSeq = event.seq
          if (event.type === 'tool/call' && asToolCall(event.data)?.name === 'quiz') {
            await persistLinkRecord(sessionId, link)
          }
        }
        continue
      }
      link.pending.push({ seq: event.seq, blocks })
      await flushLink(sessionId, link)
    }
  }

  async function linkFor(sessionId: string): Promise<LinkState | undefined> {
    if (links.has(sessionId)) return links.get(sessionId)
    if (table === undefined || knownUnlinked.has(sessionId)) return undefined
    const record = table.get(sessionId)
    if (record === undefined) {
      boundedAdd(knownUnlinked, sessionId)
      return undefined
    }
    // Restore the link for a resumed session before mirroring continues
    // (design D5: the durable watermark is the ONLY replay boundary).
    // restoredNotedAt is copied onto the state so later record persists keep
    // the flag (dropping it would re-arm the note on the NEXT restart).
    const state: LinkState = {
      file: record.file,
      linkedAt: record.linkedAt,
      lastSeq: 0,
      pending: [],
      failures: 0,
      staging: [],
      ...(record.restoredNotedAt !== undefined ? { restoredNotedAt: record.restoredNotedAt } : {}),
    }
    links.set(sessionId, state)
    knownUnlinked.delete(sessionId)
    if (record.lastSeq === undefined) {
      // Task 1.2 — v1 record migration (design D4): v1 carried no watermark.
      // One-time backfill from the persisted history: the max event seq
      // becomes the initial watermark (skip what the tail of the last run
      // may have missed — v1's inherent gap — rather than re-mirror the whole
      // history). The history is already read here, so rebuilding the call
      // context (task 3.2) is free, and this session's one-shot replay-search
      // budget is spent with it.
      try {
        const log = await ctx.sessionQuery.readSession(sessionId as Parameters<typeof ctx.sessionQuery.readSession>[0])
        const events = log.events as EventView[]
        let maxSeq = 0
        for (const event of events) maxSeq = Math.max(maxSeq, typeof event.seq === 'number' ? event.seq : 0)
        state.lastSeq = maxSeq
        rebuildCallContextFromEvents(sessionId, events)
      } catch (error) {
        ctx.logger.warn(`dsh-learn-plugin lesson-log: v1 migration read failed for ${sessionId} (watermark stays 0): ${String(error)}`)
      }
      await persistLinkRecord(sessionId, state)
      rebuiltSessions.add(sessionId)
    } else {
      // v2 record: the durable watermark is trusted as-is; the one-shot
      // replay-search budget stays available for the first unmatched
      // tool/result (task 3.2) — a restarted process has an empty callMeta
      // and may need it for a cross-restart verdict.
      state.lastSeq = record.lastSeq
    }
    // Task 2.3 (design D3): the restore note rides the same pending queue and
    // is written ONCE per link — only when the record does not carry
    // restoredNotedAt yet. Once the note lands, flushLink flags the record and
    // persists it; every later resume skips straight to mirroring.
    if (record.restoredNotedAt === undefined) {
      state.pending.push({ seq: 0, blocks: [restoreNoteBlock(record.file)], restoreNote: true })
    }
    await flushLink(sessionId, state)
    return state
  }

  // Task 3.2 (design D6): rebuild {name, args} for persisted tool calls once
  // a restored session's first tool/result misses the in-memory callMeta.
  // quiz calls are also re-marked in askedQuiz — their 题面 was written by the
  // pre-restart process's asked hook, so a post-restart verdict must append
  // the verdict only, never a second question block.
  function rebuildCallContextFromEvents(_sessionId: string, events: EventView[]): void {
    for (const event of events) {
      if (event.type !== 'tool/call') continue
      const call = asToolCall(event.data)
      if (call === undefined) continue
      if (!callMeta.has(call.callId)) boundedSetMeta(call.callId, { name: call.name, args: call.arguments })
      if (call.name === 'quiz') boundedAdd(askedQuiz, call.callId)
    }
  }

  // The one-shot budget is spent only when the read log actually resolves the
  // target call: a partial read (persistence lag) keeps the budget so the
  // next unmatched result retries after the log catches up.
  async function rebuildCallContext(sessionId: string, targetCallId: string | undefined): Promise<boolean> {
    if (targetCallId !== undefined && callMeta.has(targetCallId)) return true
    if (rebuiltSessions.has(sessionId)) return false
    try {
      const log = await ctx.sessionQuery.readSession(sessionId as Parameters<typeof ctx.sessionQuery.readSession>[0])
      const events = log.events as EventView[]
      rebuildCallContextFromEvents(sessionId, events)
      if (targetCallId === undefined || callMeta.has(targetCallId)) rebuiltSessions.add(sessionId)
      return targetCallId === undefined || callMeta.has(targetCallId)
    } catch (error) {
      ctx.logger.warn(`dsh-learn-plugin lesson-log: call-context replay failed for ${sessionId}: ${String(error)}`)
      return false
    }
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
      boundedSetMeta(call.callId, { name: call.name, args: call.arguments })
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
          boundedAdd(askedQuiz, result.callId)
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
        boundedAdd(askedQuiz, result.callId)
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
      // Task 2.1 (design D1): while a link is being established (placeholder
      // phase), live events are staged instead of mirrored — and `linkFor` is
      // NOT consulted, so the restore path (note + watermark backfill) cannot
      // fire mid-link. The fake-"restored"-note race is gone with it. Staged
      // items are released in order once the link goes live.
      const placeholder = links.get(session.id)
      if (placeholder?.linking === true) {
        await stageItem(placeholder, { kind: 'event', event: typed })
        return
      }
      const link = await linkFor(session.id)
      if (link === undefined) return
      // Task 3.1 (design D5): the durable watermark is the only boundary —
      // replayed or not, anything at or below it is already mirrored.
      if (typed.seq <= link.lastSeq) return
      // Task 3.2: a restored session's first tool/result may miss callMeta
      // (memory died with the old process). Replay-search the persisted
      // history for that call before deciding on blocks — a partial read
      // keeps the budget and later results retry.
      if (typed.type === 'tool/result') {
        const result = asToolResult(typed.data)
        if (result !== undefined && !callMeta.has(result.callId)) {
          await rebuildCallContext(session.id, result.callId)
        }
      }
      const blocks = blocksForEvent(typed, 'live')
      if (blocks.length === 0) {
        // Contentless events advance the in-memory boundary only — replaying
        // them after a crash writes nothing, so persisting each one is pure
        // churn. The exception is a quiz call (the 题面 boundary): its
        // watermark IS meaningful, because a restart must not replay the call
        // and then re-ask the question on the verdict (task 3.2).
        if (typed.seq > link.lastSeq) {
          link.lastSeq = typed.seq
          if (typed.type === 'tool/call' && asToolCall(typed.data)?.name === 'quiz') {
            await persistLinkRecord(session.id, link)
          }
        }
        return
      }
      // Task 2.2: the watermark moves only when the write lands.
      link.pending.push({ seq: typed.seq, blocks })
      await flushLink(session.id, link)
    })
  })

  // Task 1.1 — session-lifecycle audit (design D4), settled against the
  // `@deepseek-ai/dsh-session` 0.2.1-rc.2 type declarations (node_modules,
  // lib/types/index.d.ts): the cordis Events map declares
  //   'session/disposed' — "emitted once when an announced session leaves
  //   the store, including publication rollback".
  // The end-event path IS available, so `links` cleanup subscribes to it:
  // when a session leaves the in-process store, its link state (pending
  // writes, staging queue, retry timer) is dropped with it. The durable
  // record stays — a later resume of the same session rebuilds the link
  // through linkFor from the persisted table. No LRU fallback is needed.
  ctx.on('session/disposed', (session: { id?: unknown }) => {
    const id = typeof (session as { id?: unknown } | undefined)?.id === 'string'
      ? (session as { id: string }).id
      : undefined
    if (id === undefined) return
    links.delete(id)
    const timer = retryTimers.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      retryTimers.delete(id)
    }
  })

  // Quiz questions carry the post-shuffle display order and no answer —
  // written through this hook the moment the question goes out, before the
  // user answers. The askedQuiz marker is set only after the write lands: if
  // it fails, the graded result later writes question+verdict together, so
  // the log self-heals instead of leaving a dangling verdict. During the
  // placeholder phase the 题面 is staged and released in window order.
  onQuizEvent((quizEvent) => {
    if (quizEvent.phase !== 'asked') return
    void withLock(async () => {
      await ready
      const placeholder = links.get(quizEvent.sessionId)
      if (placeholder?.linking === true) {
        await stageItem(placeholder, {
          kind: 'quizAsked',
          callId: quizEvent.callId,
          question: quizEvent.question,
          displayedOptions: quizEvent.displayedOptions,
        })
        return
      }
      const link = await linkFor(quizEvent.sessionId)
      if (link === undefined) return
      if (askedQuiz.has(quizEvent.callId)) return
      try {
        await appendToFile(link.file, questionCallout('Quiz', quizEvent.question, quizEvent.displayedOptions))
      } catch (error) {
        ctx.logger.warn(`dsh-learn-plugin lesson-log: quiz question pre-write failed (will be folded into the verdict block): ${String(error)}`)
        return
      }
      boundedAdd(askedQuiz, quizEvent.callId)
    })
  })

  // -----------------------------------------------------------------------
  // Link / unlink (tool + user command share one implementation)
  // -----------------------------------------------------------------------

  interface LinkSessionOptions {
    /** `/lesson-log` command path: the user typed it, so outside-workspace paths are pre-confirmed (design D7). */
    confirmedByUser?: boolean
    /** Live agent from the tool execution context, for the confirmation question. */
    agent?: unknown
    /** Cancellation lifetime of the confirmation question. */
    signal?: AbortSignal
  }

  // Design D7: a tool-initiated (agent) link outside the session working
  // directory needs the user's explicit yes. Without an answer UI (headless
  // runs) the ask fails loud with a pointer to the command path.
  async function confirmOutsideWorkspace(resolved: string, base: string, options: LinkSessionOptions): Promise<void> {
    const decline = (why: string): Error =>
      new Error(`Not linked: ${resolved} — it is outside this session's working directory (${base}) and ${why}. Re-run via the /lesson-log command to confirm it yourself.`)
    const userQuestions = (ctx as { userQuestions?: { ask?: (request: unknown) => Promise<{ answers: Array<{ id: string; selected: string[] }> }> } }).userQuestions
    if (typeof userQuestions?.ask !== 'function') throw decline('no answer UI is connected to confirm it')
    let answer: { answers: Array<{ id: string; selected: string[] }> }
    try {
      answer = await userQuestions.ask({
        questions: [{
          id: 'lesson-log-outside-confirm',
          question: `Link ${resolved} as this session's lesson log? It is OUTSIDE the session working directory (${base}).`,
          header: 'lesson-log',
          options: [{ label: 'Yes, link it' }, { label: 'No' }],
        }],
        ...(options.agent !== undefined ? { agent: options.agent } : {}),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      })
    } catch (error) {
      throw decline(`the confirmation question failed (${String(error)})`)
    }
    const first = answer.answers[0]
    if (first === undefined || !first.selected.includes('Yes, link it')) throw decline('you declined it')
  }

  async function linkSession(session: { id: string; seq: number; header: { cwd?: string; origin?: string } } | undefined, fileArg: string, options: LinkSessionOptions = {}): Promise<string> {
    if (session === undefined) throw new Error('lesson_log requires a live session')
    if (session.header.origin === 'subagent') {
      throw new Error('lesson_log must be called from the main session, not a subagent')
    }
    const trimmed = fileArg.trim()
    if (trimmed === '') throw new Error('lesson_log requires a file path')
    await ready
    if (table === undefined) throw new Error('lesson_log unavailable: plugin storage did not start')
    const base = session.header.cwd ?? process.cwd()
    const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(base, trimmed)
    if (!fs.existsSync(resolved)) throw new Error(`File does not exist: ${resolved} (lesson_log links an existing note; create it first — it never creates files)`)
    if (!fs.statSync(resolved).isFile()) throw new Error(`Not a file: ${resolved}`)
    // Task 4.1 (design D7): markdown targets only — the log is Obsidian
    // callouts, and the guard keeps arbitrary files out of the mirror.
    if (path.extname(resolved).toLowerCase() !== '.md') {
      throw new Error(`Not a markdown file: ${resolved} (lesson_log only accepts .md files)`)
    }
    const rel = path.relative(base, resolved)
    const insideWorkspace = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
    if (!insideWorkspace && options.confirmedByUser !== true) {
      await confirmOutsideWorkspace(resolved, base, options)
    }

    // Task 2.2 (design D2): re-link resume — a record moved into `unlinked`
    // for the SAME file lets this link skip the full backfill and continue
    // from the kept watermark.
    const resumeRecord = unlinkedTable?.get(session.id)
    const resume = resumeRecord !== undefined && resumeRecord.file === resolved

    // Task 2.1 (design D1) — phase 1: PLACEHOLDER. The link state goes in
    // immediately with `linking: true`, so any live event arriving during the
    // backfill is staged (never dropped, never run through the restore path).
    // The fake-"restored"-note race (a live event triggering linkFor between
    // the backfill read and the links.set) is gone with this ordering.
    const state: LinkState = {
      file: resolved,
      linkedAt: new Date().toISOString(),
      lastSeq: 0,
      pending: [],
      failures: 0,
      linking: true,
      staging: [],
    }
    links.set(session.id, state)
    knownUnlinked.delete(session.id)

    // Task 2.1 — phase 2: BACKFILL. A resume skips the full backfill and
    // adopts the kept watermark; otherwise the session history is read and
    // mirrored through the query channel. A failed read keeps the previous
    // semantics: warn, link still goes live, staged events still flush.
    let backfilled = 0
    let lastSeq = 0
    const blocks: string[] = []
    if (resume && resumeRecord !== undefined) {
      lastSeq = resumeRecord.lastSeq
    } else {
      try {
        const log = await ctx.sessionQuery.readSession(session.id as Parameters<typeof ctx.sessionQuery.readSession>[0])
        for (const event of log.events) {
          const block = blocksForEvent(event as EventView, 'replay')
          if (block.length > 0) backfilled += 1
          blocks.push(...block)
          lastSeq = Math.max(lastSeq, (event as { seq?: unknown }).seq === undefined ? 0 : (event as { seq: number }).seq)
        }
      } catch (error) {
        ctx.logger.warn(`dsh-learn-plugin lesson-log: backfill read failed: ${String(error)}`)
      }
    }

    // The session may have been unlinked while the backfill read was in
    // flight; the unlink wins and this link is abandoned.
    if (links.get(session.id) !== state) {
      throw new Error('Not linked: the session was unlinked while the link was being established')
    }

    // Task 2.1 — phase 3: GO LIVE. Upgrade the placeholder to the full state
    // (watermark in), persist the record, retire the resume record, then
    // release the staged window in order behind the backfill blocks.
    state.linking = false
    state.lastSeq = lastSeq
    await table.put(session.id, { file: resolved, linkedAt: state.linkedAt, lastSeq })
    if (unlinkedTable !== undefined && resumeRecord !== undefined) {
      try {
        await unlinkedTable.delete(session.id)
      } catch (error) {
        // A leftover resume row is harmless (数十 bytes; the next unlink
        // overwrites it), so delete failures never fail the link.
        ctx.logger.warn(`dsh-learn-plugin lesson-log: resume record cleanup failed: ${String(error)}`)
      }
    }
    // Task 2.2: backfill content rides the pending queue too — a failed
    // append is retried and reported like live mirroring, never dropped.
    if (blocks.length > 0) state.pending.push({ seq: lastSeq, blocks })
    // The replay above already rebuilt this session's call context.
    rebuiltSessions.add(session.id)
    await releaseStaged(session.id, state)
    await flushLink(session.id, state)
    return resume
      ? `Linked: ${resolved} (resumed from the previous mirror watermark — no backfill needed)`
      : `Linked: ${resolved} (${backfilled} entries backfilled)`
  }

  async function unlinkSession(session: { id: string } | undefined): Promise<string> {
    if (session === undefined) throw new Error('lesson_unlog requires a live session')
    await ready
    const link = links.get(session.id)
    const record = table?.get(session.id)
    // Task 2.2 (design D2): the watermark outlives the unlink — {file,
    // lastSeq} moves into the `unlinked` table so re-linking the same file
    // resumes instead of re-backfilling, while the active-links record is
    // deleted so an older plugin version cannot restore this session as
    // linked. The in-memory state is dropped either way; mirroring stops NOW.
    const file = link?.file ?? record?.file
    const lastSeq = link?.lastSeq ?? record?.lastSeq
    links.delete(session.id)
    boundedAdd(knownUnlinked, session.id)
    const timer = retryTimers.get(session.id)
    if (timer !== undefined) {
      clearTimeout(timer)
      retryTimers.delete(session.id)
    }
    if (table !== undefined && unlinkedTable !== undefined && file !== undefined && lastSeq !== undefined) {
      try {
        await unlinkedTable.put(session.id, { file, lastSeq, unlinkedAt: new Date().toISOString() })
      } catch (error) {
        // Without the resume row a same-file re-link will run a full backfill
        // — degraded but correct (backfill is idempotent by watermark).
        ctx.logger.warn(`dsh-learn-plugin lesson-log: unlink resume-record write failed: ${String(error)}`)
      }
    }
    if (table !== undefined) await table.delete(session.id)
    if (link === undefined && record === undefined) return 'No file linked'
    return `Unlinked: ${path.basename(file ?? '')}`
  }

  ctx.tools.register(defineTool({
    name: 'lesson_log',
    description:
      'Link an EXISTING markdown file as this session’s lesson log: the plugin mirrors user questions, teaching prose, and quiz/ask_user_question Q&A into it as Obsidian callouts (history is backfilled; the link survives restarts). ' +
      'Only .md files are accepted — never other formats. Paths OUTSIDE this session’s working directory trigger a yes/no confirmation question for the user; without an answer UI the call fails, so use the /lesson-log command instead to confirm such a path yourself. ' +
      'The file must already exist — this tool never creates files, so a typo cannot scatter new notes. Main session only.',
    parameters: {
      file: { type: 'string', required: true, description: 'Path to an existing .md file (absolute, or relative to the session working directory).' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const file = typeof (args as { file?: unknown }).file === 'string' ? ((args as { file: string }).file) : ''
      return linkSession(exec.agent?.session as Parameters<typeof linkSession>[0], file, { agent: exec.agent, signal: exec.signal })
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
        // The user typed this command: outside-workspace paths are confirmed by that act (design D7).
        return { kind: 'success' as const, text: await linkSession(agent.session as Parameters<typeof linkSession>[0], rawInput, { confirmedByUser: true }) }
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
