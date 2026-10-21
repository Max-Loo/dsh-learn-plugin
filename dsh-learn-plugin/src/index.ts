import type { Context } from '@deepseek-ai/cordis'
import * as log from './log.js'
import * as quiz from './quiz.js'

/**
 * dsh-learn-plugin — DSH port of the pi-based `learn` study system.
 *
 * Host side: the `quiz` graded-question tool (P1) and the lesson-log mirror
 * (P2: lesson_log/lesson_unlog tools, /lesson-log and /lesson-unlog user
 * commands, session-event mirroring with backfill). The Web client half
 * (client/index.js) provides the quiz tool card through the
 * `tool.call.toolview` slot.
 */
export const name = 'dsh-learn-plugin'
export const inject = [...new Set([...quiz.inject, ...log.inject])]

export function apply(ctx: Context) {
  ctx.plugin(quiz)
  ctx.plugin(log)
  console.log('[dsh-learn-plugin] plugin loaded')
}
