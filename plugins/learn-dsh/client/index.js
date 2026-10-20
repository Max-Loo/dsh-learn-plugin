/**
 * learn-dsh web client bundle — the `quiz` tool card.
 *
 * Anti-leak contract: while the call is pending (preparing/start), this view
 * renders the question (and an "answer in the panel" hint) ONLY — never the
 * raw call arguments, which carry `correctAnswer` and `explanation`. After the
 * call settles it renders the graded feedback from the persisted
 * `presentationMeta` (block.meta): per-option ✓/✗/correct-but-not-selected
 * marks, the verdict, and the explanation.
 *
 * Plain factory-CJS for the DSH module loader; `react` resolves from the
 * frozen platform module table, so this bundle needs no build step.
 */

window.__ModuleLoader__.load({
	id: 'learn-dsh',
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
		const React = require('react')

		const DONT_KNOW_LABEL = "I don't know"

		const css = [
			'.learnQuiz_card{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-base);flex-direction:column;gap:10px;margin:4px 0 4px 4px;padding:14px 18px;display:flex;max-height:420px;overflow-y:auto}',
			'.learnQuiz_question{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px));margin:0;font-weight:600}',
			'.learnQuiz_hint{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:0}',
			'.learnQuiz_options{flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;display:flex}',
			'.learnQuiz_option{display:flex;align-items:baseline;gap:8px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary)}',
			'.learnQuiz_mark{flex:none;width:1.2em;text-align:center;font-weight:600}',
			'.learnQuiz_option[data-mark=correct]{color:var(--dsw-alias-state-success-primary)}',
			'.learnQuiz_option[data-mark=wrong] .learnQuiz_mark{color:var(--dsw-alias-state-error-primary)}',
			'.learnQuiz_option[data-mark=missed] .learnQuiz_mark{color:var(--dsw-alias-label-tertiary)}',
			'.learnQuiz_verdict{margin:0;font-weight:600;font-size:var(--dsh-content-font-size,14px)}',
			'.learnQuiz_verdict[data-verdict=correct]{color:var(--dsw-alias-state-success-primary)}',
			'.learnQuiz_verdict[data-verdict=incorrect]{color:var(--dsw-alias-state-error-primary)}',
			'.learnQuiz_verdict[data-verdict=dontKnow]{color:var(--dsw-alias-label-primary)}',
			'.learnQuiz_explanation{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));margin:0;border-top:.5px solid var(--dsw-alias-border-l2);padding-top:8px}',
			'.learnQuiz_error{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-state-error-primary);font-size:var(--dsh-content-font-size,14px);margin:0}',
			'.learnQuiz_fallback{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size,14px);margin:0}',
		].join('\n')
		const tagId = 'learn-dsh/quiz.css'
		if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) === null) {
			const tag = document.createElement('style')
			tag.dataset.plugin = 'learn-dsh'
			tag.dataset.pluginCss = tagId
			tag.textContent = css
			document.head.appendChild(tag)
		}

		const h = React.createElement

		function parseArgs(block) {
			try {
				const value = JSON.parse(block?.call?.argsRaw ?? 'null')
				if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value
			} catch {}
			return null
		}

		function resultText(block) {
			const content = Array.isArray(block?.content) ? block.content : []
			const text = content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n')
			return text === '' ? undefined : text
		}

		function isPlainObject(value) {
			return typeof value === 'object' && value !== null && !Array.isArray(value)
		}

		function validMeta(meta) {
			return (
				isPlainObject(meta) &&
				typeof meta.question === 'string' &&
				Array.isArray(meta.displayedOptions) &&
				Array.isArray(meta.answers) &&
				Array.isArray(meta.correctAnswer) &&
				typeof meta.explanation === 'string' &&
				typeof meta.dontKnow === 'boolean'
			)
		}

		function Card({ children, state }) {
			return h('div', { className: 'learnQuiz_card', 'data-learn-quiz': state }, children)
		}

		function PendingCard({ args }) {
			const question = typeof args?.question === 'string' && args.question !== '' ? args.question : 'Quiz question…'
			const count = Array.isArray(args?.options) ? args.options.length : 0
			return h(Card, { state: 'pending' }, [
				h('p', { key: 'q', className: 'learnQuiz_question' }, question),
				h('p', { key: 'hint', className: 'learnQuiz_hint' },
					count > 0 ? `${count} options — answer in the question panel` : 'waiting for arguments…'),
			])
		}

		function ErrorCard({ block }) {
			// Error text only — never raw arguments (validation errors happen
			// before the user answered, and args still carry the intended
			// answer).
			const text = resultText(block) ?? 'quiz call failed'
			return h(Card, { state: 'error' }, [
				h('p', { key: 'v', className: 'learnQuiz_verdict' }, 'Quiz — not asked'),
				h('p', { key: 'e', className: 'learnQuiz_error' }, text),
			])
		}

		function SettledCard({ meta, block }) {
			const selected = new Set(meta.answers)
			const correct = new Set(meta.correctAnswer)
			const verdict = meta.dontKnow ? 'I don’t know' : meta.status === 'correct' ? 'Correct ✓' : 'Incorrect ✗'
			const verdictKey = meta.dontKnow ? 'dontKnow' : meta.status === 'correct' ? 'correct' : 'incorrect'
			const children = [
				h('p', { key: 'q', className: 'learnQuiz_question' }, meta.question),
				h('ul', { key: 'o', className: 'learnQuiz_options' },
					meta.displayedOptions.map((option, index) => {
						const isCorrect = correct.has(option.value)
						const isSelected = selected.has(option.value)
						// dontKnow shows no ✗: only ✓ on the correct answer(s).
						const mark = isCorrect ? '✓' : isSelected && !meta.dontKnow ? '✗' : '·'
						const suffix = isSelected && !isCorrect && !meta.dontKnow ? ' — your answer' : isCorrect && !isSelected ? ' — correct, not selected' : ''
						return h('li', { key: `${option.value}-${index}`, className: 'learnQuiz_option', 'data-mark': isCorrect ? 'correct' : isSelected ? (meta.dontKnow ? 'missed' : 'wrong') : 'missed' }, [
							h('span', { key: 'm', className: 'learnQuiz_mark' }, mark),
							h('span', { key: 't' }, `${option.label}${suffix}`),
						])
					})),
				h('p', { key: 'v', className: 'learnQuiz_verdict', 'data-verdict': verdictKey }, verdict),
				h('p', { key: 'x', className: 'learnQuiz_explanation' }, meta.explanation),
			]
			if (meta.customAnswer !== undefined && meta.customAnswer !== '') {
				children.splice(2, 0, h('p', { key: 'c', className: 'learnQuiz_hint' }, `custom answer: ${meta.customAnswer}`))
			}
			return h(Card, { state: 'settled' }, children)
		}

		function QuizRow(props) {
			const block = props.block
			if (props.phase === 'result' && isPlainObject(block)) {
				if (block.isError) return h(ErrorCard, { block })
				if (validMeta(block.meta)) return h(SettledCard, { meta: block.meta, block })
				// Missing/legacy metadata: the model-facing result text is the
				// graded feedback and is safe to show post-answer.
				const text = resultText(block)
				if (text !== undefined) {
					return h(Card, { state: 'settled-legacy' }, [h('p', { key: 'f', className: 'learnQuiz_fallback' }, text)])
				}
				return h(Card, { state: 'settled-legacy' }, [h('p', { key: 'f', className: 'learnQuiz_fallback' }, 'Quiz result unavailable')])
			}
			if (props.phase === 'start' && isPlainObject(block)) {
				return h(PendingCard, { args: parseArgs(block) })
			}
			return h(PendingCard, { args: null })
		}

		const inject = ['slots']

		function apply(ctx) {
			ctx.slots.inject('tool.call.toolview', () =>
				ctx.slots.register({ name: 'tool.call.toolview', key: 'quiz' }, QuizRow))
		}

		exports.apply = apply
		exports.inject = inject
		return module.exports
	},
})
