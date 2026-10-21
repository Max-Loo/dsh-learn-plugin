/**
 * Dev-only probe: reproduce the lesson-log backfill read and dump exactly what
 * ctx.sessionQuery.readSession() returns (or throws) to stdout.
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-learn-plugin-backfill-probe'
export const inject = ['sessions', 'sessionQuery']

export function apply(ctx: Context): void {
  void (async () => {
    for (let i = 0; i < 50; i += 1) {
      if (ctx.get('sessionQuery') !== undefined) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const sessionId = 'probe-log-session' as never
    const session = ctx.sessions.create(sessionId, { meta: { cwd: '/tmp' } as never })
    session.append('user/message', {
      id: 'pu-1',
      role: 'user',
      content: [{ type: 'text', text: 'probe user line' }],
      source: { kind: 'user' },
    } as never, { surfaceOp: 'append' } as never)
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      stream: [],
      message: {
        id: 'pa-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'probe assistant line' }],
        source: { kind: 'model', provider: 'probe', model: 'probe-model' },
      },
    } as never, { surfaceOp: 'append' } as never)

    await new Promise((resolve) => setTimeout(resolve, 300))
    try {
      const log = await ctx.sessionQuery.readSession(sessionId)
      console.log('PROBE readSession resolved; top-level keys:', Object.keys(log as object))
      console.log('PROBE readSession JSON (first 2000 chars):', JSON.stringify(log, null, 1).slice(0, 2000))
    } catch (error) {
      console.log('PROBE readSession THREW:', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    }
    console.log('PROBE done')
  })()
}
