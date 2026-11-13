# markdown 渲染与复制 通用方案（v3，已确认）

## 根因（前两版失败原因）

1. 小程序 rich-text 是黑盒：内部文本不可选择、事件拿不到内部元素 → 一切基于 rich-text 的复制都只能是外围 hack。
2. `<text selectable>` 只对纯文本段生效，带格式段落全落回不可选的 rich-text。
3. parseNote 只按 ::: 容器切分，无容器笔记整篇=1 段，"按段复制"实际复制整篇。
4. H5 rich-text 本是真 DOM，外围 hack 反而干扰原生拖选。

## 方案（markdown → 原生组件树）

- `markdown.ts` 重构：`marked.lexer` 解析每段 token → 归一化节点树（纯函数 `mdToBlocks`）：
  - 块级：heading / paragraph / list / blockquote / code / table / image / hr / html(兜底 rich-text)
  - 行内：text / strong / em / code / del / link / br
- 新组件 `MdBlocks.vue`（块级递归）+ `MdInline.vue`（行内递归，嵌套 `<text selectable>`）。
- 所有文字一律 `<text selectable>`：小程序端原生长按选择复制，H5 端原生拖选。删除 plain/rich 双轨、点击复制、closest 探测、长按兜底等全部 hack。
- `MdContainer` props 从 html 改为 blocks，内部用 MdBlocks 渲染。
- 4 个消费页（详情/编辑器预览/复习/版本）统一 `<MdBlocks :blocks>` 替换。
- 表格用 flex 等宽网格渲染（用户已同意）；vitest 对 mdToBlocks 写单测（用户已同意，pnpm 安装）。
- 清理：clipboard.ts 删除、system.ts 的 IS_H5 删除（无引用后）。
