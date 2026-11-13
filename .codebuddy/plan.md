# 实施计划（v3）

1. `pnpm add -D vitest`，package.json 加 `"test": "vitest run"`，新增 `vitest.config.ts`（@ 别名指向 src）。
2. TDD-RED：新增 `src/utils/markdown.test.ts`，覆盖：标题/加粗/行内代码/链接/无序与有序列表/嵌套列表/引用/代码围栏/表格/hr/图片独立成块/parseNote 容器切分（默认与自定义标题）。运行确认失败。
3. TDD-GREEN：重构 `src/utils/markdown.ts`：
   - 导出 `InlineNode` / `BlockNode` / `mdToBlocks`；`NoteSegment` 改为 `{type:"blocks"|type:"container", blocks}`；
   - parseNote 改产出 blocks；删除 TAG_STYLES/injectStyles/adaptUnits/isH5/renderMarkdown/plainParagraph/htmlToPlain。
4. 新增 `src/components/MdInline.vue`（name 注册，行内递归，全部 selectable text）与 `src/components/MdBlocks.vue`（块级递归：标题/段落/列表（项目符号+编号）/引用/深色代码块/表格 flex 网格/图片 widthFix/hr/raw html 兜底 rich-text），样式 scoped + rpx。
5. `MdContainer.vue`：props `html:string` → `blocks:BlockNode[]`，body 用 MdBlocks；details 折叠逻辑不变。
6. 页面替换（4 处）：`<MdBlocks v-if="seg.type==='blocks'" :blocks>` / `<MdContainer v-else :blocks>`；详情页与编辑器删除 handleSegTap/copySegment、相关 import。
7. 清理：删除 `src/utils/clipboard.ts`；`system.ts` 移除 IS_H5（确认无引用）。
8. 验证：`pnpm test`（或 npx vitest run）、`npm run lint:eslint`、`npx stylelint` 改动 vue 文件、`npm run type-check`；手测四页面。
