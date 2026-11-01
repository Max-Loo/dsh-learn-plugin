# Spec Delta

## ADDED Requirements

### Requirement: 渲染输出分辨率
maker 渲染发布的 PNG SHALL 以约 2 倍缩放渲染并使用白色不透明背景：mermaid 链的渲染命令 SHALL 携带 `-s 2`（缩放）与 `-b white`（背景）；SVG 链 SHALL 以 `rsvg-convert -z 2` 渲染，回退 `magick` 时 SHALL 以 `-density 192 -background white` 渲染。发布图示在嵌入显示尺寸下 SHALL 保持文字与线条清晰可读。

#### Scenario: mermaid 图以 2x 渲染
- **WHEN** mermaid maker 渲染并发布一张图
- **THEN** 渲染命令携带 `-s 2 -b white`，发布 PNG 的像素尺寸约为图示逻辑尺寸的 2 倍且背景为白色

#### Scenario: SVG 图以 2x 渲染
- **WHEN** svg maker 以 `rsvg-convert` 渲染并发布一张图
- **THEN** 渲染命令携带 `-z 2`，发布 PNG 的像素尺寸约为 SVG 逻辑尺寸的 2 倍

#### Scenario: SVG 回退链保持同等分辨率
- **WHEN** 机器无 `rsvg-convert`，svg maker 以 `magick` 回退渲染
- **THEN** 渲染命令携带 `-density 192 -background white`，发布 PNG 的清晰度与 `rsvg-convert -z 2` 产出相当且背景为白色

#### Scenario: 冒烟测试与正式渲染一致
- **WHEN** maker 执行渲染链冒烟测试
- **THEN** 冒烟渲染命令与后续正式渲染命令携带相同的缩放与背景参数
