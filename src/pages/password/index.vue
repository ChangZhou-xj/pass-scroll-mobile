<template>
  <view class="min-h-screen bg-white pb-160rpx">
    <CustomNavBar title="修改密码" show-back />

    <!-- 表单卡片 -->
    <view class="mx-30rpx mt-24rpx rounded-48rpx border-2rpx border-solid border-[#E3E3E6] bg-white p-30rpx">
      <input
        v-model="oldPassword"
        class="h-88rpx w-full border-0 border-b-2rpx border-solid border-[#E3E3E6] text-28rpx text-[#0D0D0D]"
        password
        placeholder="旧密码"
        placeholder-style="color: #67676C;" />
      <input
        v-model="newPassword"
        class="mt-24rpx h-88rpx w-full border-0 border-b-2rpx border-solid border-[#E3E3E6] text-28rpx text-[#0D0D0D]"
        password
        placeholder="8-64位，含字母与数字"
        placeholder-style="color: #67676C;" />
      <input
        v-model="confirmPassword"
        class="mt-24rpx h-88rpx w-full text-28rpx text-[#0D0D0D]"
        password
        placeholder="确认新密码"
        placeholder-style="color: #67676C;" />
    </view>

    <!-- 底部确认按钮：fixed 白底栏保留；safe-area 走 calc(16rpx + env()) 复合，避免内联 paddingBottom 覆盖 py-16rpx 内衬
         （inline rpx-in-calc 由 uni-h5 归一化换算，同首页 FAB / 复习页标记栏两例；py-16rpx 保留供顶衬与降级） -->
    <view
      class="fixed bottom-0 left-0 right-0 border-0 border-t-2rpx border-solid border-[#E3E3E6] bg-white px-30rpx py-16rpx"
      :style="{ paddingBottom: 'calc(16rpx + env(safe-area-inset-bottom))' }">
      <PsButton size="lg" block @click="handleSubmit">确认修改</PsButton>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { AuthUserInfo } from "@/api/auth";
import AuthAPI from "@/api/auth";
import { useUserStore } from "@/store/modules/user";

// 本项目 pinia setup store 的 state/computed 在外部类型层未解包（见 user.ts 基线注释），
// 经 unknown 转换为运行时实际的解包形态，页面内按运行时结构消费。
type UserStoreProxy = {
  token: string;
  userInfo: AuthUserInfo | null;
  logout: () => void;
};

const userStore = useUserStore() as unknown as UserStoreProxy;

const oldPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const submitting = ref(false);

const handleSubmit = async () => {
  if (submitting.value) return;
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    uni.showToast({ title: "请填写完整", icon: "none" });
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    uni.showToast({ title: "两次输入的新密码不一致", icon: "none" });
    return;
  }
  submitting.value = true;
  try {
    await AuthAPI.changePassword(oldPassword.value, newPassword.value);
    uni.showToast({ title: "已修改，请重新登录", icon: "none" });
    userStore.logout();
    uni.reLaunch({ url: "/pages/login/index" });
  } catch {
    // request.ts 已 toast（10003 旧密码错误 / 10004 强度不足）
  } finally {
    submitting.value = false;
  }
};
</script>
