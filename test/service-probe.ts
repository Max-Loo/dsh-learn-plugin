/** Dev-only probe: wait for the log services, then report availability. */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-learn-plugin-service-probe'
export const inject = ['tools', 'commands', 'storageDomain', 'sessionQuery']

export function apply(ctx: Context): void {
  console.log('PROBE: all four services available (inject resolved)')
  for (const name of ['userQuestions', 'sessions', 'storage']) {
    let present = false
    try {
      present = ctx.get(name) !== undefined
    } catch {
      present = false
    }
    console.log(`PROBE service ${name}: ${present ? 'present' : 'MISSING'}`)
  }
}
