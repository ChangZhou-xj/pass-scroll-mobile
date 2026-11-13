<template>
  <view class="md-blocks">
    <template v-for="(block, index) in blocks" :key="index">
      <!-- 标题：class 由 md-h + depth 拼接（md-h1~md-h6 均有定义）。
           外层用 view 而非 text：text 里不能嵌套组件（MdInline 是组件），H5 会告警且各端差异大 -->
      <view v-if="block.type === 'heading'" :class="'md-h' + block.depth">
        <MdInline :nodes="block.children" />
      </view>

      <!-- 段落 -->
      <view v-else-if="block.type === 'paragraph'" class="md-p">
        <MdInline :nodes="block.children" />
      </view>

      <!-- 列表：项目符号 / 编号 + 内容递归（支持嵌套列表） -->
      <view v-else-if="block.type === 'list'" class="md-list">
        <view v-for="(item, j) in block.items" :key="j" class="md-li">
          <text selectable class="md-bullet">{{ block.ordered ? j + 1 + "." : "•" }}</text>
          <view class="md-li-body">
            <MdBlocks :blocks="item" />
          </view>
        </view>
      </view>

      <!-- 引用 -->
      <view v-else-if="block.type === 'blockquote'" class="md-quote">
        <MdBlocks :blocks="block.blocks" />
      </view>

      <!-- 代码块 -->
      <view v-else-if="block.type === 'code'" class="md-pre">
        <text selectable class="md-pre-text">{{ block.text }}</text>
      </view>

      <!-- 表格：flex 等宽网格（小程序无原生 table） -->
      <view v-else-if="block.type === 'table'" class="md-table">
        <view class="md-tr">
          <view v-for="(cell, c) in block.header" :key="c" class="md-th">
            <MdInline :nodes="cell" />
          </view>
        </view>
        <view v-for="(row, r) in block.rows" :key="r" class="md-tr">
          <view v-for="(cell, c) in row" :key="c" class="md-td">
            <MdInline :nodes="cell" />
          </view>
        </view>
      </view>

      <!-- 图片 -->
      <image v-else-if="block.type === 'image'" class="md-img" :src="block.href" mode="widthFix" />

      <!-- 分隔线 -->
      <view v-else-if="block.type === 'hr'" class="md-hr" />

      <!-- 裸 HTML 兜底 -->
      <rich-text v-else-if="block.type === 'html'" :nodes="block.html" />
    </template>
  </view>
</template>

<script setup lang="ts">
import type { BlockNode } from "@/utils/markdown";

// 递归组件必须设置 name，模板中才能自引用；所有数据经 props 逐层下传
defineOptions({ name: "MdBlocks" });

defineProps<{ blocks: BlockNode[] }>();
</script>

<style scoped>
.md-blocks {
  display: block;
}

.md-h1 {
  margin: 40rpx 0 20rpx;
  font-size: 40rpx;
  font-weight: 800;
  line-height: 1.4;
  color: #0d0d0d;
  letter-spacing: -1px;
}

.md-h2 {
  padding-bottom: 12rpx;
  margin: 40rpx 0 20rpx;
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1.4;
  color: #0d0d0d;
  letter-spacing: -1px;
  border-bottom: 1px solid #e3e3e6;
}

.md-h3 {
  margin: 32rpx 0 16rpx;
  font-size: 32rpx;
  font-weight: 700;
  line-height: 1.4;
  color: #0d0d0d;
}

.md-h4 {
  margin: 28rpx 0 12rpx;
  font-size: 30rpx;
  font-weight: 600;
  line-height: 1.5;
  color: #0d0d0d;
}

.md-h5 {
  margin: 24rpx 0 12rpx;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.5;
  color: #0d0d0d;
}

.md-h6 {
  margin: 24rpx 0 12rpx;
  font-size: 26rpx;
  font-weight: 600;
  line-height: 1.5;
  color: #0d0d0d;
}

.md-p {
  display: block;
  margin: 16rpx 0;
  font-size: 28rpx;
  line-height: 1.9;
  color: #0d0d0d;
}

.md-list {
  margin: 16rpx 0;
}

.md-li {
  display: flex;
  flex-direction: row;
  margin: 10rpx 0;
}

.md-bullet {
  margin-right: 12rpx;
  font-size: 28rpx;
  line-height: 1.9;
  color: #67676c;
}

.md-li-body {
  flex: 1;
  min-width: 0;
}

.md-quote {
  padding: 16rpx 24rpx;
  margin: 20rpx 0;
  background: #f7f7f9;
  border-left: 6rpx solid #b9b9c0;
  border-radius: 8rpx;
}

/* 引用内文字用次级色（MdBlocks 递归实例共享同一 scoped id，深选择器可命中） */
.md-quote .md-p {
  color: #3d3d42;
}

.md-pre {
  padding: 24rpx;
  margin: 16rpx 0;
  overflow-x: auto;
  background: #16181d;
  border-radius: 16rpx;
}

.md-pre-text {
  font-family: Consolas, Menlo, monospace;
  font-size: 24rpx;
  line-height: 1.6;
  color: #e6e6e6;
}

.md-table {
  margin: 20rpx 0;
  overflow: hidden;
  border-top: 1px solid #e3e3e6;
  border-left: 1px solid #e3e3e6;
  border-radius: 12rpx;
}

.md-tr {
  display: flex;
  flex-direction: row;
}

.md-th,
.md-td {
  flex: 1;
  min-width: 0;
  padding: 14rpx 18rpx;
  font-size: 26rpx;
  line-height: 1.7;
  color: #0d0d0d;
  word-break: break-all;
  border-right: 1px solid #e3e3e6;
  border-bottom: 1px solid #e3e3e6;
}

.md-th {
  font-weight: 600;
  background: #f4f5f7;
}

.md-img {
  width: 100%;
  margin: 8rpx 0;
  border-radius: 16rpx;
}

.md-hr {
  height: 0;
  margin: 32rpx 0;
  border-top: 1px solid #e3e3e6;
}
</style>
