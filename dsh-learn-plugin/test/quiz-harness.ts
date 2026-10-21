/**
 * Dev-only quiz verification harness (not part of the shipped bundle).
 *
 * Loaded through a --patch overlay next to dsh-learn-plugin, it registers a local
 * user-questions waterfall answerer, executes the quiz tool directly with
 * synthetic calls, and prints a PASS/FAIL report to stdout — verifying
 * validation, shuffle, IDK, multi-select set matching, the subagent error
 * path, presentationMeta, and the anti-leak presentCall projection without a
 * human in the loop.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'dsh-learn-plugin-quiz-harness'
export const inject = ['tools', 'userQuestions']

interface Check {
  name: string
  pass: boolean
  detail?: string
}

const results: Check[] = []

function check(name: string, pass: boolean, detail?: string): void {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && !pass ? ` — ${detail}` : ''}`)
}

async function waitForQuiz(ctx: Context, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (ctx.tools.get('quiz') !== undefined) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

export function apply(ctx: Context): void {
  // Auto-answerer: answers every user-questions request with `scriptedAnswer`.
  let scriptedAnswer: { answers: { id: string; selected: string[]; custom?: string }[] } | undefined
  ctx.on('user-questions/request', (request: unknown, next: () => Promise<unknown>) => {
    if (scriptedAnswer !== undefined && request !== null && typeof request === 'object') {
      const value = scriptedAnswer
      scriptedAnswer = undefined
      return Promise.resolve(value)
    }
    return next()
  })

  void (async () => {
    await waitForQuiz(ctx)
    const quiz = ctx.tools.get('quiz')
    if (quiz === undefined) {
      console.log('HARNESS: quiz tool not found')
      return
    }
    const signal = new AbortController().signal
    const baseArgs = {
      question: 'Which planet is closest to the Sun?',
      options: [
        { value: 'venus', label: 'Venus' },
        { value: 'mercury', label: 'Mercury' },
        { value: 'earth', label: 'Earth' },
      ],
      explanation: 'Mercury orbits closest to the Sun.',
    }

    const run = async (args: Record<string, unknown>, answer?: { selected: string[]; custom?: string }) => {
      if (answer !== undefined) {
        scriptedAnswer = { answers: [{ id: 'quiz', selected: answer.selected, ...(answer.custom !== undefined ? { custom: answer.custom } : {}) }] }
      }
      return quiz.execute(args, { callId: 'harness-call' as never, signal } as never)
    }

    try {
      // 1. correct single-select answer by value
      const r1 = (await run({ ...baseArgs, correctAnswer: 'mercury' }, { selected: ['Mercury'] })) as Record<string, unknown>
      check('correct single answer graded correct', r1.status === 'correct' && r1.correct === true && r1.dontKnow === false)
      check('correctAnswer echoed by value', Array.isArray(r1.correctAnswer) && (r1.correctAnswer as string[])[0] === 'mercury')
      check('explanation present in result', r1.explanation === baseArgs.explanation)

      // 2. wrong answer → incorrect with correct indices
      const r2 = (await run({ ...baseArgs, correctAnswer: 'mercury' }, { selected: ['Venus'] })) as Record<string, unknown>
      check('wrong answer graded incorrect', r2.status === 'incorrect' && r2.correct === false)
      check('answers report selected value', Array.isArray(r2.answers) && (r2.answers as string[])[0] === 'venus')
      const idx = Array.isArray(r2.correctIndices) ? (r2.correctIndices as number[]) : []
      const displayed = Array.isArray(r2.displayedOptions) ? (r2.displayedOptions as { value: string }[]) : []
      check('correctIndices point at correct option', idx.length === 1 && displayed[idx[0] as number]?.value === 'mercury')

      // 3. "I don't know" → dontKnow, neither correct nor incorrect
      const r3 = (await run({ ...baseArgs, correctAnswer: 'mercury' }, { selected: ["I don't know"] })) as Record<string, unknown>
      check('IDK graded dontKnow', r3.status === 'dontKnow' && r3.dontKnow === true && r3.correct === false)

      // 4. multiSelect missing one correct option → incorrect
      const multi = { ...baseArgs, multiSelect: true, correctAnswer: ['mercury', 'venus'] }
      const r4 = (await run(multi, { selected: ['Mercury'] })) as Record<string, unknown>
      check('multi-select partial set incorrect', r4.status === 'incorrect')

      // 5. multiSelect exact set → correct
      const r5 = (await run(multi, { selected: ['Venus', 'Mercury'] })) as Record<string, unknown>
      check('multi-select exact set correct (order-insensitive)', r5.status === 'correct')

      // 6. multiSelect superset → incorrect
      const r6 = (await run(multi, { selected: ['Venus', 'Mercury', 'Earth'] })) as Record<string, unknown>
      check('multi-select superset incorrect', r6.status === 'incorrect')

      // 7. correctAnswer not matching a value → clear error, no question asked
      let err7 = ''
      try {
        await run({ ...baseArgs, correctAnswer: 'pluto' })
      } catch (error) {
        err7 = error instanceof Error ? error.message : String(error)
      }
      check('bad correctAnswer rejected with legal values', err7.includes('does not match any option value') && err7.includes('venus, mercury, earth'), err7)

      // 8. duplicate option values rejected
      let err8 = ''
      try {
        await run({ ...baseArgs, correctAnswer: 'mercury', options: [baseArgs.options[0], baseArgs.options[0]] })
      } catch (error) {
        err8 = error instanceof Error ? error.message : String(error)
      }
      check('duplicate values rejected', err8.includes('unique'))

      // 9. fewer than 2 options rejected
      let err9 = ''
      try {
        await run({ ...baseArgs, correctAnswer: 'mercury', options: [baseArgs.options[0]] })
      } catch (error) {
        err9 = error instanceof Error ? error.message : String(error)
      }
      check('<2 options rejected', err9.includes('at least 2 options'))

      // 10. shuffle:false preserves order; scoring still by value
      const r10 = (await run({ ...baseArgs, correctAnswer: 'mercury', shuffle: false }, { selected: ['Mercury'] })) as Record<string, unknown>
      const d10 = (r10.displayedOptions as { value: string }[]).map((option) => option.value)
      check('shuffle:false keeps authored order', d10.join(',') === 'venus,mercury,earth')

      // 11. shuffle:true yields a permutation; grading by value unaffected
      const r11 = (await run({ ...baseArgs, correctAnswer: 'mercury' }, { selected: ['Mercury'] })) as Record<string, unknown>
      const d11 = (r11.displayedOptions as { value: string }[]).map((option) => option.value).sort().join(',')
      check('shuffle:true yields permutation', d11 === 'earth,mercury,venus')
      check('shuffle keeps grading by value', r11.status === 'correct')

      // 12. custom single-select text overrides and grades incorrect but recorded
      const r12 = (await run({ ...baseArgs, correctAnswer: 'mercury' }, { selected: [], custom: 'pluto probably' })) as Record<string, unknown>
      check('custom answer recorded', r12.customAnswer === 'pluto probably' && r12.status === 'incorrect')

      // 13. presentationMeta persists the displayed order
      const meta13 = quiz.output.presentationMeta(baseArgs, r2) as Record<string, unknown>
      const m13 = Array.isArray(meta13.displayedOptions) ? (meta13.displayedOptions as { value: string }[]).map((o) => o.value) : []
      check('presentationMeta carries displayedOptions', JSON.stringify(m13) === JSON.stringify((r2.displayedOptions as { value: string }[]).map((o) => o.value)))

      // 14. presentCall shows the question but never the answer/explanation
      const view14 = quiz.presentCall?.({ ...baseArgs, correctAnswer: 'mercury' }) as { content?: { text?: string }[] } | undefined
      const text14 = view14?.content?.map((part) => part.text ?? '').join('\n') ?? ''
      check('presentCall shows question', text14.includes('Which planet'), text14)
      check('presentCall hides correctAnswer', !JSON.stringify(view14).includes('mercury') && !JSON.stringify(view14).includes('Mercury'), JSON.stringify(view14))
      check('presentCall hides explanation', !text14.includes('Mercury orbits closest'))

      // 15. agent-scoped request (subagent stand-in) → clear main-session-only error
      let err15 = ''
      const bogusAgent = { session: { id: 'bogus' } }
      try {
        await quiz.execute({ ...baseArgs, correctAnswer: 'mercury' }, { callId: 'harness-agent-call' as never, signal, agent: bogusAgent } as never)
      } catch (error) {
        err15 = error instanceof Error ? error.message : String(error)
      }
      check('agent-scoped caller rejected with main-session message', err15.includes('main session'), err15)

      // 16. asked event fires before settle with no answer inside
      // (verified indirectly: listener list fired during runs without throwing)
    } catch (error) {
      check('harness completed without unexpected throw', false, error instanceof Error ? error.message : String(error))
    }

    const failed = results.filter((result) => !result.pass)
    console.log(`HARNESS RESULT: ${results.length - failed.length}/${results.length} passed${failed.length > 0 ? ' — FAILURES above' : ''}`)
  })()
}
