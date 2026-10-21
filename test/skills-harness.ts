/**
 * Dev-only bundled-skills verification harness (not part of the shipped bundle).
 *
 * Loads the plugin's `ctx.skills` provider through the real registry and
 * asserts the bundled `teach` / `visualize` delivery contract: the catalog
 * carries both skills with frontmatter-accurate name/description and the
 * D2 candidate fields (bundled source, provider id, dual invocation,
 * directory resourceBase), `get` returns the frontmatter-stripped body, and
 * the `references/*.md` templates are readable under each skill's
 * resourceBase.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-learn-plugin-skills-harness'
export const inject = ['skills']

/** Package-root skills/ directory (harness lives in test/, plugin in lib/). */
const SKILLS_ROOT = fileURLToPath(new URL('../skills/', import.meta.url))

const results: { name: string; pass: boolean; detail?: string }[] = []
function check(name: string, pass: boolean, detail?: string): void {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && !pass ? ` — ${detail}` : ''}`)
}

/** Same single-line frontmatter extraction the provider performs. */
function frontmatter(skill: string): { name: string; description: string; body: string } {
  const file = path.join(SKILLS_ROOT, skill, 'SKILL.md')
  const text = fs.readFileSync(file, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) throw new Error(`no frontmatter in ${file}`)
  const name = /^name:\s*(.+)$/m.exec(match[1] ?? '')?.[1]?.trim() ?? ''
  const rawDescription = /^description:\s*(.+)$/m.exec(match[1] ?? '')?.[1]?.trim() ?? ''
  const description = rawDescription.length >= 2 && rawDescription.startsWith('"') && rawDescription.endsWith('"')
    ? rawDescription.slice(1, -1)
    : rawDescription
  return { name, description, body: text.slice(match[0].length) }
}

const REFERENCES: Record<string, string[]> = {
  teach: ['references/researcher.md'],
  visualize: ['references/mermaid-maker.md', 'references/svg-maker.md'],
}

export function apply(ctx: Context): void {
  void (async () => {
    try {
      // The harness .ts loads faster than the plugin's compiled lib/, so the
      // provider may register after our first read — poll until it lands.
      const deadline = Date.now() + 15_000
      let skills = await ctx.skills.list()
      while (!skills.some((s) => s.provider === 'dsh-learn-plugin') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        skills = await ctx.skills.list()
      }
      const names = skills.map((s) => `${s.name}:${s.provider}:${s.source}`).sort()
      check('catalog lists both bundled skills', names.includes('teach:dsh-learn-plugin:bundled') && names.includes('visualize:dsh-learn-plugin:bundled'), names.join(', '))

      for (const skill of ['teach', 'visualize']) {
        const fm = frontmatter(skill)
        const summary = skills.find((s) => s.name === skill && s.provider === 'dsh-learn-plugin')
        check(`${skill}: catalog entry present`, summary !== undefined)
        if (!summary) continue
        check(`${skill}: name matches frontmatter`, summary.name === fm.name, `${summary.name} vs ${fm.name}`)
        check(`${skill}: description matches frontmatter`, summary.description === fm.description, `${JSON.stringify(summary.description)} vs ${JSON.stringify(fm.description)}`)
        check(`${skill}: dual invocation`, summary.invocation.modelInvocable && summary.invocation.userInvocable)
        check(`${skill}: source is bundled`, summary.source === 'bundled')

        const definition = await ctx.skills.get(skill)
        check(`${skill}: get returns a definition`, definition !== undefined && definition.provider === 'dsh-learn-plugin')
        if (!definition) continue
        check(`${skill}: body has no frontmatter`, !definition.content.startsWith('---'), definition.content.slice(0, 40))
        check(`${skill}: body is the full SKILL.md body`, definition.content === fm.body, `length ${definition.content.length} vs ${fm.body.length}`)

        const base = summary.resourceBase
        check(`${skill}: resourceBase is the package skill directory`, base?.kind === 'directory' && base.path.split('/').slice(-2).join('/') === `skills/${skill}`, JSON.stringify(base))
        if (base?.kind === 'directory') {
          for (const ref of REFERENCES[skill] ?? []) {
            const file = path.join(base.path, ref)
            let readable = false
            try {
              readable = fs.readFileSync(file, 'utf8').length > 0
            } catch {
              readable = false
            }
            check(`${skill}: ${ref} readable under resourceBase`, readable, file)
          }
        }
      }
    } catch (error) {
      check('skills harness completed without unexpected throw', false, error instanceof Error ? `${error.message}\n${error.stack?.split('\n')[1] ?? ''}` : String(error))
    } finally {
      const failed = results.filter((result) => !result.pass)
      console.log(`SKILLS HARNESS RESULT: ${results.length - failed.length}/${results.length} passed${failed.length > 0 ? ' — FAILURES above' : ''}`)
    }
  })()
}
