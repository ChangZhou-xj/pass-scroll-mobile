<template>
  <text class="md-inline">
    <template v-for="(node, index) in nodes" :key="index">
      <text v-if="node.type === 'text'" selectable>{{ node.text }}</text>
      <text v-else-if="node.type === 'br'" selectable>{{ "\n" }}</text>
      <text v-else-if="node.type === 'strong'" selectable class="md-strong">
        <MdInline :nodes="node.children" />
      </text>
      <text v-else-if="node.type === 'em'" selectable class="md-em">
        <MdInline :nodes="node.children" />
      </text>
      <text v-else-if="node.type === 'del'" selectable class="md-del">
        <MdInline :nodes="node.children" />
      </text>
      <text v-else-if="node.type === 'code'" selectable class="md-codespan">
        <MdInline :nodes="node.children" />
      </text>
      <text v-else-if="node.type === 'link'" selectable class="md-link">
        <MdInline :nodes="node.children" />
      </text>
    </template>
  </text>
</template>

<script setup lang="ts">
import type { InlineNode } from "@/utils/markdown";

// 递归组件必须设置 name，模板中才能自引用
defineOptions({ name: "MdInline" });

defineProps<{ nodes: InlineNode[] }>();
</script>

<style scoped>
.md-strong {
  font-weight: 700;
}

.md-em {
  font-style: italic;
}

.md-del {
  color: #67676c;
  text-decoration: line-through;
}

.md-codespan {
  padding: 2rpx 8rpx;
  font-family: Consolas, Menlo, monospace;
  font-size: 26rpx;
  color: #0d0d0d;
  background: #f4f5f7;
  border-radius: 8rpx;
}

.md-link {
  color: #0d0d0d;
  text-decoration: underline;
}
</style>
