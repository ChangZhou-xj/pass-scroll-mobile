<template>
  <view
    :class="block ? 'w-full inline-flex justify-center items-center' : 'inline-flex justify-center items-center'"
    :style="boxStyle"
    @click="onClick">
    <text :style="labelStyle"><slot /></text>
  </view>
</template>

<script setup lang="ts">
import { T } from "@/theme/tokens";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary";
    size?: "sm" | "md" | "lg";
    block?: boolean;
    disabled?: boolean;
  }>(),
  { variant: "primary", size: "md", block: false, disabled: false },
);

const emit = defineEmits<{ click: [] }>();

const HEIGHTS = { sm: "64rpx", md: "88rpx", lg: "96rpx" } as const;
const FONT_SIZES = { sm: "26rpx", md: "30rpx", lg: "30rpx" } as const;

// secondary 加 hairline 描边：文档的无边白钮依赖彩底对比，App 白 canvas 上需要边缘
const boxStyle = computed(() => {
  const base = `height:${HEIGHTS[props.size]};border-radius:9999rpx;padding:0 48rpx;box-sizing:border-box;`;
  if (props.disabled) return `${base}background:${T.hairline};`;
  return props.variant === "primary"
    ? `${base}background:${T.ink};`
    : `${base}background:${T.canvas};border:2rpx solid ${T.hairline};`;
});

const labelStyle = computed(() => {
  const color = props.disabled ? T.secondaryText : props.variant === "primary" ? T.onPrimary : T.ink;
  return `font-size:${FONT_SIZES[props.size]};color:${color};line-height:1;`;
});

const onClick = () => {
  if (props.disabled) return;
  emit("click");
};
</script>
