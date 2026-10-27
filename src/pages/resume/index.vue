<template>
  <view class="flex flex-col bg-white" :style="{ height: '100vh' }">
    <CustomNavBar title="我的简历" show-back>
      <!-- #ifdef H5 -->
      <!-- 内嵌预览兜底：移动端浏览器 iframe 渲染 PDF 支持不佳时，交给浏览器原生阅读器 -->
      <template #right>
        <view v-if="pdfUrl" class="h-56rpx flex items-center rounded-full bg-[#F4F5F7] px-20rpx" @click="openInBrowser">
          <text class="font-mono text-20rpx tracking-[2rpx] text-[#0D0D0D]">在浏览器打开</text>
        </view>
      </template>
      <!-- #endif -->
    </CustomNavBar>

    <!-- 未配置地址的兜底态（全端一致） -->
    <view v-if="!pdfUrl" class="flex-1 flex-col flex-center">
      <text class="text-28rpx text-[#0D0D0D]">简历尚未配置</text>
      <text class="mt-12rpx text-24rpx text-[#67676C]">请在 .env 中设置 VITE_RESUME_PDF_URL 后重新构建</text>
    </view>

    <!-- #ifdef H5 -->
    <!-- H5：iframe 内嵌交给浏览器原生 PDF 渲染，加载完成前盖白底 loading -->
    <view v-if="pdfUrl" class="relative flex-1">
      <iframe :src="pdfUrl" class="h-full w-full border-0" @load="loaded = true" />
      <view v-if="!loaded" class="absolute inset-0 flex-center bg-white">
        <text class="text-26rpx text-[#67676C]">简历加载中…</text>
      </view>
    </view>
    <!-- #endif -->

    <!-- #ifndef H5 -->
    <!-- 小程序 / App：下载后调起系统文档预览页，本页只承载加载/失败/再开三态 -->
    <view v-if="pdfUrl" class="flex-1 flex-col flex-center px-60rpx">
      <template v-if="status === 'loading'">
        <text class="text-26rpx text-[#67676C]">简历加载中…</text>
      </template>
      <template v-else-if="status === 'error'">
        <text class="text-28rpx text-[#0D0D0D]">简历打开失败</text>
        <text class="mt-12rpx text-24rpx text-[#67676C]">{{ errorMsg }}</text>
        <view class="mt-48rpx w-full">
          <PsButton size="lg" block @click="handleOpen">重新打开</PsButton>
        </view>
      </template>
      <template v-else>
        <text class="text-28rpx text-[#0D0D0D]">简历已打开</text>
        <text class="mt-12rpx text-24rpx text-[#67676C]">已调起文档预览，关闭后可再次打开</text>
        <view class="mt-48rpx w-full">
          <PsButton variant="secondary" size="lg" block @click="handleOpen">再次打开</PsButton>
        </view>
      </template>
    </view>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import type { AuthUserInfo } from "@/api/auth";
import { onShow } from "@dcloudio/uni-app";
import { RESUME_PDF_URL } from "@/config/resume";
import { useUserStore } from "@/store/modules/user";
import { openPdf } from "@/utils/pdf";

// 本项目 pinia setup store 的 state/computed 在外部类型层未解包（见 user.ts 基线注释），
// 经 unknown 转换为运行时实际的解包形态，页面内按运行时结构消费。
type UserStoreProxy = {
  token: string;
  userInfo: AuthUserInfo | null;
  logout: () => void;
};

const userStore = useUserStore() as unknown as UserStoreProxy;

const pdfUrl = RESUME_PDF_URL;

// #ifdef H5
// iframe load 事件置真后撤掉白底 loading 遮罩
const loaded = ref(false);

const openInBrowser = () => {
  if (pdfUrl) openPdf(pdfUrl); // H5 端 openPdf 实现为 window.open
};
// #endif

// #ifndef H5
// 下载 → 系统文档预览的三态；openPdf 不 reject，失败信息在 message 里
type OpenStatus = "loading" | "success" | "error";
const status = ref<OpenStatus>("loading");
const errorMsg = ref("");

const handleOpen = async () => {
  if (!pdfUrl) return;
  status.value = "loading";
  const res = await openPdf(pdfUrl);
  status.value = res.ok ? "success" : "error";
  if (!res.ok) errorMsg.value = res.message || "请稍后重试";
};

// 进入页面即自动调起预览（与「点开即看」的预期一致）
onMounted(() => {
  if (pdfUrl) handleOpen();
});
// #endif

onShow(() => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
  }
});
</script>
