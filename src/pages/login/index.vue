<template>
  <view class="min-h-screen bg-white">
    <CustomNavBar transparent />

    <!-- 品牌区 -->
    <view class="flex flex-col items-center pt-120rpx">
      <text class="block font-mono text-22rpx uppercase tracking-[2rpx] text-[#67676C]">PASS SCROLL · NOTES</text>
      <text class="mt-12rpx block text-72rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">通关秘籍</text>
      <text class="mt-12rpx block text-26rpx text-[#0D0D0D]">分享知识，随笔</text>
    </view>

    <!-- 表单：cream 签名色块 -->
    <view class="mx-40rpx mt-80rpx rounded-48rpx bg-[#F7F2E7] p-40rpx">
      <input
        v-model="username"
        class="mb-24rpx h-88rpx w-full rounded-16rpx border-2rpx border-solid border-[#E3E3E6] bg-white px-28rpx text-28rpx text-[#0D0D0D]"
        placeholder="请输入用户名（3-20位）"
        placeholder-style="color: #67676C;" />
      <input
        v-model="password"
        class="h-88rpx w-full rounded-16rpx border-2rpx border-solid border-[#E3E3E6] bg-white px-28rpx text-28rpx text-[#0D0D0D]"
        password
        :placeholder="isLogin ? '密码' : '8-64位，含字母与数字'"
        placeholder-style="color: #67676C;" />
      <view class="mt-48rpx">
        <PsButton size="lg" block @click="handleSubmit">{{ isLogin ? "进入" : "创建账号" }}</PsButton>
      </view>
      <view class="mt-30rpx flex justify-center" @click="isLogin = !isLogin">
        <text class="text-26rpx font-semibold text-[#0D0D0D]">
          {{ isLogin ? "没有账号？去注册" : "已有账号？去登录" }}
        </text>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { onShow } from "@dcloudio/uni-app";
import { useUserStore } from "@/store/modules/user";

const userStore = useUserStore();
const isLogin = ref(true);
const username = ref("");
const password = ref("");

onShow(() => {
  // 首启引导只看一次，之后进登录
  if (!uni.getStorageSync("pass_scroll_onboarded_v1")) {
    uni.reLaunch({ url: "/pages/onboarding/index" });
    return;
  }
});

const handleSubmit = async () => {
  if (!username.value || !password.value) {
    uni.showToast({ title: "请输入用户名和密码", icon: "none" });
    return;
  }
  try {
    if (isLogin.value) {
      await userStore.login(username.value, password.value);
    } else {
      await userStore.register(username.value, password.value);
    }
    uni.showToast({ title: "登录成功", icon: "success" });
    setTimeout(() => uni.reLaunch({ url: "/pages/index/index" }), 800);
  } catch {
    // request.ts 已统一 toast 错误信息
  }
};
</script>
