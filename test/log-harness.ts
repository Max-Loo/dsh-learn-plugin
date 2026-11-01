/**
 * Dev-only lesson-log verification harness (not part of the shipped bundle).
 *
 * Creates a REAL session, appends real events (user/assistant prose, an
 * ask_user_question call+result, a quiz result with presentationMeta), links
 * a file through the lesson_log tool, and asserts the mirrored markdown:
 * backfill completeness, block order, no-answer-in-题面, live mirroring after
 * link, external-edit preservation (append-only), unlog stopping the mirror,
 * and durable link persistence — plus the harden-lesson-log additions:
 * v1→v2 record migration watermark, write-failure visibility with ordered
 * backfill, and the .md / outside-workspace target constraints — plus the
 * improve-mirror-robustness additions: link-window staging (no lost events,
 * no fake restore note), same-file re-link resume (no duplicate backfill),
 * one-time restore note across simulated restarts (detach + re-enter), the
 * old-v2-record (no restoredNotedAt) restore compatibility, skipped-quiz
 * mirroring with no ✗, pre-answer leak-freedom of the log mirror, and the
 * FIFO bounds of the in-process collections.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
// Same-module import as the inserted plugin (`../dist/lib/index.js` →
// `./log.js`), so the diagnostics symbol object is the exact one the plugin
// parked on globalThis.
import { LOG_DIAGNOSTICS_KEY } from '../dist/lib/log.js'

export const name = 'dsh-learn-plugin-log-harness'
export const inject = ['tools', 'sessions', 'sessionQuery', 'commands', 'userQuestions']

const results: { name: string; pass: boolean; detail?: string }[] = []
function check(name: string, pass: boolean, detail?: string): void {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && !pass ? ` — ${detail}` : ''}`)
}

async function waitFor(name: string, probe: () => boolean, tries = 100): Promise<boolean> {
  for (let i = 0; i < tries; i += 1) {
    if (probe()) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  console.log(`TIMEOUT waiting for ${name}`)
  return false
}

function dshStorageUnitPath(domainName: string): string {
  // The dsh home is redirectable (DSH_HOME) — dev runs use a workspace copy.
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'storages', `${domainName}.json`)
}

/** Seed one link record in the v1 shape (file + linkedAt, NO lastSeq) into the LEGACY v1 unit file, keeping its v1 stamp. */
function seedV1Record(sessionId: string, file: string): void {
  const unitPath = dshStorageUnitPath('learn_dsh_lesson_log')
  fs.mkdirSync(path.dirname(unitPath), { recursive: true })
  let doc: { unit?: { name: string; version: number }; global?: unknown; tables?: { links?: Record<string, unknown> } }
  try {
    doc = JSON.parse(fs.readFileSync(unitPath, 'utf8'))
  } catch {
    doc = { unit: { name: 'learn_dsh_lesson_log', version: 1 }, global: null, tables: { links: {} } }
  }
  doc.unit = { name: 'learn_dsh_lesson_log', version: 1 }
  doc.tables ??= { links: {} }
  doc.tables.links ??= {}
  doc.tables.links[sessionId] = { file, linkedAt: new Date().toISOString() }
  fs.writeFileSync(unitPath, JSON.stringify(doc, null, 2), 'utf8')
}

function readStoredRecord(sessionId: string): { file?: string; linkedAt?: string; lastSeq?: number; restoredNotedAt?: string } | undefined {
  for (const domainName of ['learn_dsh_lesson_log_v2', 'learn_dsh_lesson_log']) {
    try {
      const doc = JSON.parse(fs.readFileSync(dshStorageUnitPath(domainName), 'utf8')) as { tables?: { links?: Record<string, { file?: string; linkedAt?: string; lastSeq?: number; restoredNotedAt?: string }> } }
      const record = doc.tables?.links?.[sessionId]
      if (record !== undefined) return record
    } catch {
      // try the next unit file
    }
  }
  return undefined
}

function readUnlinkedRecord(sessionId: string): { file?: string; lastSeq?: number; unlinkedAt?: string } | undefined {
  try {
    const doc = JSON.parse(fs.readFileSync(dshStorageUnitPath('learn_dsh_lesson_log_v2'), 'utf8')) as { tables?: { unlinked?: Record<string, { file?: string; lastSeq?: number; unlinkedAt?: string }> } }
    return doc.tables?.unlinked?.[sessionId]
  } catch {
    return undefined
  }
}

/** Seed one v2 link record written by the PREVIOUS plugin build: file + linkedAt + lastSeq, but NO restoredNotedAt (task 1.2). */
function seedV2Record(sessionId: string, file: string, lastSeq: number): void {
  const unitPath = dshStorageUnitPath('learn_dsh_lesson_log_v2')
  fs.mkdirSync(path.dirname(unitPath), { recursive: true })
  let doc: { unit?: { name: string; version: number }; global?: unknown; tables?: { links?: Record<string, unknown>; unlinked?: Record<string, unknown> } }
  try {
    doc = JSON.parse(fs.readFileSync(unitPath, 'utf8'))
  } catch {
    doc = { unit: { name: 'learn_dsh_lesson_log_v2', version: 2 }, global: null, tables: { links: {}, unlinked: {} } }
  }
  doc.unit = { name: 'learn_dsh_lesson_log_v2', version: 2 }
  doc.tables ??= {}
  doc.tables.links ??= {}
  doc.tables.links[sessionId] = { file, linkedAt: new Date().toISOString(), lastSeq }
  fs.writeFileSync(unitPath, JSON.stringify(doc, null, 2), 'utf8')
}

function validAssistant(text: string, id: string) {
  return {
    turn: 1,
    step: 1,
    stream: [],
    message: { id, role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model', provider: 'probe', model: 'probe-model' } },
  }
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1
}

function persistedOnDisk(sessionId: string): boolean {
  for (const domainName of ['learn_dsh_lesson_log_v2', 'learn_dsh_lesson_log']) {
    try {
      const text = fs.readFileSync(dshStorageUnitPath(domainName), 'utf8')
      if (text.includes(sessionId) && text.includes('lesson.md')) return true
    } catch {
      // try the next unit file
    }
  }
  return false
}

function validUser(text: string, id: string) {
  return { id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }
}

export function apply(ctx: Context): void {
  // ---- Synchronous prelude: MUST run before the plugin's async storage open,
  // so the seeded v1 record is on the medium when the domain is first opened.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-learn-plugin-log-'))
  const logFile = path.join(tmp, 'lesson.md')
  fs.writeFileSync(logFile, '# Existing note\n\nSome prior content.\n', 'utf8')

  // v1-legacy fixture (task 1.2): a session with persisted history whose link
  // record was written by the v1 plugin — no lastSeq — plus a log file that
  // already holds the v1-era mirror of that history.
  const v1File = path.join(tmp, 'legacy.md')
  // Unique per run: a reused DSH_HOME keeps earlier runs' migrated v2 records
  // (with watermarks), and migration never overwrites existing v2 data.
  const v1SessionId = `harness-v1-legacy-${Date.now()}`
  const v1Session = ctx.sessions.create(v1SessionId as never, { meta: { cwd: tmp } as never })
  v1Session.append('user/message', validUser('v1-era user line', 'v1u-1') as never, { surfaceOp: 'append' } as never)
  v1Session.append('assistant/message', {
    turn: 1,
    step: 1,
    stream: [],
    message: { id: 'v1a-1', role: 'assistant', content: [{ type: 'text', text: 'v1-era assistant line' }], source: { kind: 'model', provider: 'probe', model: 'probe-model' } },
  } as never, { surfaceOp: 'append' } as never)
  fs.writeFileSync(v1File, '# Legacy v1 note\n\n> [!quote] YOU\n\nv1-era user line\n', 'utf8')
  seedV1Record(v1SessionId, v1File)

  // Old-v2-record fixture (tasks 1.2/2.3): a session whose link record was
  // written by the PREVIOUS plugin build — v2 shape with lastSeq but NO
  // restoredNotedAt — seeded before the plugin opens its storage domain, so
  // the record is on the medium when the domain loads (same placement as the
  // v1 fixture). The restore path over this record is exercised in step 14.
  const noteFile = path.join(tmp, 'note.md')
  fs.writeFileSync(noteFile, '# Note file\n', 'utf8')
  const noteSessionId = `harness-note-session-${Date.now()}`
  const noteSession = ctx.sessions.prepare(noteSessionId as never, { meta: { cwd: tmp } as never } as never)
  const noteDetach1 = ctx.sessions.enter(noteSession as never) as () => void
  ctx.sessions.announce(noteSession as never)
  const nSeq1 = noteSession.append('user/message', validUser('note history line', 'nu-1') as never, { surfaceOp: 'append' } as never).seq
  const nSeq2 = noteSession.append('assistant/message', validAssistant('note history reply', 'na-1') as never, { surfaceOp: 'append' } as never).seq
  seedV2Record(noteSessionId, noteFile, nSeq2)

  void (async () => {
    if (!(await waitFor('lesson_log tool', () => ctx.tools.get('lesson_log') !== undefined))) return
    const lessonLog = ctx.tools.get('lesson_log')
    const lessonUnlog = ctx.tools.get('lesson_unlog')
    const sessionId = 'harness-log-session' as never

    // A real session with a small history. Event shapes mirror what the DSH
    // agent loop persists (identified messages, JSON-string tool arguments,
    // tool results keyed by source.callId) so readSession replay validation
    // accepts the log.
    const session = ctx.sessions.create(sessionId, { meta: { cwd: tmp } as never })
    const callId = 'harness-quiz-call'
    session.append('user/message', {
      id: 'u-1',
      role: 'user',
      content: [{ type: 'text', text: 'Teach me the TCP handshake.' }],
      source: { kind: 'user' },
    } as never, { surfaceOp: 'append' } as never)
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      stream: [],
      message: {
        id: 'a-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'SYN, SYN-ACK, ACK — three packets.' }],
        source: { kind: 'model', provider: 'probe', model: 'probe-model' },
      },
    } as never, { surfaceOp: 'append' } as never)
    const askCallSeq = session.append('tool/call', {
      turn: 1,
      step: 1,
      callId,
      name: 'quiz',
      arguments: JSON.stringify({ question: 'Which packet opens the handshake?', options: [{ value: 'syn' }, { value: 'ack' }], correctAnswer: 'syn', explanation: 'SYN opens.' }),
    } as never).seq
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: {
        id: 'tr-1',
        role: 'tool',
        source: { kind: 'tool', callId },
        toolCallId: callId,
        content: [{ type: 'text', text: 'Quiz result: Correct ✓' }],
        isError: false,
      },
      meta: {
        phase: 'settled',
        callId,
        sessionId: String(sessionId),
        question: 'Which packet opens the handshake?',
        displayedOptions: [
          { value: 'ack', label: 'ack' },
          { value: 'syn', label: 'syn' },
        ],
        answers: ['syn'],
        status: 'correct',
        correct: true,
        dontKnow: false,
        correctIndices: [1],
        correctAnswer: ['syn'],
        explanation: 'SYN opens.',
        multiSelect: false,
      },
    } as never, { surfaceOp: 'append', sourceEventSeqs: [askCallSeq] } as never)
    // A bash call + result that must NOT be mirrored.
    const bashSeq = session.append('tool/call', { turn: 1, step: 2, callId: 'harness-bash', name: 'bash', arguments: JSON.stringify({ command: 'ls' }) } as never).seq
    session.append('tool/result', {
      turn: 1,
      step: 2,
      message: { id: 'tr-2', role: 'tool', source: { kind: 'tool', callId: 'harness-bash' }, toolCallId: 'harness-bash', content: [{ type: 'text', text: 'file1\nfile2' }], isError: false },
    } as never, { surfaceOp: 'append', sourceEventSeqs: [bashSeq] } as never)

    try {
      // 1. Link with a non-existent path errors and creates nothing.
      const missing = path.join(tmp, 'nope.md')
      let err1 = ''
      try {
        await lessonLog?.execute({ file: missing }, { callId: 'h1' as never, signal: new AbortController().signal, agent: { session } } as never)
      } catch (error) {
        err1 = error instanceof Error ? error.message : String(error)
      }
      check('missing file rejected without creating', err1.includes('does not exist') && !fs.existsSync(missing), err1)

      // 2. Relative resolution against the session cwd.
      const linked = (await lessonLog?.execute({ file: 'lesson.md' }, { callId: 'h2' as never, signal: new AbortController().signal, agent: { session } } as never)) as string
      check('link via relative path succeeds', typeof linked === 'string' && linked.includes('Linked'), String(linked))

      // 3. Backfill content: order + callouts + no bash + no answer leak in 题面.
      const ok3 = await waitFor('backfill flush', () => {
        const text = fs.readFileSync(logFile, 'utf8')
        return text.includes('> [!question] Quiz') && text.includes('> [!success] Quiz — correct ✓')
      })
      const text3 = fs.readFileSync(logFile, 'utf8')
      check('backfill wrote user quote', ok3 && text3.includes('> [!quote] YOU') && text3.includes('Teach me the TCP handshake.'))
      check('backfill wrote assistant abstract', text3.includes('> [!abstract] DSH') && text3.includes('SYN, SYN-ACK, ACK'))
      check('quiz 题面 uses displayed order (ack first)', text3.includes('1. ack\n> 2. syn'), text3.slice(text3.indexOf('!question')))
      check('quiz 题面 has no answer marker', !(text3.split('success')[0] ?? '').includes('SYN opens') || text3.indexOf('1. ack') < text3.indexOf('SYN opens.'))
      check('判定 block shows answer + explanation', text3.includes('Correct answer: syn') && text3.includes('SYN opens.'))
      check('bash call not mirrored', !text3.includes('file1') && !text3.includes('harness-bash'))
      const iUser = text3.indexOf('> [!quote] YOU')
      const iAssistant = text3.indexOf('> [!abstract] DSH')
      const iQuestion = text3.indexOf('> [!question] Quiz')
      const iVerdict = text3.indexOf('> [!success] Quiz — correct ✓')
      check('block order preserved', iUser >= 0 && iAssistant > iUser && iQuestion > iAssistant && iVerdict > iQuestion, `${iUser},${iAssistant},${iQuestion},${iVerdict}`)

      // 4. Live mirroring after link (new events append).
      const sizeBefore = fs.statSync(logFile).size
      session.append('user/message', {
        id: 'u-2',
        role: 'user',
        content: [{ type: 'text', text: 'Why three packets and not two?' }],
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' } as never)
      const ok4 = await waitFor('live mirror', () => fs.readFileSync(logFile, 'utf8').includes('Why three packets'))
      check('live mirroring appends new events', ok4)

      // 4.5 Append-only integrity (task 2.1): an external edit to the file
      // head survives the next mirrored append verbatim — nothing existing is
      // rewritten, reordered, or truncated.
      const headMarker = 'EXTERNAL HEAD EDIT — must survive'
      const before45 = fs.readFileSync(logFile, 'utf8')
      fs.writeFileSync(logFile, `${headMarker}\n\n${before45}`, 'utf8')
      session.append('user/message', {
        id: 'u-2b',
        role: 'user',
        content: [{ type: 'text', text: 'mirror after external edit' }],
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' } as never)
      const ok45 = await waitFor('append after external edit', () => fs.readFileSync(logFile, 'utf8').includes('mirror after external edit'))
      const text45 = fs.readFileSync(logFile, 'utf8')
      check('external head edit preserved across appends', ok45 && text45.startsWith(headMarker) && text45.includes('Some prior content.'), text45.slice(0, 80))

      // 5. Link record durable on disk (json backend under the dsh home).
      check('link record persisted', persistedOnDisk(String(sessionId)))

      // 6. Unlink stops mirroring.
      const unlinked = (await lessonUnlog?.execute({}, { callId: 'h3' as never, signal: new AbortController().signal, agent: { session } } as never)) as string
      const sizeAfterUnlink = fs.statSync(logFile).size
      session.append('user/message', {
        id: 'u-3',
        role: 'user',
        content: [{ type: 'text', text: 'This must not be mirrored.' }],
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' } as never)
      await new Promise((resolve) => setTimeout(resolve, 700))
      check('unlink reported', typeof unlinked === 'string' && unlinked.includes('Unlinked'), String(unlinked))
      check('mirror stops after unlink', fs.statSync(logFile).size === sizeAfterUnlink && !fs.readFileSync(logFile, 'utf8').includes('must not be mirrored'))

      // 7. User command path: /lesson-log links and /lesson-unlog stops —
      // the same linkSession implementation behind ctx.commands.execute.
      // Step 6 unlinked this same file, so this re-link RESUMES from the
      // watermark moved into the `unlinked` table (task 2.2): no second
      // backfill, no duplicated blocks.
      const agentStub = { session } as never
      const cmdLink = await ctx.commands.execute(agentStub, `/lesson-log ${logFile}`, [], new AbortController().signal)
      const linkText = JSON.stringify(cmdLink?.result ?? cmdLink)
      check('command /lesson-log links', cmdLink?.result?.kind === 'success' && linkText.includes('Linked'), linkText)
      const teachCountAfterRelink = countMarker(fs.readFileSync(logFile, 'utf8'), 'Teach me the TCP handshake.')
      check(
        're-link same file resumes without duplicate backfill (2.2)',
        cmdLink?.result?.kind === 'success' && teachCountAfterRelink === 1 && linkText.includes('resumed'),
        `count=${teachCountAfterRelink} text=${linkText}`,
      )
      check('resume record cleared after re-link (2.2)', readUnlinkedRecord(String(sessionId)) === undefined, JSON.stringify(readUnlinkedRecord(String(sessionId))))
      session.append('user/message', {
        id: 'u-4',
        role: 'user',
        content: [{ type: 'text', text: 'command mirror check' }],
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' } as never)
      const okCmd = await waitFor('command mirror', () => fs.readFileSync(logFile, 'utf8').includes('command mirror check'))
      check('command-linked session mirrors', okCmd)
      const cmdUnlink = await ctx.commands.execute(agentStub, '/lesson-unlog', [], new AbortController().signal)
      check('command /lesson-unlog stops', cmdUnlink?.result?.kind === 'success', JSON.stringify(cmdUnlink?.result ?? cmdUnlink))

      // 8. v1 → v2 migration (task 1.2): a record seeded in v1 shape (no
      // lastSeq) restores with a watermark that covers the whole persisted
      // history — nothing v1 already mirrored is re-mirrored. The watermark
      // is read by the plugin at restore time, which may or may not yet see
      // the contentless trigger event depending on persistence visibility, so
      // the exact assertion is the interval [max-before-trigger, max-seen].
      const maxSeqOf = (events: unknown[]): number => Math.max(0, ...(events as Array<{ seq?: number }>).map((event) => typeof event.seq === 'number' ? event.seq : 0))
      const v1MaxBefore = maxSeqOf((await ctx.sessionQuery.readSession(v1SessionId as never)).events as unknown[])
      v1Session.append('user/message', {
        id: 'v1-trigger',
        role: 'user',
        content: [{ type: 'text', text: 'migration trigger (never mirrored)' }],
        source: { kind: 'dsh-learn-plugin-harness' },
      } as never, { surfaceOp: 'append' } as never)
      const okMigrated = await waitFor('v1 migration put', () => readStoredRecord(v1SessionId)?.lastSeq !== undefined)
      const migrated = readStoredRecord(v1SessionId)
      const v1MaxAfter = maxSeqOf((await ctx.sessionQuery.readSession(v1SessionId as never)).events as unknown[])
      check(
        'v1 record migrated with history-covering watermark',
        okMigrated && migrated?.lastSeq !== undefined && migrated.lastSeq >= v1MaxBefore && migrated.lastSeq <= v1MaxAfter,
        `stored=${JSON.stringify(migrated)} maxBefore=${v1MaxBefore} maxAfter=${v1MaxAfter}`,
      )
      const v1Text = fs.readFileSync(v1File, 'utf8')
      check('v1-era content not re-mirrored after migration', v1Text.split('v1-era user line').length === 2, v1Text)
      check('v1 restore note written', v1Text.includes('lesson-log restored'), v1Text)
      v1Session.append('user/message', validUser('v1 post-migration line', 'v1u-2') as never, { surfaceOp: 'append' } as never)
      const okV1Mirror = await waitFor('v1 restored mirror', () => fs.readFileSync(v1File, 'utf8').includes('v1 post-migration line'))
      check('v1-restored link mirrors new events', okV1Mirror)

      // 9. Non-markdown targets are rejected; the target is never read or
      // written (task 4.1).
      const jsonFile = path.join(tmp, 'notes.json')
      const jsonBefore = '{"keep": true}'
      fs.writeFileSync(jsonFile, jsonBefore, 'utf8')
      let err9 = ''
      try {
        await lessonLog?.execute({ file: jsonFile }, { callId: 'h9' as never, signal: new AbortController().signal, agent: { session } } as never)
      } catch (error) {
        err9 = error instanceof Error ? error.message : String(error)
      }
      check('non-.md rejected (markdown-only error)', err9.includes('only accepts .md'), err9)
      check('non-.md target untouched', fs.readFileSync(jsonFile, 'utf8') === jsonBefore)

      // 10. Outside-workspace tool link requires user confirmation (task
      // 4.1); this headless harness has no answer UI, so the ask fails loud,
      // the link is refused, and the target is untouched.
      const outsideFile = path.join(os.tmpdir(), `dsh-learn-harness-outside-${Date.now()}.md`)
      fs.writeFileSync(outsideFile, '# Outside note\n', 'utf8')
      const outsideBefore = fs.readFileSync(outsideFile, 'utf8')
      let err10 = ''
      try {
        await lessonLog?.execute({ file: outsideFile }, { callId: 'h10' as never, signal: new AbortController().signal, agent: { session } } as never)
      } catch (error) {
        err10 = error instanceof Error ? error.message : String(error)
      }
      check('outside-workspace tool link needs confirmation (refused headless)', err10.includes('outside this session'), err10)
      check('outside target untouched by refused link', fs.readFileSync(outsideFile, 'utf8') === outsideBefore)

      // 11. Command path links outside-workspace directly (the user typed it).
      const cmdOutside = await ctx.commands.execute(agentStub, `/lesson-log ${outsideFile}`, [], new AbortController().signal)
      const outsideLinkText = JSON.stringify(cmdOutside?.result ?? cmdOutside)
      check('command links outside-workspace without confirmation', cmdOutside?.result?.kind === 'success' && outsideLinkText.includes('Linked'), outsideLinkText)
      session.append('user/message', {
        id: 'u-5',
        role: 'user',
        content: [{ type: 'text', text: 'outside command mirror check' }],
        source: { kind: 'user' },
      } as never, { surfaceOp: 'append' } as never)
      const okOutside = await waitFor('outside command mirror', () => fs.readFileSync(outsideFile, 'utf8').includes('outside command mirror check'))
      check('command-linked outside file mirrors', okOutside)
      await lessonUnlog?.execute({}, { callId: 'h11' as never, signal: new AbortController().signal, agent: { session } } as never)
      fs.rmSync(outsideFile, { force: true })

      // 12. Write-failure visibility + ordered backfill (task 2.2): a
      // read-only target stalls the mirror, the watermark does not move, the
      // session sees a failure report, and once writable again the pending
      // blocks land strictly in order.
      const roFile = path.join(tmp, 'readonly.md')
      fs.writeFileSync(roFile, '# Read-only target\n', 'utf8')
      const roSessionId = 'harness-readonly-session'
      const roSession = ctx.sessions.create(roSessionId as never, { meta: { cwd: tmp } as never })
      const roHistSeq = roSession.append('user/message', validUser('ro history line', 'rou-1') as never, { surfaceOp: 'append' } as never).seq
      fs.chmodSync(roFile, 0o444)
      let failureReported = false
      const off = ctx.on('session/event', (_eventSession: unknown, event: unknown) => {
        const view = event as { type?: unknown; data?: { source?: { kind?: unknown }; content?: unknown } }
        if (view.type !== 'user/message') return
        if ((view.data as { source?: { kind?: unknown } } | undefined)?.source?.kind !== 'dsh-learn-plugin') return
        if (JSON.stringify(view.data).includes('consecutive appends')) failureReported = true
      })
      let linkErr12 = ''
      try {
        await lessonLog?.execute({ file: roFile }, { callId: 'h12' as never, signal: new AbortController().signal, agent: { session: roSession } } as never)
      } catch (error) {
        linkErr12 = error instanceof Error ? error.message : String(error)
      }
      check('readonly link accepted (write failure deferred, not dropped)', linkErr12 === '', linkErr12)
      const okReport = await waitFor('write-failure report', () => failureReported, 150)
      check('stalled mirror reported to session', okReport && failureReported)
      const storedStalled = readStoredRecord(roSessionId)
      check('watermark not advanced while failing', storedStalled?.lastSeq === roHistSeq, `stored=${JSON.stringify(storedStalled)} expected=${roHistSeq}`)
      fs.chmodSync(roFile, 0o644)
      const roRecoverySeq = roSession.append('user/message', validUser('ro recovery line', 'rou-2') as never, { surfaceOp: 'append' } as never).seq
      const okBackfill12 = await waitFor('ordered backfill after recovery', () => {
        const text = fs.readFileSync(roFile, 'utf8')
        const history = text.indexOf('ro history line')
        const recovery = text.indexOf('ro recovery line')
        return history >= 0 && recovery > history
      })
      const storedRecovered = readStoredRecord(roSessionId)
      check('pending blocks appended in order after recovery', okBackfill12)
      check('watermark advanced after recovery', storedRecovered?.lastSeq === roRecoverySeq, `stored=${JSON.stringify(storedRecovered)} expected=${roRecoverySeq}`)
      off()
      await lessonUnlog?.execute({}, { callId: 'h13' as never, signal: new AbortController().signal, agent: { session: roSession } } as never)

      // ---- improve-mirror-robustness additions ----

      // Dev-harness diagnostics (task 3.1): the plugin exposes its live
      // collections under a well-known symbol so the bounds can be asserted.
      const diag = (globalThis as unknown as Record<symbol, unknown>)[LOG_DIAGNOSTICS_KEY] as
        | { links: Map<string, unknown>; knownUnlinked: Set<string>; askedQuiz: Set<string>; callMeta: Map<string, unknown> }
        | undefined
      check('diagnostics exposed', diag !== undefined && typeof diag?.links?.has === 'function')

      // 13. Link-window staging (task 2.1): events arriving while the
      // backfill read is in flight are staged and released in order behind
      // it — no loss, no fake "restored" note.
      const winFile = path.join(tmp, 'window.md')
      fs.writeFileSync(winFile, '# Window note\n', 'utf8')
      const winSession = ctx.sessions.create('harness-window-session' as never, { meta: { cwd: tmp } as never })
      winSession.append('user/message', validUser('window history line', 'wu-1') as never, { surfaceOp: 'append' } as never)
      winSession.append('assistant/message', validAssistant('window history reply', 'wa-1') as never, { surfaceOp: 'append' } as never)
      // Fire the link WITHOUT awaiting it, then append live events while the
      // backfill read is in flight — the placeholder phase must stage them.
      const winLinkPromise = lessonLog?.execute({ file: winFile }, { callId: 'h14' as never, signal: new AbortController().signal, agent: { session: winSession } } as never)
      winSession.append('user/message', validUser('window live line', 'wu-2') as never, { surfaceOp: 'append' } as never)
      winSession.append('assistant/message', validAssistant('window live reply', 'wa-2') as never, { surfaceOp: 'append' } as never)
      let winLinkErr = ''
      let winLinkedText = ''
      try {
        winLinkedText = String(await winLinkPromise)
      } catch (error) {
        winLinkErr = error instanceof Error ? error.message : String(error)
      }
      check('window-phase link succeeds', winLinkErr === '' && winLinkedText.includes('Linked'), `${winLinkErr} ${winLinkedText}`)
      const okWin = await waitFor('window staged release', () => {
        const text = fs.readFileSync(winFile, 'utf8')
        return text.includes('window live line') && text.includes('window live reply')
      })
      const winText = fs.readFileSync(winFile, 'utf8')
      const iWHistU = winText.indexOf('window history line')
      const iWHistA = winText.indexOf('window history reply')
      const iWLiveU = winText.indexOf('window live line')
      const iWLiveA = winText.indexOf('window live reply')
      check(
        'window events staged then released in order (2.1)',
        okWin && iWHistU >= 0 && iWHistA > iWHistU && iWLiveU > iWHistA && iWLiveA > iWLiveU,
        `idx=${iWHistU},${iWHistA},${iWLiveU},${iWLiveA}`,
      )
      check('window-phase link writes no restore note (2.1)', !winText.includes('lesson-log restored'), winText.slice(0, 200))
      await lessonUnlog?.execute({}, { callId: 'h15' as never, signal: new AbortController().signal, agent: { session: winSession } } as never)

      // 14. Old-v2-record restore + one-time restore note (tasks 1.2 / 2.3).
      // The record was seeded in the OLD v2 shape (no restoredNotedAt) in the
      // synchronous prelude; its restore fired when the plugin's storage
      // became ready (the history events above). The session is then
      // "restarted" twice by detaching it from the store (fires
      // session/disposed → links cleanup) and re-entering the SAME session
      // object (seq continues, like a real resume).
      const okRestore1 = await waitFor('first restore note', () => countMarker(fs.readFileSync(noteFile, 'utf8'), 'lesson-log restored') >= 1)
      const noteText1 = fs.readFileSync(noteFile, 'utf8')
      check(
        'old v2 record (no restoredNotedAt) restores — note once, no history re-mirror (1.2)',
        okRestore1 && countMarker(noteText1, 'lesson-log restored') === 1 && countMarker(noteText1, 'note history line') === 0,
        `notes=${countMarker(noteText1, 'lesson-log restored')} hist=${countMarker(noteText1, 'note history line')}`,
      )
      check('restoredNotedAt persisted after the note lands (2.3)', readStoredRecord(noteSessionId)?.restoredNotedAt !== undefined, JSON.stringify(readStoredRecord(noteSessionId)))
      check('watermark kept from the old record (1.2)', readStoredRecord(noteSessionId)?.lastSeq === nSeq2, `stored=${JSON.stringify(readStoredRecord(noteSessionId))} expected=${nSeq2}`)
      // — restart #2: detach (session/disposed → links cleanup), re-enter.
      noteDetach1()
      const okDisposed = await waitFor('links cleanup on dispose (1.1)', () => diag?.links.has(noteSessionId) === false, 30)
      check('links entry dropped on session dispose (1.1/3.1)', okDisposed === true && diag?.links.has(noteSessionId) === false)
      const noteDetach2 = ctx.sessions.enter(noteSession as never) as () => void
      ctx.sessions.announce(noteSession as never)
      noteSession.append('user/message', validUser('note after first restart', 'nu-2') as never, { surfaceOp: 'append' } as never)
      const okRestore2 = await waitFor('second restore mirror', () => fs.readFileSync(noteFile, 'utf8').includes('note after first restart'))
      const noteText2 = fs.readFileSync(noteFile, 'utf8')
      check('second restart resumes mirroring', okRestore2)
      check(
        'second restart adds NO second note (2.3)',
        countMarker(noteText2, 'lesson-log restored') === 1 && countMarker(noteText2, 'note history line') === 0,
        `notes=${countMarker(noteText2, 'lesson-log restored')} hist=${countMarker(noteText2, 'note history line')}`,
      )
      // — restart #3: same drill, the note stays at exactly one.
      noteDetach2()
      await waitFor('links cleanup on second dispose', () => diag?.links.has(noteSessionId) === false, 30)
      const noteDetach3 = ctx.sessions.enter(noteSession as never) as () => void
      ctx.sessions.announce(noteSession as never)
      noteSession.append('user/message', validUser('note after second restart', 'nu-3') as never, { surfaceOp: 'append' } as never)
      const okRestore3 = await waitFor('third restore mirror', () => fs.readFileSync(noteFile, 'utf8').includes('note after second restart'))
      const noteText3 = fs.readFileSync(noteFile, 'utf8')
      check('third restart mirrors new content', okRestore3)
      check(
        'third restart still keeps the note at exactly one (2.3)',
        countMarker(noteText3, 'lesson-log restored') === 1 && countMarker(noteText3, 'note history line') === 0,
        `notes=${countMarker(noteText3, 'lesson-log restored')} hist=${countMarker(noteText3, 'note history line')}`,
      )

      // 15. Skipped quiz (task 4.1) + pre-answer leak freedom (task 4.2):
      // run a quiz through the real tool with an auto-answerer that submits
      // NOTHING, and assert the skip signal, the mirrored verdict block, and
      // that the pending-state mirror/request carry no answer.
      // Without a live agent registry entry the ask must NOT carry an agent
      // (the host rejects unknown agents), so the quiz executes agent-less and
      // its sessionId is 'unknown'. To give the mirror a target, a session
      // with exactly that id is created and linked to a dedicated file.
      const quizMirrorId = 'unknown'
      const quizMirrorFile = path.join(tmp, 'quiz-mirror.md')
      fs.writeFileSync(quizMirrorFile, '# Quiz mirror\n', 'utf8')
      const quizMirrorSession = ctx.sessions.create(quizMirrorId as never, { meta: { cwd: tmp } as never })
      const quizMirrorLinked = await lessonLog?.execute({ file: quizMirrorFile }, { callId: 'h15b' as never, signal: new AbortController().signal, agent: { session: quizMirrorSession } } as never)
      check('quiz mirror session linked', typeof quizMirrorLinked === 'string' && String(quizMirrorLinked).includes('Linked'), String(quizMirrorLinked))
      const quizCallId = 'harness-skip-quiz'
      const quizArgs = {
        question: 'Which packet opens a TCP connection?',
        options: [
          { value: 'syn', label: 'SYN' },
          { value: 'ack', label: 'ACK' },
        ],
        correctAnswer: 'syn',
        explanation: 'SYN sends the very first packet.',
      }
      let quizRequestJson = ''
      let mirrorAtPending = ''
      let sawQuizRequest = false
      const answererOff = ctx.on('user-questions/request', (request: unknown, next: () => Promise<unknown>) => {
        const req = request as { questions?: Array<{ id?: unknown }> }
        if (Array.isArray(req?.questions) && (req.questions[0] as { id?: unknown } | undefined)?.id === 'quiz') {
          if (sawQuizRequest) return next()
          sawQuizRequest = true
          // Pending state: give the asked-hook pre-write time to land, then
          // snapshot the pending mirror + the request the user sees.
          return new Promise((resolve) => {
            setTimeout(() => {
              try {
                quizRequestJson = JSON.stringify(request)
                mirrorAtPending = fs.readFileSync(quizMirrorFile, 'utf8')
              } catch {
                // keep the previous snapshots on read failure
              }
              resolve({ answers: [{ id: 'quiz', selected: [] }] })
            }, 500)
          })
        }
        return next()
      })
      // The quiz call must exist in the session log so the verdict mirrors.
      // tool/call is not surface-eligible — appended without surfaceOp, like
      // the backfill fixture in step 3.
      const qCallSeq = quizMirrorSession.append('tool/call', { turn: 2, step: 1, callId: quizCallId, name: 'quiz', arguments: JSON.stringify(quizArgs) } as never).seq
      const quizTool = ctx.tools.get('quiz')
      let r15: Record<string, unknown> | undefined
      let quizErr15 = ''
      try {
        // No agent: the ask then runs over the global answerer waterfall.
        r15 = await quizTool?.execute(quizArgs, { callId: quizCallId as never, signal: new AbortController().signal } as never) as Record<string, unknown>
      } catch (error) {
        quizErr15 = error instanceof Error ? error.message : String(error)
      }
      answererOff()
      check('skip quiz executed (empty submission)', quizErr15 === '' && r15 !== undefined, quizErr15)
      check('skip returns dontKnow signal with skipped flag (4.1)', r15?.status === 'dontKnow' && r15?.dontKnow === true && r15?.skipped === true && r15?.correct === false, JSON.stringify(r15))
      const feedback15 = (quizTool?.output?.render as ((_args: unknown, value: unknown) => Array<{ text?: string }> | undefined) | undefined)?.(undefined, r15)?.[0]?.text ?? ''
      check(
        'skip feedback has no ✗ and reveals the answer (4.1)',
        !feedback15.includes('✗') && feedback15.includes('Correct answer: syn') && feedback15.includes('SYN sends the very first packet.'),
        feedback15,
      )
      check('skip feedback notes skipped (4.1)', feedback15.includes('Skipped') && feedback15.includes('no answer'), feedback15)
      // Mirror the persisted tool/result (the agent loop would do this on the
      // real surface) and assert the verdict block.
      quizMirrorSession.append('tool/result', {
        turn: 2,
        step: 1,
        message: { id: 'tr-skip', role: 'tool', source: { kind: 'tool', callId: quizCallId }, toolCallId: quizCallId, content: [{ type: 'text', text: feedback15 }], isError: false },
        meta: r15,
      } as never, { surfaceOp: 'append', sourceEventSeqs: [qCallSeq] } as never)
      const okSkipMirror = await waitFor('skipped verdict mirror', () => fs.readFileSync(quizMirrorFile, 'utf8').includes('Quiz — skipped'))
      const skipText = fs.readFileSync(quizMirrorFile, 'utf8')
      const skipBlock = skipText.slice(skipText.lastIndexOf('> [!question]'))
      check(
        'log verdict block titled Quiz — skipped with no ✗ (4.1)',
        okSkipMirror && skipBlock.includes('Quiz — skipped') && skipBlock.includes('Your answer: (skipped') && !skipBlock.includes('✗'),
        skipBlock.slice(0, 200),
      )
      check('log skipped block reveals answer + explanation (4.1)', skipBlock.includes('Correct answer: SYN') && skipBlock.includes('SYN sends the very first packet.'), skipBlock.slice(0, 200))
      check(
        'pending mirror has 题面 but no answer/explanation (4.2)',
        mirrorAtPending.includes('Which packet opens a TCP connection?') && !mirrorAtPending.includes('SYN sends the very first packet.'),
        'pending mirror snapshot missing 题面 or leaked explanation',
      )
      check('pending mirror has no verdict block yet (4.2)', mirrorAtPending !== '' && !mirrorAtPending.slice(mirrorAtPending.lastIndexOf('> [!question]')).includes('Correct answer:'))
      check(
        'pending ask request leaks nothing (4.2)',
        quizRequestJson !== '' && !quizRequestJson.includes('SYN sends') && !quizRequestJson.includes('correctAnswer'),
        quizRequestJson.slice(0, 200),
      )

      // 16. FIFO bounds (task 3.1): a burst of bash calls on a linked session
      // fills callMeta without mirroring anything; the cap holds and
      // mirroring still works. A burst of unlinked sessions fills
      // knownUnlinked the same way; askedQuiz rides the identical helper.
      const FIFO_LIMIT = 1024
      const burst = FIFO_LIMIT + 30
      const boundFile = path.join(tmp, 'bound.md')
      fs.writeFileSync(boundFile, '# Bound\n', 'utf8')
      const boundSession = ctx.sessions.prepare('harness-bound-session' as never, { meta: { cwd: tmp } as never } as never)
      const boundDetach = ctx.sessions.enter(boundSession as never) as () => void
      ctx.sessions.announce(boundSession as never)
      const boundLinked = await lessonLog?.execute({ file: boundFile }, { callId: 'h16' as never, signal: new AbortController().signal, agent: { session: boundSession } } as never)
      check('bound-stage session linked', typeof boundLinked === 'string' && String(boundLinked).includes('Linked'), String(boundLinked))
      for (let i = 0; i < burst; i += 1) {
        boundSession.append('tool/call', { turn: 3, step: i, callId: `burst-${i}`, name: 'bash', arguments: JSON.stringify({ command: 'true' }) } as never)
      }
      boundSession.append('user/message', validUser('post-burst mirror line', 'bu-1') as never, { surfaceOp: 'append' } as never)
      const okPostBurst = await waitFor('post-burst mirror', () => fs.readFileSync(boundFile, 'utf8').includes('post-burst mirror line'), 300)
      const boundText = fs.readFileSync(boundFile, 'utf8')
      check('callMeta bounded after burst (3.1)', diag !== undefined && diag.callMeta.size <= FIFO_LIMIT, `size=${diag?.callMeta.size}`)
      check('mirror still works after FIFO churn (3.1)', okPostBurst && !boundText.includes('burst-0') && boundText.includes('post-burst mirror line'))
      // knownUnlinked burst: one event per unlinked session is one add each.
      const kbuStamp = Date.now()
      for (let i = 0; i < burst; i += 1) {
        const kbu = ctx.sessions.create(`harness-kbu-${kbuStamp}-${i}` as never, { meta: { cwd: tmp } as never })
        kbu.append('user/message', validUser('kbu probe', `kbu-${i}`) as never, { surfaceOp: 'append' } as never)
      }
      const okKbu = await waitFor('knownUnlinked burst drained', () => diag !== undefined && diag.knownUnlinked.size >= FIFO_LIMIT, 600)
      check('knownUnlinked bounded (3.1)', okKbu && diag !== undefined && diag.knownUnlinked.size <= FIFO_LIMIT, `size=${diag?.knownUnlinked.size}`)
      check('askedQuiz bounded (3.1)', diag !== undefined && diag.askedQuiz.size <= FIFO_LIMIT, `size=${diag?.askedQuiz.size}`)
      // links bound: dispose the linked session — its entry must go.
      boundDetach()
      const okBoundDisposed = await waitFor('bound links cleanup', () => diag?.links.has('harness-bound-session') === false, 30)
      check('links shrink on dispose — end-event path chosen (1.1)', okBoundDisposed && diag !== undefined && diag.links.size < 8, `size=${diag?.links.size}`)
      await lessonUnlog?.execute({}, { callId: 'h17' as never, signal: new AbortController().signal, agent: { session: boundSession } } as never)
    } catch (error) {
      check('log harness completed without unexpected throw', false, error instanceof Error ? `${error.message}\n${error.stack?.split('\n')[1] ?? ''}` : String(error))
    } finally {
      const failed = results.filter((result) => !result.pass)
      console.log(`LOG HARNESS RESULT: ${results.length - failed.length}/${results.length} passed${failed.length > 0 ? ' — FAILURES above' : ''}`)
    }
  })()
}
