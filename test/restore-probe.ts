/**
 * Dev-only two-phase probe for the restart-restore path (not shipped).
 *
 * RESTORE_PHASE=A: create a session with history, link a fixture file via the
 *   lesson_log tool, write a quiz 题面 (simulating the asked hook's pre-write),
 *   append a persisted quiz tool/call, flush, print "PHASE A OK".
 * RESTORE_PHASE=B (a NEW dsh process): re-open the same session, verify the
 *   plugin restored the link from its durable storage (restore note), that
 *   replayed/re-delivered history does NOT duplicate what A already mirrored
 *   (task 3.1 — durable watermark boundary), then deliver a quiz tool/result
 *   AFTER the restart and verify the verdict block lands after the A-phase
 *   题面 without a second question block (task 3.2 — cross-restart verdict).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-learn-plugin-restore-probe'
export const inject = ['tools', 'sessions']

const sessionId = 'restore-probe-session' as never
const home = process.env.DSH_HOME ?? path.join(process.env.HOME ?? '', '.dsh')
const fixtureDir = path.join(home, 'restore-fixture')
const logFile = path.join(fixtureDir, 'lesson.md')

const QUIZ_CALL_ID = 'probe-quiz-call'

function validUser(text: string, id: string) {
  return { id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }
}

function validAssistant(text: string, id: string) {
  return {
    turn: 1,
    step: 1,
    stream: [],
    message: {
      id,
      role: 'assistant',
      content: [{ type: 'text', text }],
      source: { kind: 'model', provider: 'probe', model: 'probe-model' },
    },
  }
}

function quizResultEvent(seqTurn: number) {
  return {
    turn: seqTurn,
    step: 1,
    message: {
      id: 'probe-quiz-result',
      role: 'tool',
      source: { kind: 'tool', callId: QUIZ_CALL_ID },
      toolCallId: QUIZ_CALL_ID,
      content: [{ type: 'text', text: 'Quiz result: Correct ✓' }],
      isError: false,
    },
    meta: {
      phase: 'settled',
      callId: QUIZ_CALL_ID,
      sessionId: String(sessionId),
      question: 'What does the watermark protect?',
      displayedOptions: [
        { value: 'order', label: 'ordering' },
        { value: 'dup', label: 'against duplication' },
      ],
      answers: ['dup'],
      status: 'correct',
      correct: true,
      dontKnow: false,
      correctIndices: [1],
      correctAnswer: ['dup'],
      explanation: 'The durable watermark is the only replay boundary.',
      multiSelect: false,
    },
  }
}

async function waitUntil(label: string, probe: () => boolean, tries = 80): Promise<boolean> {
  for (let i = 0; i < tries; i += 1) {
    if (probe()) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  console.log(`RESTORE PROBE TIMEOUT: ${label}`)
  return false
}

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1
}

export function apply(ctx: Context): void {
  void (async () => {
    const phase = process.env.RESTORE_PHASE ?? 'A'
    fs.mkdirSync(fixtureDir, { recursive: true })
    if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '# Fixture note\n', 'utf8')

    if (phase === 'A') {
      for (let i = 0; i < 50; i += 1) {
        if (ctx.tools.get('lesson_log') !== undefined) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      // Same cwd scope as phase B's process: persistence backends key
      // sessions off meta.cwd, so both phases must share the project root.
      const session = ctx.sessions.create(sessionId, { meta: { cwd: process.cwd() } as never })
      session.append('user/message', validUser('pre-restart user line', 'ru-1') as never, { surfaceOp: 'append' } as never)
      session.append('assistant/message', validAssistant('pre-restart assistant line', 'ra-1') as never, { surfaceOp: 'append' } as never)
      const lessonLog = ctx.tools.get('lesson_log')
      const result = (await lessonLog?.execute({ file: logFile }, { callId: 'restore-a' as never, signal: new AbortController().signal, agent: { session } } as never)) as string
      console.log('RESTORE PROBE A link:', result)
      // The 题面 pre-write happens through the quiz module's in-process asked
      // hook; a cold probe process cannot fire it, so write what the hook
      // would have written, then persist the quiz tool/call the way the real
      // quiz tool does before the user answers.
      fs.appendFileSync(logFile, '\n\n> [!question] Quiz\n> What does the watermark protect?\n>\n> 1. ordering\n> 2. against duplication\n', 'utf8')
      session.append('tool/call', {
        turn: 2,
        step: 1,
        callId: QUIZ_CALL_ID,
        name: 'quiz',
        arguments: JSON.stringify({ question: 'What does the watermark protect?', options: [{ value: 'order' }, { value: 'dup' }], correctAnswer: 'dup', explanation: 'The durable watermark is the only replay boundary.' }),
      } as never)
      await ctx.sessions.flush(session as never)
      const ok = await waitUntil('backfill visible', () => fs.readFileSync(logFile, 'utf8').includes('pre-restart user line'))
      console.log(`RESTORE PROBE A ${ok ? 'OK' : 'FAILED'}`)
      return
    }

    // Phase B — cold process. The link record for this session id lives in
    // the durable storage-domain table from phase A; this process starts the
    // plugin with cold storage and re-creates the session activity. A real
    // restart replays the platform-side log with CONTINUOUS seqs; this
    // probe's create starts a fresh log at seq 0, so the probe pads the log
    // with replayed-history stand-ins until seqs pass A's durable watermark —
    // everything at or below the watermark must be skipped (task 3.1), and
    // only post-watermark events may mirror.
    const storedDoc = (() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(home, 'storages', 'learn_dsh_lesson_log_v2.json'), 'utf8')) as {
          tables?: { links?: Record<string, { lastSeq?: number }> }
        }
      } catch {
        return {}
      }
    })()
    const watermark = storedDoc.tables?.links?.[String(sessionId)]?.lastSeq ?? 0
    console.log('RESTORE PROBE B durable watermark:', watermark)
    const session = ctx.sessions.create(sessionId, { meta: { cwd: process.cwd() } as never })
    // Replayed-history stand-ins (text distinct from phase A's mirrored
    // lines). One of them replays the persisted quiz tool/call, so the
    // post-restart verdict can rebuild its call context from the log (task
    // 3.2) exactly as a real replay would.
    const padCount = watermark + 2
    for (let i = 0; i <= padCount; i += 1) {
      // The replayed quiz call goes FIRST so its persisted seq lands below
      // the durable watermark — exactly how a real restart re-delivers the
      // pre-restart quiz call. The plugin must skip it (watermark), rebuild
      // the call context from the persisted log on the result (task 3.2),
      // mark the 题面 as already mirrored, and append ONLY the verdict.
      if (i === 0) {
        session.append('tool/call', {
          turn: 2,
          step: 1,
          callId: QUIZ_CALL_ID,
          name: 'quiz',
          arguments: JSON.stringify({ question: 'What does the watermark protect?', options: [{ value: 'order' }, { value: 'dup' }], correctAnswer: 'dup', explanation: 'The durable watermark is the only replay boundary.' }),
        } as never)
        continue
      }
      session.append('user/message', validUser(`replayed history pad ${i}`, `rp-${i}`) as never, { surfaceOp: 'append' } as never)
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    session.append('user/message', validUser('post-restart line must mirror', 'ru-2') as never, { surfaceOp: 'append' } as never)
    const ok = await waitUntil('restore note + new line', () => {
      const text = fs.readFileSync(logFile, 'utf8')
      return text.includes('lesson-log restored') && text.includes('post-restart line must mirror')
    })
    const textB1 = fs.readFileSync(logFile, 'utf8')
    const noDup = countOf(textB1, 'pre-restart user line') === 1 && countOf(textB1, 'pre-restart assistant line') === 1
    const belowWatermarkPadsSkipped = !textB1.includes('replayed history pad 0') && !textB1.includes('replayed history pad 1')
    console.log(`RESTORE PROBE B restore+mirror ${ok ? 'OK' : 'FAILED'}`)
    console.log(`RESTORE PROBE B history-not-duplicated ${noDup && belowWatermarkPadsSkipped ? 'OK' : 'FAILED'} (pre-restart lines once=${noDup}, sub-watermark replay pads not mirrored=${belowWatermarkPadsSkipped})`)

    // Task 3.2: a quiz whose 题面 phase A wrote and whose tool/call phase A
    // persisted. The verdict arrives only now, in this restarted process:
    // callMeta is empty, so the plugin must rebuild the call context from the
    // persisted history and append ONLY the verdict block, after the existing
    // 题面 — no second question, no dangling question without a verdict.
    session.append('tool/result', quizResultEvent(2) as never, { surfaceOp: 'append' } as never)
    const okVerdict = await waitUntil('cross-restart verdict block', () => fs.readFileSync(logFile, 'utf8').includes('> [!success] Quiz — correct ✓'))
    const textB2 = fs.readFileSync(logFile, 'utf8')
    const iQuestion = textB2.indexOf('> [!question] Quiz')
    const iVerdict = textB2.indexOf('> [!success] Quiz — correct ✓')
    const questionOnce = countOf(textB2, '> [!question] Quiz') === 1
    const verdictAfterQuestion = iQuestion >= 0 && iVerdict > iQuestion
    console.log(`RESTORE PROBE B cross-restart verdict ${okVerdict && questionOnce && verdictAfterQuestion ? 'OK' : 'FAILED'} (question once=${questionOnce}, verdict after question=${verdictAfterQuestion})`)
  })().catch((error) => {
    console.log(`RESTORE PROBE ${process.env.RESTORE_PHASE ?? '?'} ERROR:`, error instanceof Error ? error.message : String(error))
  })
}
