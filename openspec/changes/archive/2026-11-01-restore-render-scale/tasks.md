# Tasks

## 1. mermaid-maker 模板补回渲染参数

- [x] 1.1 编辑 `skills/visualize/references/mermaid-maker.md`：Step 0 两处冒烟渲染命令（首次尝试、系统浏览器重试）与工作流第 3 步预览命令统一补上 `-s 2 -b white`（系统浏览器重试分支保持 `-p .mmdc-puppeteer.json` 追加在后的顺序）；验证：`grep -n 'mmdc-smoke.mmd\|render a preview' skills/visualize/references/mermaid-maker.md` 中每条渲染命令行均含 `-s 2 -b white`，且模板内不存在无参的 `"$MMDC" -i` 命令行
- [x] 1.2 核对模板其余渲染相关文字（第 68 行"Remember which attempt succeeded"的正式渲染命令说明、第 98 行 Iterate 步骤）与带参命令一致；验证：通读模板全文，渲染命令表述无裸命令残留

## 2. svg-maker 模板补回渲染参数

- [x] 2.1 编辑 `skills/visualize/references/svg-maker.md`：Step 0 的"When rendering later"句改为给出两条带参命令——`rsvg-convert -z 2 -o out.png in.svg` 与 `magick -density 192 -background white in.svg out.png`；工作流第 3 步渲染说明同步引用带参命令；验证：`grep -n 'rsvg-convert\|magick' skills/visualize/references/svg-maker.md` 中正式渲染命令均带缩放参数（`command -v` 探测行除外）

## 3. README 冒烟示例同步

- [x] 3.1 编辑 `README.md`「渲染依赖（lesson-visuals）→ mermaid 链」的两条冒烟测试命令，补 `-s 2 -b white`（第 2 条保留 `-p .mmdc-puppeteer.json`）；验证：`grep -n 'mmdc-smoke' README.md` 两条命令与 mermaid-maker.md Step 0 命令逐字一致（路径/变量名按各上下文）

## 4. 端到端验证

- [x] 4.1 实跑渲染链验证 2x 输出：在仓库根按 README 冒烟流程渲染（内嵌或系统浏览器任一供给方式），对同一 `.mmd` 输入分别以无参与 `-s 2 -b white` 各渲染一次，`sips -g pixelWidth`（或 `file`）确认带参输出宽度约为无参的 2 倍；若本机 mermaid 链不可得，则以模板文本核对（1.1/1.2 的 grep 结果）作为验证结论并在任务记录中注明
- [x] 4.2 （若本机有 `rsvg-convert` 或 `magick`）对同一简单 SVG 分别以无参与带参（`-z 2` 或 `-density 192`）渲染，确认带参输出像素约 2 倍；二进制均缺失时注明跳过及原因
