<script setup lang="ts">
// 根组件——应用启动时（onLaunch）先从本地缓存恢复笔记列表（离线也能秒开），
// 之后各页面 onShow 里再拉最新数据覆盖（见 store/record.ts 的 init/fetchList）
import { onLaunch } from "@dcloudio/uni-app";
import { useRecordStore } from "@/store/record";

onLaunch(() => {
  const recordStore = useRecordStore();
  recordStore.init();
});
</script>
<style>
page {
  font-family: -apple-system, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif;
}
</style>
