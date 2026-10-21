/**
 * Dev-only two-phase probe for the restart-restore path (not shipped).
 *
 * RESTORE_PHASE=A: create a session with history, link a fixture file via the
 *   lesson_log tool, flush, print "PHASE A OK".
 * RESTORE_PHASE=B (a NEW dsh process): re-open the same session, append one
 *   user message, and verify the plugin restored the link from its durable
 *   storage — restore note + the new line must appear in the file.
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

async function waitUntil(label: string, probe: () => boolean, tries = 80): Promise<boolean> {
  for (let i = 0; i < tries; i += 1) {
    if (probe()) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  console.log(`RESTORE PROBE TIMEOUT: ${label}`)
  return false
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
      await ctx.sessions.flush(session as never)
      const ok = await waitUntil('backfill visible', () => fs.readFileSync(logFile, 'utf8').includes('pre-restart user line'))
      console.log(`RESTORE PROBE A ${ok ? 'OK' : 'FAILED'}`)
      return
    }

    // Phase B — cold process. The link record for this session id lives in
    // the durable storage-domain table from phase A; this process starts the
    // plugin with cold storage and re-creates the session activity (a real
    // restart replays the platform-side log the same way). The plugin must
    // re-link from its table, write the restore note, and mirror new events.
    ctx.on('session/event', (session: { id?: unknown }, event: { type?: unknown; seq?: unknown }) => {
      console.log('PROBE EVENT:', String(session?.id), String(event?.type), String(event?.seq))
    })
    const session = ctx.sessions.create(sessionId, { meta: { cwd: process.cwd() } as never })
    await new Promise((resolve) => setTimeout(resolve, 1000))
    session.append('user/message', validUser('post-restart line must mirror', 'ru-2') as never, { surfaceOp: 'append' } as never)
    const ok = await waitUntil('restore note + new line', () => {
      const text = fs.readFileSync(logFile, 'utf8')
      return text.includes('lesson-log restored') && text.includes('post-restart line must mirror')
    })
    const text = fs.readFileSync(logFile, 'utf8')
    console.log(`RESTORE PROBE B ${ok ? 'OK' : 'FAILED'}`)
    console.log('RESTORE PROBE B file tail:', JSON.stringify(text.slice(-500)))
  })().catch((error) => {
    console.log(`RESTORE PROBE ${process.env.RESTORE_PHASE ?? '?'} ERROR:`, error instanceof Error ? error.message : String(error))
  })
}
