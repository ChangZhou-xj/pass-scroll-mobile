<template>
  <view class="min-h-screen bg-[#F7F8FA]">
    <CustomNavBar transparent />

    <!-- 品牌区 -->
    <view class="flex flex-col items-center pt-160rpx">
      <text class="brand-title text-72rpx text-[#3E63DD]">通关秘籍</text>
      <text class="mt-20rpx text-26rpx text-[#67676C]">分享知识，随笔</text>
    </view>

    <!-- 表单卡片 -->
    <view class="mx-40rpx mt-120rpx rounded-24rpx bg-white p-40rpx">
      <input
        v-model="username"
        class="mb-24rpx h-88rpx w-full rounded-12rpx border border-solid border-[#3C3C43]/20 px-24rpx text-28rpx text-[#3C3C43]"
        placeholder="请输入用户名（3-20位）"
        placeholder-style="color: #67676C;" />
      <input
        v-model="password"
        class="h-88rpx w-full rounded-12rpx border border-solid border-[#3C3C43]/20 px-24rpx text-28rpx text-[#3C3C43]"
        password
        :placeholder="isLogin ? '密码' : '8-64位，含字母与数字'"
        placeholder-style="color: #67676C;" />
      <view class="mt-48rpx h-88rpx flex-center rounded-44rpx bg-[#3E63DD]" @click="handleSubmit">
        <text class="text-30rpx text-white">{{ isLogin ? "进入" : "创建账号" }}</text>
      </view>
      <view class="mt-30rpx flex justify-center" @click="isLogin = !isLogin">
        <text class="text-26rpx text-[#3E63DD]">
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

<style scoped>
.brand-title {
  font-family: "STKaiti", "KaiTi", "Kaiti SC", "SimSun", serif;
}
</style>
