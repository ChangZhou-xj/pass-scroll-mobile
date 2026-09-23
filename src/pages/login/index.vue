<template>
  <view class="flex flex-col items-center p-40rpx">
    <text class="text-36rpx font-bold mt-60rpx mb-40rpx">{{ isLogin ? "登录" : "注册" }}</text>
    <input v-model="username" class="form-input" placeholder="请输入用户名（3-20位）" />
    <input v-model="password" class="form-input" placeholder="请输入密码（6-32位）" type="password" />
    <wd-button block custom-class="mt-40rpx" @click="handleSubmit">{{ isLogin ? "登录" : "注册并登录" }}</wd-button>
    <view class="mt-30rpx" @click="isLogin = !isLogin">
      <text class="text-26rpx text-blue-500">{{ isLogin ? "没有账号？去注册" : "已有账号？去登录" }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { useUserStore } from "@/store/modules/user";

const userStore = useUserStore();
const isLogin = ref(true);
const username = ref("");
const password = ref("");

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
    setTimeout(() => uni.switchTab({ url: "/pages/index/index" }), 800);
  } catch {
    // request.ts 已统一 toast 错误信息
  }
};
</script>

<style scoped>
/* stylelint-disable declaration-property-value-no-unknown -- uni-app rpx 单位 */
.form-input {
  box-sizing: border-box;
  width: 100%;
  height: 80rpx;
  padding: 0 24rpx;
  margin-top: 24rpx;
  font-size: 28rpx;
  border: 1rpx solid #dcdfe6;
  border-radius: 12rpx;
}
</style>
