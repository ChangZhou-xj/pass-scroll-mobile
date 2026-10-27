<template>
  <view class="min-h-screen bg-white" :style="{ paddingBottom: 'calc(160rpx + env(safe-area-inset-bottom))' }">
    <CustomNavBar title="记忆宫殿" show-back />

    <!-- 说明：位置法（method of loci）的一句话原理 -->
    <view class="mx-30rpx mt-24rpx rounded-48rpx bg-[#E7E3FA] p-40rpx">
      <text class="block font-mono text-22rpx uppercase tracking-[2rpx] text-[#67676C]">METHOD OF LOCI</text>
      <text class="mt-12rpx block text-40rpx font-extrabold tracking-[-1rpx] text-[#0D0D0D]">给笔记找个位置</text>
      <text class="mt-16rpx block text-24rpx leading-36rpx text-[#0D0D0D]">
        把卡片依次摆在一条你熟悉的空间路径上（门口 → 玄关 → 客厅 → 书桌…）。回忆时在脑内沿路径走一遍，
        用空间顺序提示内容顺序——这就是记忆宫殿。巡游模式会按位置顺序出题。
      </text>
    </view>

    <!-- 宫殿列表 -->
    <view class="mx-30rpx mt-32rpx">
      <view class="flex items-center justify-between">
        <text class="text-26rpx font-semibold text-[#0D0D0D]">我的宫殿</text>
        <text class="text-24rpx font-semibold text-[#0D0D0D]" @click="showCreate = !showCreate">
          {{ showCreate ? "取消" : "+ 新建宫殿" }}
        </text>
      </view>

      <!-- 新建表单（内联展开，不用弹层：小程序端弹层里的 input 聚焦体验差） -->
      <view v-if="showCreate" class="mt-16rpx rounded-24rpx bg-[#F4F5F7] p-24rpx">
        <input
          v-model="form.name"
          class="h-72rpx rounded-16rpx bg-white px-24rpx text-28rpx text-[#0D0D0D]"
          placeholder="宫殿名，如「从家门口到书房」"
          placeholder-style="color: #67676C;" />
        <scroll-view scroll-x :show-scrollbar="false" class="mt-16rpx">
          <view class="flex">
            <view
              v-for="emoji in EMOJIS"
              :key="emoji"
              class="mr-12rpx h-64rpx w-64rpx shrink-0 flex-center rounded-full"
              :style="{ background: form.emoji === emoji ? '#0D0D0D' : '#FFFFFF' }"
              @click="form.emoji = emoji">
              <text class="text-30rpx">{{ emoji }}</text>
            </view>
          </view>
        </scroll-view>
        <view class="mt-20rpx">
          <PsButton size="md" block @click="createPalace">创建</PsButton>
        </view>
      </view>

      <view
        v-for="palace in srsStore.palaces"
        :key="palace.id"
        class="mt-16rpx rounded-24rpx px-28rpx py-24rpx"
        :style="palaceCardStyle(palace.id)"
        @click="togglePalace(palace.id)">
        <view class="flex items-center">
          <text class="text-40rpx">{{ palace.emoji }}</text>
          <view class="ml-20rpx flex-1">
            <text class="block text-28rpx font-semibold text-[#0D0D0D]">{{ palace.name }}</text>
            <text class="mt-4rpx block text-22rpx text-[#67676C]">
              {{ palace.description || "未写路径说明" }} · {{ palace.recordCount }} 张卡
            </text>
          </view>
          <text class="text-24rpx text-[#D9303E]" @click.stop="confirmDelete(palace)">删除</text>
        </view>

        <!-- 展开：空间路径（桩位网格） -->
        <view v-if="activeId === palace.id" class="mt-24rpx">
          <view class="flex flex-wrap">
            <view v-for="(slot, index) in slots" :key="slot.id" class="mb-16rpx w-1/2 pr-12rpx box-border">
              <view class="rounded-16rpx bg-white p-20rpx">
                <view class="flex items-center justify-between">
                  <text class="font-mono text-20rpx text-[#67676C]">位置 {{ index + 1 }}</text>
                  <text class="text-20rpx text-[#67676C]" @click.stop="detach(palace.id, slot.id)">移出</text>
                </view>
                <text class="mt-8rpx block text-24rpx font-semibold text-[#0D0D0D]">{{ slot.title }}</text>
                <view class="mt-12rpx h-6rpx w-full rounded-full bg-[#F4F5F7]">
                  <view class="h-6rpx rounded-full" :style="strengthBarStyle(slot)" />
                </view>
                <text class="mt-8rpx block text-20rpx text-[#67676C]">
                  记忆强度 {{ strengthPercent(slot, srsStore.curve) }}% · {{ dueLabel(slot) }}
                </text>
                <view class="mt-12rpx flex">
                  <text
                    v-if="index > 0"
                    class="mr-16rpx text-20rpx font-semibold text-[#0D0D0D]"
                    @click.stop="move(index, -1)">
                    ↑ 前移
                  </text>
                  <text
                    v-if="index < slots.length - 1"
                    class="text-20rpx font-semibold text-[#0D0D0D]"
                    @click.stop="move(index, 1)">
                    ↓ 后移
                  </text>
                </view>
              </view>
            </view>
          </view>

          <view v-if="slots.length === 0" class="py-24rpx text-center">
            <text class="text-24rpx text-[#67676C]">这条路径还是空的，往下面挑几张卡片摆上去</text>
          </view>

          <!-- 可添加的笔记：只列还没归档到任何宫殿的 -->
          <view v-if="available.length" class="mt-8rpx">
            <text class="text-22rpx text-[#67676C]">点一下摆到路径末尾：</text>
            <view class="mt-12rpx flex flex-wrap">
              <view
                v-for="item in available"
                :key="item.id"
                class="mr-12rpx mb-12rpx rounded-full bg-white px-20rpx py-10rpx"
                @click.stop="attach(palace.id, item.id)">
                <text class="text-22rpx text-[#0D0D0D]">+ {{ item.title }}</text>
              </view>
            </view>
          </view>

          <view class="mt-24rpx flex">
            <view class="mr-20rpx flex-1">
              <PsButton variant="secondary" size="md" block @click.stop="saveOrder(palace.id)">保存顺序</PsButton>
            </view>
            <view class="flex-1">
              <PsButton size="md" block @click.stop="startTour(palace.id)">开始巡游</PsButton>
            </view>
          </view>
        </view>
      </view>

      <view v-if="srsStore.palaces.length === 0 && !showCreate" class="pt-40rpx text-center">
        <text class="text-24rpx text-[#67676C]">还没有宫殿，先建一条你最熟悉的空间路径</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { PalaceItem, RecordItem } from "@/types/record";
import { onShow } from "@dcloudio/uni-app";
import { useRecordStore } from "@/store/record";
import { useSrsStore } from "@/store/srs";
import { useUserStore } from "@/store/modules/user";
import { T } from "@/theme/tokens";
import { formatDueLabel, strengthPercent } from "@/utils/srs";

type SrsStoreProxy = Omit<ReturnType<typeof useSrsStore>, "curve" | "palaces"> & {
  curve: import("@/types/record").CurveConfig;
  palaces: PalaceItem[];
};

type RecordStoreProxy = Omit<ReturnType<typeof useRecordStore>, "records"> & { records: RecordItem[] };

const userStore = useUserStore();
const srsStore = useSrsStore() as unknown as SrsStoreProxy;
const recordStore = useRecordStore() as unknown as RecordStoreProxy;

const EMOJIS = ["🏛", "🏠", "🛋", "📚", "🪴", "🚪", "🍳", "🛏", "🧠", "🗺"];

const showCreate = ref(false);
const activeId = ref<string>("");
const form = reactive({ name: "", emoji: "🏛" });

/** 当前展开宫殿内的卡片，按 palaceOrder 排列——这就是那条空间路径 */
const slots = computed(() =>
  recordStore.records.filter((item) => item.palaceId === activeId.value).sort((a, b) => a.palaceOrder - b.palaceOrder),
);

/** 还没归档到任何宫殿的笔记（可往路径上摆） */
const available = computed(() => recordStore.records.filter((item) => !item.palaceId));

const palaceCardStyle = (id: string) =>
  activeId.value === id
    ? `background:${T.blockMint};border:2rpx solid ${T.mintStroke};`
    : `background:${T.blockCream};border:2rpx solid ${T.creamStroke};`;

const strengthBarStyle = (card: RecordItem) => {
  const p = strengthPercent(card, srsStore.curve);
  const color = p >= 60 ? T.masteryGreen : p >= 30 ? T.masteryAmber : T.danger;
  return `width:${Math.max(4, p)}%;background:${color};`;
};

const dueLabel = (card: RecordItem) => (card.dueAt ? formatDueLabel(card.dueAt) : "新卡未排期");

const togglePalace = (id: string) => {
  activeId.value = activeId.value === id ? "" : id;
};

const createPalace = async () => {
  const name = form.name.trim();
  if (!name) {
    uni.showToast({ title: "给宫殿起个名字", icon: "none" });
    return;
  }
  await srsStore.addPalace(name, form.emoji);
  form.name = "";
  showCreate.value = false;
  await recordStore.fetchList();
};

const confirmDelete = (palace: PalaceItem) => {
  uni.showModal({
    title: "删除宫殿",
    content: `「${palace.name}」里的笔记会解除位置（笔记本身不删除）`,
    success: async (res) => {
      if (!res.confirm) return;
      await srsStore.removePalace(palace.id);
      if (activeId.value === palace.id) activeId.value = "";
      await recordStore.fetchList();
    },
  });
};

const attach = async (palaceId: string, recordId: string) => {
  const ids = [...slots.value.map((item) => item.id), recordId];
  await srsStore.savePalaceOrder(palaceId, ids);
  await recordStore.fetchList();
};

const detach = async (palaceId: string, recordId: string) => {
  await srsStore.detachRecord(palaceId, recordId);
  await recordStore.fetchList();
};

/** 上移/下移：交换相邻两个桩位后立刻保存（位置顺序是记忆宫殿的命脉，必须即时落库） */
const move = async (index: number, dir: number) => {
  const list = [...slots.value];
  const target = index + dir;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  await srsStore.savePalaceOrder(
    activeId.value,
    list.map((item) => item.id),
  );
  await recordStore.fetchList();
};

const saveOrder = async (palaceId: string) => {
  await srsStore.savePalaceOrder(
    palaceId,
    slots.value.map((item) => item.id),
  );
  uni.showToast({ title: "顺序已保存", icon: "none" });
};

const startTour = (palaceId: string) => {
  uni.reLaunch({ url: `/pages/review/index?palace=${palaceId}` });
};

onShow(async () => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  // 宫殿管理要看到全部笔记（首页的搜索/标签筛选会漏掉可归档的卡片），进页面先清掉筛选
  recordStore.keyword = "";
  recordStore.activeTag = "";
  await Promise.all([srsStore.fetchPalaces(), recordStore.fetchList()]);
});
</script>
