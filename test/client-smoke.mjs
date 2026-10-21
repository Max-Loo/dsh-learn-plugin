/**
 * DOM-free smoke test for the dsh-learn-plugin web client bundle.
 *
 * Loads client/index.js through a __ModuleLoader__ stub, materializes the
 * factory with a react stub, runs apply() against a slots stub, and renders
 * QuizRow for the pending / settled / error phases — asserting the anti-leak
 * contract: pending output never contains correctAnswer or explanation.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, '..', 'client', 'index.js'), 'utf8')

let captured
globalThis.window = {
  __ModuleLoader__: {
    load: (definition) => {
      captured = definition
    },
  },
}
// Execute the bundle registration side effect.
new Function(source)()

if (captured === undefined || captured.id !== 'dsh-learn-plugin') throw new Error('bundle did not register with __ModuleLoader__')

// Minimal react stub: mirrors React's props.children semantics.
const reactStub = {
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children },
    varChildren: children,
  }),
}
const clientExports = captured.factory((name) => {
  if (name === 'react') return reactStub
  throw new Error(`unexpected module request: ${name}`)
})

if (typeof clientExports.apply !== 'function') throw new Error('client bundle exports no apply()')
if (!Array.isArray(clientExports.inject) || !clientExports.inject.includes('slots')) {
  throw new Error('client bundle inject must include slots')
}

// apply() against a slots stub; capture the registered component.
let registered
const fakeCtx = {
  slots: {
    inject: (name, register) => {
      registered = register()
    },
    register: (options, component) => ({ options, component }),
  },
}
clientExports.apply(fakeCtx)
if (registered === undefined) throw new Error('apply() registered nothing')
if (registered.options.name !== 'tool.call.toolview' || registered.options.key !== 'quiz') {
  throw new Error(`registered on wrong slot/key: ${JSON.stringify(registered.options)}`)
}
const QuizRow = registered.component

// Render helper: flatten the element tree into searchable text, calling
// function components with their props the way React would.
function flatten(node) {
  if (node === null || node === undefined || typeof node !== 'object') return String(node ?? '')
  if (Array.isArray(node)) return node.map(flatten).join('\n')
  if (typeof node.type === 'function') return flatten(node.type(node.props))
  return flatten(node.props?.children ?? node.varChildren)
}

const call = {
  question: 'Which planet is closest to the Sun?',
  options: [
    { value: 'venus', label: 'Venus' },
    { value: 'mercury', label: 'Mercury' },
  ],
  correctAnswer: 'mercury',
  explanation: 'Mercury orbits closest to the Sun.',
}
const meta = {
  phase: 'settled',
  question: call.question,
  displayedOptions: [
    { value: 'mercury', label: 'Mercury' },
    { value: 'venus', label: 'Venus' },
  ],
  answers: ['venus'],
  status: 'incorrect',
  correct: false,
  dontKnow: false,
  correctIndices: [0],
  correctAnswer: ['mercury'],
  explanation: call.explanation,
}

let failures = 0
const check = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` — ${detail}`}`)
  if (!pass) failures += 1
}

// Pending (preparing phase) — question placeholder, no args access.
const preparing = flatten(QuizRow({ phase: 'preparing', block: { phase: 'preparing' } }))
check('preparing shows placeholder', preparing.includes('Quiz question'))

// Pending (start phase) — question + count, NEVER the answer or explanation.
const pending = flatten(QuizRow({ phase: 'start', block: { kind: 'call', call: { name: 'quiz', argsRaw: JSON.stringify(call) } } }))
check('pending shows question', pending.includes('Which planet'), pending)
check('pending hides correctAnswer value', !pending.includes('mercury'), pending)
check('pending hides correctAnswer label', !pending.includes('Mercury'), pending)
check('pending hides explanation', !pending.includes('orbits closest'), pending)
check('pending shows option count', pending.includes('2 options'), pending)

// Settled — full feedback from meta.
const settled = flatten(QuizRow({ phase: 'result', block: { kind: 'result', meta, content: [{ type: 'text', text: 'graded' }] } }))
check('settled shows verdict', settled.includes('Incorrect'))
check('settled marks your wrong answer', settled.includes('✗') && settled.includes('your answer'))
check('settled marks the correct answer', settled.includes('✓') && settled.includes('correct, not selected'))
check('settled shows explanation', settled.includes('orbits closest'))
check('settled preserves displayed order', settled.indexOf('Mercury') < settled.indexOf('Venus'))

// dontKnow settled — ✓ on correct answer, no ✗ anywhere.
const idk = flatten(
  QuizRow({
    phase: 'result',
    block: { kind: 'result', meta: { ...meta, answers: [], status: 'dontKnow', dontKnow: true }, content: [] },
  }),
)
check('dontKnow shows IDK verdict', idk.includes('I don’t know'))
check('dontKnow shows no ✗', !idk.includes('✗'), idk)
check('dontKnow still ✓s correct answer', idk.includes('✓'))
check('dontKnow shows explanation', idk.includes('orbits closest'))

// Error — error text only, never raw args (they still contain the answer).
const errorText = 'quiz: quiz correctAnswer "pluto" does not match any option value; legal values: venus, mercury'
const errored = flatten(QuizRow({ phase: 'result', block: { kind: 'result', isError: true, content: [{ type: 'text', text: errorText }] } }))
check('error shows message', errored.includes('does not match'))
check('error hides explanation', !errored.includes('orbits closest'), errored)
check('error shows not-asked state', errored.includes('not asked'))

// Settled without meta — falls back to the (safe, post-answer) result text.
const legacy = flatten(QuizRow({ phase: 'result', block: { kind: 'result', content: [{ type: 'text', text: 'Quiz result: Correct ✓' }] } }))
check('legacy fallback shows result text', legacy.includes('Correct ✓'))

console.log(failures === 0 ? 'CLIENT SMOKE: all passed' : `CLIENT SMOKE: ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
