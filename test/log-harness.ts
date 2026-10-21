/**
 * Dev-only lesson-log verification harness (not part of the shipped bundle).
 *
 * Creates a REAL session, appends real events (user/assistant prose, an
 * ask_user_question call+result, a quiz result with presentationMeta), links
 * a file through the lesson_log tool, and asserts the mirrored markdown:
 * backfill completeness, block order, no-answer-in-题面, live mirroring after
 * link, unlog stopping the mirror, and durable link persistence.
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

export function apply(ctx: Context): void {
  void (async () => {
    if (!(await waitFor('lesson_log tool', () => ctx.tools.get('lesson_log') !== undefined))) return
    const lessonLog = ctx.tools.get('lesson_log')
    const lessonUnlog = ctx.tools.get('lesson_unlog')
    const sessionId = 'harness-log-session' as never
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-learn-plugin-log-'))
    const logFile = path.join(tmp, 'lesson.md')
    fs.writeFileSync(logFile, '# Existing note\n\nSome prior content.\n', 'utf8')

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
    } catch (error) {
      check('log harness completed without unexpected throw', false, error instanceof Error ? `${error.message}\n${error.stack?.split('\n')[1] ?? ''}` : String(error))
    } finally {
      const failed = results.filter((result) => !result.pass)
      console.log(`LOG HARNESS RESULT: ${results.length - failed.length}/${results.length} passed${failed.length > 0 ? ' — FAILURES above' : ''}`)
    }
  })()
}

function persistedOnDisk(sessionId: string): boolean {
  // The dsh home is redirectable (DSH_HOME) — dev runs use a workspace copy.
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  const root = path.join(home, 'storages')
  const visit = (dir: string): boolean => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (visit(full)) return true
        } else if (full.includes('learn_dsh_lesson_log')) {
          const text = fs.readFileSync(full, 'utf8')
          if (text.includes(sessionId) && text.includes('lesson.md')) return true
        }
      }
    } catch {
      return false
    }
    return false
  }
  return visit(root)
}
