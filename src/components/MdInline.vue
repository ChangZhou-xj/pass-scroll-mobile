<template>
  <!-- 只保留一层 text + 若干兄弟 text：uni-app 不允许在 text 里嵌套组件（H5 会告警且各端渲染不一致），
       行内样式通过 flattenInline 压平成 class，见 utils/markdown.ts -->
  <text class="md-inline">
    <text v-for="(run, index) in runs" :key="index" selectable :class="run.cls">{{ run.text }}</text>
  </text>
</template>

<script setup lang="ts">
import type { InlineNode } from "@/utils/markdown";
import { computed } from "vue";
import { flattenInline } from "@/utils/markdown";

// 递归组件必须设置 name，模板中才能自引用
defineOptions({ name: "MdInline" });

const props = defineProps<{ nodes: InlineNode[] }>();

const runs = computed(() => flattenInline(props.nodes));
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
