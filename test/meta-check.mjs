#!/usr/bin/env node
// 插件多语言展示元信息的静态校验（官方宿主脚本 `verify-package-meta` 的本地等价子集）。
// 零 DSH 依赖：只读 JSON 与清单条目，任何机器 `node test/meta-check.mjs` 即可运行。
//
// 结构（design.md 决策 1）：
// - `checkPackageMeta(pkgRoot)`：无副作用检查函数，接受包根路径，返回具名失败项列表（空数组 = 合规）；
// - CLI：默认校验真实仓库根，全部失败项以非零退出码报告；
// - `--self-test`：在临时目录构造三类违规副本（JSON 损坏 / 字段空字符串 / exports·files 条目缺失），
//   分别调用检查函数验证拦截能力，不触碰真实仓库文件。

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

/** 读取 JSON 文件；返回 { ok: true, data } 或 { ok: false, error: 失败项 } */
function readJson(pkgRoot, relativePath) {
  const filePath = join(pkgRoot, relativePath);
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (e) {
    return { ok: false, error: `${relativePath}: 读取失败（${e.code ?? e.message}）` };
  }
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: `${relativePath}: JSON 解析失败（${e.message}）` };
  }
}

/** 校验单个语言文件的 meta.title / meta.description：必须为去除首尾空白后非空的字符串 */
function checkLocaleFile(pkgRoot, lang) {
  const failures = [];
  const rel = `locale/${lang}.json`;
  const parsed = readJson(pkgRoot, rel);
  if (!parsed.ok) return [parsed.error];
  const meta = parsed.data?.meta;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return [`${rel}: 缺少 meta 对象`];
  }
  for (const field of ['title', 'description']) {
    const value = meta[field];
    if (typeof value !== 'string') {
      failures.push(`${rel}: meta.${field} 缺失或不是字符串`);
    } else if (value.trim() === '') {
      failures.push(`${rel}: meta.${field} 为空白字符串（去除首尾空白后为空）`);
    }
  }
  return failures;
}

/** 校验 package.json：exports 四条目齐备（. / ./client / ./locale/*.json / ./package.json）且 files 含 locale/*.json */
function checkPackageManifest(pkgRoot) {
  const failures = [];
  const parsed = readJson(pkgRoot, 'package.json');
  if (!parsed.ok) return [parsed.error];
  const pkg = parsed.data;

  const exportsMap = pkg?.exports;
  if (exportsMap === null || typeof exportsMap !== 'object' || Array.isArray(exportsMap)) {
    return ['package.json: 缺少 exports 对象'];
  }

  // 条目 1：`.` 入口，保留 types/default 条件导出形状
  const dot = exportsMap['.'];
  if (dot === undefined) {
    failures.push(`package.json: exports['.'] 缺失`);
  } else if (typeof dot === 'string') {
    failures.push(`package.json: exports['.'] 应为含 types/default 的条件导出对象，实际为字符串 "${dot}"`);
  } else if (dot === null || typeof dot !== 'object' || Array.isArray(dot)) {
    failures.push(`package.json: exports['.'] 形状非法`);
  } else {
    if (!('types' in dot)) failures.push(`package.json: exports['.'] 缺少 types 条目`);
    if (!('default' in dot)) failures.push(`package.json: exports['.'] 缺少 default 条目`);
  }

  // 条目 2：./client 运行时导出
  if (!('./client' in exportsMap)) {
    failures.push(`package.json: exports['./client'] 缺失`);
  }

  // 条目 3：./locale/*.json 通配暴露（官方文档字面量）
  if (exportsMap['./locale/*.json'] !== './locale/*.json') {
    failures.push(
      `package.json: exports['./locale/*.json'] 缺失或不是 "./locale/*.json"（实际 ${JSON.stringify(exportsMap['./locale/*.json']) ?? 'undefined'}）`,
    );
  }

  // 条目 4：./package.json 包字段回退
  if (exportsMap['./package.json'] !== './package.json') {
    failures.push(
      `package.json: exports['./package.json'] 缺失或不是 "./package.json"（实际 ${JSON.stringify(exportsMap['./package.json']) ?? 'undefined'}）`,
    );
  }

  // files 覆盖语言文件
  const files = pkg?.files;
  if (!Array.isArray(files)) {
    failures.push(`package.json: files 不是数组`);
  } else if (!files.includes('locale/*.json')) {
    failures.push(`package.json: files 缺少 "locale/*.json"`);
  }

  return failures;
}

/**
 * 主检查函数：接受包根路径，返回具名失败项列表（空数组 = 全部合规）。
 * 覆盖 spec `plugin-meta` 的四个 requirement：语言文件内容契约、exports 暴露、files 覆盖。
 */
export function checkPackageMeta(pkgRoot) {
  return [
    ...checkPackageManifest(pkgRoot),
    ...checkLocaleFile(pkgRoot, 'en'),
    ...checkLocaleFile(pkgRoot, 'zh'),
  ];
}

/**
 * 违规拦截自测：把真实仓库的合规数据复制进临时目录，构造三类违规副本分别调用
 * checkPackageMeta，断言每类违规都被报告为具名失败项。只读真实文件、只写临时目录。
 * 返回自测自身的失败列表（空数组 = 自测通过）。
 */
export function selfTest() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const failures = [];

  /** 断言失败项列表命中预期的具名片段 */
  function expectNamed(actual, fragments, label) {
    if (actual.length === 0) {
      failures.push(`${label}: 未报告任何失败项（违规未被拦截）`);
      return;
    }
    for (const fragment of fragments) {
      if (!actual.some((item) => item.includes(fragment))) {
        failures.push(`${label}: 失败项未具名报告预期片段 "${fragment}"；实际报告：${actual.join(' / ')}`);
      }
    }
  }

  // 基线：真实仓库数据在临时目录中的合规副本应零失败
  const base = mkdtempSync(join(tmpdir(), 'meta-check-selftest-'));
  try {
    mkdirSync(join(base, 'locale'), { recursive: true });
    writeFileSync(join(base, 'locale/en.json'), readFileSync(join(repoRoot, 'locale/en.json')));
    writeFileSync(join(base, 'locale/zh.json'), readFileSync(join(repoRoot, 'locale/zh.json')));
    writeFileSync(join(base, 'package.json'), readFileSync(join(repoRoot, 'package.json')));

    const baseline = checkPackageMeta(base);
    if (baseline.length > 0) {
      failures.push(`基线：合规副本不应报告失败项；实际：${baseline.join(' / ')}`);
    }

    // 违规 1：JSON 损坏
    const broken = mkdtempSync(join(tmpdir(), 'meta-check-broken-'));
    try {
      mkdirSync(join(broken, 'locale'), { recursive: true });
      writeFileSync(join(broken, 'locale/en.json'), readFileSync(join(repoRoot, 'locale/en.json')));
      writeFileSync(join(broken, 'locale/zh.json'), '{ "meta": { "title": "学习工具",'); // 截断的 JSON
      writeFileSync(join(broken, 'package.json'), readFileSync(join(repoRoot, 'package.json')));
      expectNamed(checkPackageMeta(broken), ['locale/zh.json', 'JSON 解析失败'], '违规 1（JSON 损坏）');
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }

    // 违规 2：字段为空字符串
    const blank = mkdtempSync(join(tmpdir(), 'meta-check-blank-'));
    try {
      mkdirSync(join(blank, 'locale'), { recursive: true });
      writeFileSync(join(blank, 'locale/en.json'), JSON.stringify({ meta: { title: '   ', description: '' } }));
      writeFileSync(join(blank, 'locale/zh.json'), readFileSync(join(repoRoot, 'locale/zh.json')));
      writeFileSync(join(blank, 'package.json'), readFileSync(join(repoRoot, 'package.json')));
      const reported = checkPackageMeta(blank);
      expectNamed(reported, ['locale/en.json', 'meta.title', 'meta.description'], '违规 2（字段空字符串）');
    } finally {
      rmSync(blank, { recursive: true, force: true });
    }

    // 违规 3a：exports 条目缺失（删 ./locale/*.json）
    const noExports = mkdtempSync(join(tmpdir(), 'meta-check-noexports-'));
    try {
      mkdirSync(join(noExports, 'locale'), { recursive: true });
      writeFileSync(join(noExports, 'locale/en.json'), readFileSync(join(repoRoot, 'locale/en.json')));
      writeFileSync(join(noExports, 'locale/zh.json'), readFileSync(join(repoRoot, 'locale/zh.json')));
      const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
      delete pkg.exports['./locale/*.json'];
      writeFileSync(join(noExports, 'package.json'), JSON.stringify(pkg, null, 2));
      expectNamed(checkPackageMeta(noExports), [`exports['./locale/*.json']`], '违规 3a（exports 条目缺失）');
    } finally {
      rmSync(noExports, { recursive: true, force: true });
    }

    // 违规 3b：files 条目缺失（移除 locale/*.json）
    const noFiles = mkdtempSync(join(tmpdir(), 'meta-check-nofiles-'));
    try {
      mkdirSync(join(noFiles, 'locale'), { recursive: true });
      writeFileSync(join(noFiles, 'locale/en.json'), readFileSync(join(repoRoot, 'locale/en.json')));
      writeFileSync(join(noFiles, 'locale/zh.json'), readFileSync(join(repoRoot, 'locale/zh.json')));
      const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
      pkg.files = pkg.files.filter((entry) => entry !== 'locale/*.json');
      writeFileSync(join(noFiles, 'package.json'), JSON.stringify(pkg, null, 2));
      expectNamed(checkPackageMeta(noFiles), ['files', 'locale/*.json'], '违规 3b（files 条目缺失）');
    } finally {
      rmSync(noFiles, { recursive: true, force: true });
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }

  return failures;
}

/** CLI 入口：node test/meta-check.mjs [--self-test] */
function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  if (process.argv.includes('--self-test')) {
    const failures = selfTest();
    if (failures.length === 0) {
      console.log('meta-check self-test: 全部违规副本均被具名拦截，自测通过');
      return;
    }
    console.error(`meta-check self-test: ${failures.length} 项失败`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  const failures = checkPackageMeta(repoRoot);
  if (failures.length === 0) {
    console.log(`meta-check: ${repoRoot} 展示元信息合规（locale/*.json 内容、exports、files 全部通过）`);
    return;
  }
  console.error(`meta-check: ${repoRoot} 有 ${failures.length} 项不合规`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
}

// 仅直接执行时运行 CLI（被 import 复用时零副作用）
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
