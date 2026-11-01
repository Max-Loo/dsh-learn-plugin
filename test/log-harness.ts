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
 * backfill, and the .md / outside-workspace target constraints.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'dsh-learn-plugin-log-harness'
export const inject = ['tools', 'sessions', 'sessionQuery', 'commands']

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

function readStoredRecord(sessionId: string): { file?: string; linkedAt?: string; lastSeq?: number } | undefined {
  for (const domainName of ['learn_dsh_lesson_log_v2', 'learn_dsh_lesson_log']) {
    try {
      const doc = JSON.parse(fs.readFileSync(dshStorageUnitPath(domainName), 'utf8')) as { tables?: { links?: Record<string, { file?: string; linkedAt?: string; lastSeq?: number }> } }
      const record = doc.tables?.links?.[sessionId]
      if (record !== undefined) return record
    } catch {
      // try the next unit file
    }
  }
  return undefined
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
      const agentStub = { session } as never
      const cmdLink = await ctx.commands.execute(agentStub, `/lesson-log ${logFile}`, [], new AbortController().signal)
      const linkText = JSON.stringify(cmdLink?.result ?? cmdLink)
      check('command /lesson-log links', cmdLink?.result?.kind === 'success' && linkText.includes('Linked'), linkText)
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
    } catch (error) {
      check('log harness completed without unexpected throw', false, error instanceof Error ? `${error.message}\n${error.stack?.split('\n')[1] ?? ''}` : String(error))
    } finally {
      const failed = results.filter((result) => !result.pass)
      console.log(`LOG HARNESS RESULT: ${results.length - failed.length}/${results.length} passed${failed.length > 0 ? ' — FAILURES above' : ''}`)
    }
  })()
}
