<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useRecordStore } from "@/store/record";

onLaunch(() => {
  const recordStore = useRecordStore();
  recordStore.init();
});
</script>
<style></style>
