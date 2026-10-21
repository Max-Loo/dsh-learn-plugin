import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import {
  BUNDLED_SKILL_RANK,
  isSkillName,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

/**
 * dsh-learn-plugin skills — bundle the `teach` / `visualize` skills with the
 * package and register them on the DSH skill registry (`ctx.skills`).
 *
 * The markdown under the package-root `skills/` directory is a static package
 * asset (shipped via `files`, immutable under an installed copy), so the
 * candidate list is built once at apply time; a frontmatter that fails to
 * parse throws and fails the plugin load fast — a malformed SKILL.md means a
 * broken package. `get` re-reads the file on every call and returns the
 * frontmatter-stripped body. Project-level skills keep overriding these
 * copies: `bundled` candidates carry the lowest precedence rank
 * (BUNDLED_SKILL_RANK), so any project-level same-name skill wins.
 */

export const inject = ['skills']

const PROVIDER_NAME = 'dsh-learn-plugin'

/** Package-root `skills/` directory, resolved from this compiled module (`lib/`). */
const SKILLS_ROOT = fileURLToPath(new URL('../skills/', import.meta.url))

interface ParsedSkill {
  name: string
  description: string
  /** SKILL.md body with the frontmatter block removed. */
  content: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const FIELD_RE = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/

/**
 * Minimal zero-dependency frontmatter parser: strip the leading `--- ... ---`
 * block and extract the single-line `name` / `description` keys (an optional
 * pair of surrounding double quotes is unwrapped). Anything more complex
 * throws — both bundled SKILL.md files use single-line values only.
 */
function parseSkill(text: string, file: string): ParsedSkill {
  const match = FRONTMATTER_RE.exec(text)
  if (!match) throw new Error(`[${PROVIDER_NAME}] missing frontmatter block in ${file}`)
  const fields = new Map<string, string>()
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const field = FIELD_RE.exec(line)
    if (field && !fields.has(field[1] ?? '')) fields.set(field[1] ?? '', (field[2] ?? '').trim())
  }
  const read = (key: string): string | undefined => {
    const raw = fields.get(key)
    if (raw === undefined || raw.length === 0) return undefined
    return raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
  }
  const name = read('name')
  const description = read('description')
  if (name === undefined || !isSkillName(name)) {
    throw new Error(`[${PROVIDER_NAME}] invalid or missing \`name\` in ${file} frontmatter`)
  }
  if (description === undefined) {
    throw new Error(`[${PROVIDER_NAME}] missing \`description\` in ${file} frontmatter`)
  }
  return { name, description, content: text.slice(match[0].length) }
}

/** Registry-facing paths use forward slashes on every platform. */
function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

/** Read one `<skills>/<name>/` directory into a registry candidate. */
function buildCandidate(dir: string): SkillCandidate {
  const file = path.join(dir, 'SKILL.md')
  const parsed = parseSkill(fs.readFileSync(file, 'utf8'), file)
  return {
    path: toPosix(file),
    name: parsed.name,
    description: parsed.description,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    provider: PROVIDER_NAME,
    resourceBase: { kind: 'directory', path: toPosix(dir) },
    rank: BUNDLED_SKILL_RANK,
    locator: toPosix(file),
  }
}

export function apply(ctx: Context): void {
  const candidates: SkillCandidate[] = []
  for (const entry of fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(SKILLS_ROOT, entry.name)
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) {
      throw new Error(`[${PROVIDER_NAME}] skills/${entry.name}/ has no SKILL.md`)
    }
    candidates.push(buildCandidate(dir))
  }

  const provider: SkillProvider = {
    name: PROVIDER_NAME,
    list: async () => candidates,
    get: async (candidate) => {
      const file = String(candidate.locator)
      let text: string
      try {
        text = await fsp.readFile(file, 'utf8')
      } catch {
        return undefined // file no longer loadable (package mutated in place)
      }
      try {
        const parsed = parseSkill(text, file)
        const { rank: _rank, locator: _locator, ...summary } = candidate
        const definition: SkillDefinition = { ...summary, content: parsed.content }
        return definition
      } catch {
        return undefined // frontmatter broke after apply — treat as stale
      }
    },
  }

  ctx.skills.registerProvider(() => provider)
  console.log(`[dsh-learn-plugin] bundled skills registered: ${candidates.map((c) => c.name).join(', ')}`)
}
