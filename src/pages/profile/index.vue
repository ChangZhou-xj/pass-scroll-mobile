<template>
  <view class="flex-center flex-col p-40rpx">
    <text class="text-blue font-bold text-lg mb-30rpx">我的</text>
    <template v-if="isLoggedIn">
      <text class="text-lg font-bold">{{ userInfo?.username }}</text>
      <button class="mt-5" @click="handleLogout">退出登录</button>
    </template>
    <template v-else>
      <text>您还未登录，请先登录</text>
      <button class="mt-5" @click="goToLoginPage">去登录</button>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { useUserStore } from "@/store/modules/user";

const userStore = useUserStore();

const isLoggedIn = computed(() => !!userStore.token);
const userInfo = computed(() => userStore.userInfo);

const goToLoginPage = () => {
  uni.navigateTo({ url: "/pages/login/index" });
};

const handleLogout = () => {
  userStore.logout();
  uni.showToast({ title: "已退出登录", icon: "success" });
};
</script>
