<template>
  <view class="landing" :class="{ 'js-on': jsOn }">
    <text class="skip-link" tabindex="0" @click="scrollTo('features')">跳到主要内容</text>

    <!-- 悬浮导航：离顶浮动、半透明 + 背景模糊 -->
    <view class="nav-wrap">
      <view class="nav">
        <view class="nav-brand" tabindex="0" @click="scrollTo('hero')">
          <view class="nav-logo"><text class="nav-logo-text">通</text></view>
          <text class="nav-name">通关秘籍</text>
        </view>
        <view class="nav-links">
          <text
            v-for="l in navLinks"
            :key="l.id"
            class="nav-link"
            :class="{ 'nav-link-active': activeSection === l.id }"
            tabindex="0"
            @click="scrollTo(l.id)">
            {{ l.label }}
          </text>
        </view>
        <view class="nav-actions">
          <view class="btn btn-ghost btn-sm" tabindex="0" @click="openGithub">GitHub</view>
          <view class="btn btn-primary btn-sm" tabindex="0" @click="goDemo">体验 Demo</view>
        </view>
        <view class="nav-toggle" :class="{ open: menuOpen }" tabindex="0" @click="menuOpen = !menuOpen">
          <view class="nav-toggle-bar" />
          <view class="nav-toggle-bar" />
        </view>
      </view>
    </view>

    <!-- 移动端全高菜单，链接按序入场 -->
    <view class="menu-panel" :class="{ open: menuOpen }">
      <text
        v-for="(l, i) in navLinks"
        :key="l.id"
        class="menu-link"
        :style="{ transitionDelay: menuOpen ? i * 60 + 'ms' : '0ms' }"
        @click="onMenuLink(l.id)">
        {{ l.label }}
      </text>
      <view
        class="menu-link menu-link-strong"
        :style="{ transitionDelay: menuOpen ? navLinks.length * 60 + 'ms' : '0ms' }"
        @click="onMenuLink('__github')">
        GitHub 仓库
      </view>
    </view>

    <!-- Hero -->
    <view id="hero" class="hero">
      <view class="container hero-inner">
        <view class="hero-copy">
          <view class="hero-badge"><text class="hero-badge-text">全栈个人项目 · 独立设计开发与部署</text></view>
          <text class="hero-title">把刷过的每一道题，{{ "\n" }}变成真正记住的知识。</text>
          <text class="hero-sub">
            通关秘籍是我独立完成的 markdown 笔记与面试复习
            App：写下笔记只是开始，间隔重复算法会在你快要忘记时把卡片推回来，直到真正通关。前端 uni-app，后端
            NestJS，源码全部开放。
          </text>
          <view class="hero-cta">
            <view class="btn btn-primary" tabindex="0" @click="goDemo">在线体验 Demo</view>
            <view class="btn btn-ghost" tabindex="0" @click="openResume">下载简历 PDF</view>
          </view>
          <text class="hero-proof">uni-app · Vue 3 · TypeScript · NestJS · Prisma · MySQL · Jest</text>
        </view>

        <!-- 复习页手机 mockup：纯 CSS 还原真实界面 -->
        <view class="hero-visual">
          <view class="phone">
            <view class="phone-screen">
              <view class="phone-status">
                <text class="phone-status-title">今日复习</text>
                <text class="phone-status-count">还剩 12 张</text>
              </view>
              <view class="phone-chip"><text class="phone-chip-text"># MySQL 是怎样运行的</text></view>
              <view class="phone-card">
                <text class="phone-card-label">问题</text>
                <text class="phone-card-q">InnoDB 为什么选择 B+ 树而不是 B 树作为索引结构？</text>
                <view class="phone-card-answer"><text class="phone-card-answer-text">点击展开答案</text></view>
              </view>
              <view class="phone-grades">
                <view v-for="g in mockGrades" :key="g.label" class="phone-grade">
                  <text class="phone-grade-label">{{ g.label }}</text>
                  <text class="phone-grade-days">{{ g.days }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- B11 大字号 tagline：滚动逐字点亮 -->
    <view id="tagline-anchor" class="tagline">
      <view class="container">
        <view v-for="(line, li) in taglineLines" :key="li" class="tagline-line">
          <text v-for="(ch, ci) in line" :key="ci" class="tag-word" :style="wordStyle(li, ci)">{{ ch }}</text>
        </view>
      </view>
    </view>

    <!-- 功能收益 -->
    <view id="features" class="section">
      <view class="container">
        <text class="section-kicker rv">功能</text>
        <text class="section-title rv">不只是记录，更要记住</text>
        <view class="feature-grid">
          <view v-for="f in features" :key="f.title" class="feature-card rv">
            <view class="feature-tile">
              <text class="feature-tile-text">{{ f.tile }}</text>
            </view>
            <text class="feature-title">{{ f.title }}</text>
            <text class="feature-desc">{{ f.desc }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 如何工作 -->
    <view id="how" class="section">
      <view class="container">
        <text class="section-kicker rv">如何工作</text>
        <text class="section-title rv">三步，从记录到通关</text>
        <view class="step-grid">
          <view v-for="(s, i) in steps" :key="s.title" class="step-card rv">
            <text class="step-num">0{{ i + 1 }}</text>
            <text class="step-title">{{ s.title }}</text>
            <text class="step-desc">{{ s.desc }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 技术栈 -->
    <view id="tech" class="section">
      <view class="container">
        <text class="section-kicker rv">技术栈</text>
        <text class="section-title rv">一个人，一条完整链路</text>
        <view class="tech-grid">
          <view v-for="t in techGroups" :key="t.name" class="tech-card rv">
            <text class="tech-name">{{ t.name }}</text>
            <view class="tech-items">
              <text v-for="item in t.items" :key="item" class="tech-item">{{ item }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- FAQ -->
    <view id="faq" class="section">
      <view class="container container-narrow">
        <text class="section-kicker rv">常见问题</text>
        <text class="section-title rv">你可能想问</text>
        <view v-for="q in faqs" :key="q.q" class="faq-item rv">
          <text class="faq-q">{{ q.q }}</text>
          <text class="faq-a">{{ q.a }}</text>
        </view>
      </view>
    </view>

    <!-- 最终 CTA -->
    <view class="section final">
      <view class="container final-inner rv">
        <text class="final-title">想看看它跑起来的样子？</text>
        <text class="final-sub">注册一个账号就能体验完整流程，所有功能真实可用。</text>
        <view class="hero-cta">
          <view class="btn btn-primary" tabindex="0" @click="goDemo">在线体验 Demo</view>
          <view class="btn btn-ghost" tabindex="0" @click="openResume">下载简历 PDF</view>
        </view>
      </view>
    </view>

    <!-- 页脚 -->
    <view class="footer">
      <view class="container footer-inner">
        <text class="footer-copy">© 2026 周兴杰 · 通关秘籍 · 独立全栈项目</text>
        <view class="footer-links">
          <text class="footer-link" tabindex="0" @click="openGithub">GitHub 仓库</text>
          <text class="footer-link" tabindex="0" @click="openResume">下载简历</text>
          <text class="footer-link" tabindex="0" @click="scrollTo('hero')">回到顶部</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { RESUME_PDF_URL } from "@/config/resume";
import { openPdf } from "@/utils/pdf";

const navLinks = [
  { id: "features", label: "功能" },
  { id: "how", label: "如何工作" },
  { id: "tech", label: "技术栈" },
  { id: "faq", label: "常见问题" },
];

const mockGrades = [
  { label: "忘了", days: "1 分钟后" },
  { label: "很吃力", days: "2 天后" },
  { label: "想起来了", days: "4 天后" },
  { label: "太简单", days: "9 天后" },
];

// B11 tagline 文案按行拆成单字，滚动时逐字点亮
const taglineLines = [
  ["记", "录", "，", "只", "是", "第", "一", "步", "。"],
  ["记", "住", "，", "才", "算", "通", "关", "。"],
];

const features = [
  {
    tile: "曲线",
    title: "会提醒你复习的笔记",
    desc: "艾宾浩斯遗忘曲线叠加 SM2 难度因子，四档自评决定下次见面时间，按钮上直接预告「几天后再见」。",
  },
  {
    tile: "宫殿",
    title: "记忆宫殿桩位编排",
    desc: "把卡片挂到一条熟悉的空间路径上，按位置法巡游复习，给每张卡一个可以回忆的家。",
  },
  {
    tile: "快照",
    title: "改坏了也能回退",
    desc: "每次编辑先把旧版本存进快照，乐观锁拦下两端同时修改的冲突，任何一个历史版本都可以恢复。",
  },
  {
    tile: "同步",
    title: "GitHub 小册一键入库",
    desc: "抓取开源教程按章节顺序入库，按链接幂等同步，脚本重跑多少遍都不会产生重复数据。",
  },
  {
    tile: "分块",
    title: "复习队列按主题分块",
    desc: "今天的复习按标签连成整块，啃完一个主题再换下一个，不在碎片之间来回切换上下文。",
  },
  {
    tile: "契约",
    title: "前后端一套契约",
    desc: "所有业务结果只看统一的业务码出口，前端请求层一处处理全部错误提示，页面里不写重复样板。",
  },
];

const steps = [
  { title: "记录", desc: "用 markdown 写下笔记，答案藏进可折叠的 details 块，先考自己再看答案。" },
  { title: "复习", desc: "到期卡片自动排进今日队列，按主题分块推送，凭真实记忆程度四档自评。" },
  { title: "通关", desc: "掌握度随复习阶段推进，曲线页亲眼看见遗忘曲线被一次次复习拉平。" },
];

const techGroups = [
  { name: "前端", items: ["uni-app", "Vue 3", "TypeScript", "Pinia", "UnoCSS", "wot design uni"] },
  { name: "后端", items: ["NestJS", "Prisma", "MySQL", "JWT", "统一业务码契约"] },
  { name: "质量", items: ["Jest 单元测试", "supertest 端到端", "ESLint", "commitlint", "husky"] },
];

const faqs = [
  {
    q: "这个项目想解决什么问题？",
    a: "收藏等于学会的错觉。面试题刷完就忘，是因为没有任何东西提醒你复习。通关秘籍把每条笔记当成一张记忆卡片，用间隔重复把复习安排在遗忘发生之前。",
  },
  {
    q: "为什么不用现成的笔记软件？",
    a: "复习调度必须长在自己的数据模型上：到期时间、阶段、难度因子、记忆宫殿桩位，这些字段现成软件都不开放。自建后端才能把「什么时候该复习什么」算准。",
  },
  {
    q: "间隔重复是怎么实现的？",
    a: "调度算法是一组纯函数，时间由调用方传入，方便钉死时间写单测。前端留了一份同构副本，复习按钮上的「几天后再见」不发请求就能预告，两边保持一致。",
  },
  {
    q: "数据安全吗？",
    a: "每个接口先做归属校验，用户身份只取自 JWT 而不信任请求体，查不到统一返回 404，不区分「不存在」和「是别人的」，避免被探测。",
  },
  {
    q: "测试怎么保证质量？",
    a: "后端用 Jest 写单元测试、supertest 跑端到端，共享一个独立测试库，跑测试前自动重建，核心调度与状态机逻辑全部有用例覆盖。",
  },
  {
    q: "代码在哪里看？",
    a: "前后端在同一个仓库里开源，点页面右上角的 GitHub 即可查看，提交记录保留了从设计文档到实现的完整过程。",
  },
  {
    q: "可以体验完整功能吗？",
    a: "可以。点「在线体验 Demo」注册一个账号，笔记、复习、记忆宫殿、版本历史全部可用，部署在云服务器上的真实环境。",
  },
];

const menuOpen = ref(false);

const goDemo = () => {
  uni.navigateTo({ url: "/pages/index/index" });
};

const openResume = () => {
  if (RESUME_PDF_URL) {
    openPdf(RESUME_PDF_URL);
  } else {
    uni.showToast({ title: "简历尚未配置", icon: "none" });
  }
};

// vue-tsc 不识别条件编译注释，#ifdef 只能写在函数体内部，不能整段包裹重复声明
const openGithub = () => {
  // #ifdef H5
  window.open("https://github.com/ChangZhou-xj/pass-scroll-mobile", "_blank");
  // #endif
  // #ifndef H5
  uni.setClipboardData({ data: "https://github.com/ChangZhou-xj/pass-scroll-mobile" });
  // #endif
};

const jsOn = ref(false);
const activeSection = ref("hero");
const activeWords = ref(0);

const lineOffsets = taglineLines.reduce<number[]>((acc, line, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + taglineLines[i - 1].length);
  return acc;
}, []);
const totalWords = taglineLines.reduce((n, line) => n + line.length, 0);

// 项目约定：动态颜色一律走 :style（UnoCSS 动态 class 的 arbitrary value 会静默失效）
const wordStyle = (li: number, ci: number) => {
  if (!jsOn.value) return {};
  const idx = lineOffsets[li] + ci;
  return { color: idx < activeWords.value ? "#FFFFFF" : "rgba(255, 255, 255, 0.28)" };
};

// #ifdef H5
let revealObserver: IntersectionObserver | null = null;
let sectionObserver: IntersectionObserver | null = null;
let ticking = false;

const onScroll = () => {
  if (ticking) return;
  ticking = true;
  window.requestAnimationFrame(() => {
    ticking = false;
    const el = document.getElementById("tagline-anchor");
    if (!el) return;
    const vh = window.innerHeight;
    const progress = Math.min(1, Math.max(0, (vh * 0.8 - el.getBoundingClientRect().top) / (vh * 0.6)));
    activeWords.value = Math.round(progress * totalWords);
  });
};

const setMeta = (name: string, content: string) => {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
};

onMounted(() => {
  document.title = "通关秘籍 · 把刷过的题变成真正记住的知识";
  setMeta(
    "description",
    "通关秘籍：独立开发的全栈 markdown 笔记与间隔重复复习 App，uni-app 前端加 NestJS 后端，含记忆宫殿、版本快照与 GitHub 小册导入。",
  );

  jsOn.value = true;

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("rv-in");
          revealObserver?.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 },
  );
  document.querySelectorAll(".landing .rv").forEach((el) => revealObserver?.observe(el));

  sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) activeSection.value = entry.target.id;
      });
    },
    { rootMargin: "-40% 0px -55% 0px" },
  );
  ["hero", "features", "how", "tech", "faq"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) sectionObserver?.observe(el);
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});

onUnmounted(() => {
  revealObserver?.disconnect();
  sectionObserver?.disconnect();
  window.removeEventListener("scroll", onScroll);
});

// #endif

const scrollTo = (id: string) => {
  // #ifdef H5
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  // #endif
};

const onMenuLink = (id: string) => {
  menuOpen.value = false;
  if (id === "__github") {
    openGithub();
    return;
  }
  scrollTo(id);
};
</script>

<style>
@import "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap";
</style>

<style scoped>
.landing {
  min-height: 100vh;
  font-family:
    Manrope,
    -apple-system,
    "PingFang SC",
    "Microsoft YaHei",
    sans-serif;
  color: #ffffff;
  background: #000000;
  -webkit-font-smoothing: antialiased;
}

.container {
  max-width: 1080px;
  padding: 0 24px;
  margin: 0 auto;
}

.container-narrow {
  max-width: 760px;
}

/* ---------- 可访问性：跳到内容 ---------- */

.skip-link {
  position: fixed;
  top: -48px;
  left: 16px;
  z-index: 60;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #000000;
  background: #ffffff;
  border-radius: 8px;
  transition: top 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.skip-link:focus-visible {
  top: 16px;
}

/* ---------- 导航 ---------- */

.nav-wrap {
  position: fixed;
  top: 16px;
  right: 0;
  left: 0;
  z-index: 50;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  padding: 0 16px;
}

.nav {
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 8px 12px;
  background: rgba(24, 24, 24, 0.72);
  border: 1px solid #272727;
  border-radius: 9999px;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.nav-brand {
  display: flex;
  gap: 8px;
  align-items: center;
  cursor: pointer;
}

.nav-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: #ffffff;
  border-radius: 8px;
}

.nav-logo-text {
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
  color: #000000;
}

.nav-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.nav-links {
  display: flex;
  gap: 4px;
  align-items: center;
}

.nav-link {
  padding: 8px 12px;
  font-size: 14px;
  line-height: 20px;
  color: #9b9b9b;
  cursor: pointer;
  border-radius: 8px;
  transition:
    color 300ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.nav-link:hover {
  color: #ffffff;
  background: #272727;
}

.nav-link-active {
  color: #ffffff;
  background: #272727;
}

.nav-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.nav-toggle {
  position: relative;
  display: none;
  width: 32px;
  height: 32px;
  cursor: pointer;
  border-radius: 8px;
}

.nav-toggle-bar {
  position: absolute;
  right: 8px;
  left: 8px;
  height: 2px;
  background: #ffffff;
  border-radius: 2px;
  transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
}

.nav-toggle-bar:first-child {
  top: 12px;
}

.nav-toggle-bar:last-child {
  bottom: 12px;
}

.nav-toggle.open .nav-toggle-bar:first-child {
  transform: translateY(3px) rotate(45deg);
}

.nav-toggle.open .nav-toggle-bar:last-child {
  transform: translateY(-3px) rotate(-45deg);
}

/* ---------- 移动端全高菜单 ---------- */

.menu-panel {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 24px;
  justify-content: center;
  padding: 0 32px;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.92);
  opacity: 0;
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  transition: opacity 500ms cubic-bezier(0.22, 1, 0.36, 1);
}

.menu-panel.open {
  pointer-events: auto;
  opacity: 1;
}

.menu-link {
  font-size: 30px;
  font-weight: 600;
  line-height: 36px;
  color: #ffffff;
  cursor: pointer;
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity 400ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 400ms cubic-bezier(0.22, 1, 0.36, 1);
}

.menu-panel.open .menu-link {
  opacity: 1;
  transform: translateY(0);
}

.menu-link-strong {
  color: #9b9b9b;
}

/* ---------- 按钮 ---------- */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  cursor: pointer;
  user-select: none;
  border-radius: 8px;
  transition:
    transform 300ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 300ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 300ms cubic-bezier(0.22, 1, 0.36, 1),
    color 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.btn:active {
  transform: scale(0.98);
}

.btn:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

.btn-primary {
  color: #000000;
  background: #ffffff;
  border: 1px solid #ffffff;
}

.btn-primary:hover {
  background: #d9d9d9;
  border-color: #d9d9d9;
  transform: translateY(-1px);
}

.btn-ghost {
  color: #ffffff;
  background: transparent;
  border: 1px solid #272727;
}

.btn-ghost:hover {
  border-color: #9b9b9b;
  transform: translateY(-1px);
}

.btn-sm {
  font-size: 14px;
  line-height: 20px;
}

/* ---------- Hero ---------- */

.hero {
  padding: 160px 0 96px;
}

.hero-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 64px;
  align-items: center;
}

.hero-badge {
  display: inline-flex;
  padding: 4px 12px;
  margin-bottom: 24px;
  background: #181818;
  border: 1px solid #272727;
  border-radius: 9999px;
}

.hero-badge-text {
  font-size: 12px;
  line-height: 16px;
  color: #9b9b9b;
  letter-spacing: 1px;
}

.hero-title {
  display: block;
  max-width: 680px;
  margin-bottom: 24px;
  font-size: 60px;
  font-weight: 700;
  line-height: 1;
  color: transparent;
  letter-spacing: 1px;
  text-wrap: balance;
  white-space: pre-line;
  background: linear-gradient(90deg, #ffffff 0%, #9b9b9b 100%);
  -webkit-background-clip: text;
  background-clip: text;
}

.hero-sub {
  display: block;
  max-width: 680px;
  margin-bottom: 32px;
  font-size: 18px;
  line-height: 28px;
  color: #9b9b9b;
  text-wrap: pretty;
}

.hero-cta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
}

.hero-proof {
  display: block;
  font-size: 14px;
  line-height: 20px;
  color: #9b9b9b;
  letter-spacing: 1px;
}

/* ---------- 手机 mockup ---------- */

.hero-visual {
  display: flex;
  justify-content: center;
}

.phone {
  width: 300px;
  padding: 8px;
  background: #181818;
  border: 1px solid #272727;
  border-radius: 32px;
  animation: phone-float 6s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate;
}

@keyframes phone-float {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-12px);
  }
}

.phone-screen {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background: #000000;
  border: 1px solid #272727;
  border-radius: 24px;
}

.phone-status {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16px 12px 8px;
  background: #1f1f1f;
  border-radius: 16px;
}

.phone-status-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.phone-status-count {
  font-size: 12px;
  line-height: 16px;
  color: #9b9b9b;
}

.phone-chip {
  align-self: flex-start;
  padding: 4px 12px;
  margin: 0 12px;
  background: #272727;
  border-radius: 9999px;
}

.phone-chip-text {
  font-size: 12px;
  line-height: 16px;
  color: #9b9b9b;
}

.phone-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  margin: 0 4px;
  background: #1f1f1f;
  border-radius: 16px;
}

.phone-card-label {
  font-size: 12px;
  line-height: 16px;
  color: #9b9b9b;
}

.phone-card-q {
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.phone-card-answer {
  padding: 8px 12px;
  background: #272727;
  border-radius: 8px;
}

.phone-card-answer-text {
  font-size: 12px;
  line-height: 16px;
  color: #9b9b9b;
}

.phone-grades {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding-bottom: 8px;
}

.phone-grade {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  padding: 8px;
  background: #1f1f1f;
  border: 1px solid #272727;
  border-radius: 8px;
}

.phone-grade-label {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.phone-grade-days {
  font-size: 12px;
  line-height: 16px;
  color: #9b9b9b;
}

/* ---------- B11 tagline ---------- */

.tagline {
  padding: 96px 0;
}

.tagline-line {
  display: block;
  max-width: 680px;
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 2px;
  text-wrap: balance;
}

.tagline-line + .tagline-line {
  margin-top: 16px;
}

.tag-word {
  transition: color 500ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* ---------- 通用分区 ---------- */

.section {
  padding: 96px 0;
}

.section-kicker {
  display: block;
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #9b9b9b;
  letter-spacing: 4px;
}

.section-title {
  display: block;
  max-width: 680px;
  margin-bottom: 48px;
  font-size: 36px;
  font-weight: 700;
  line-height: 40px;
  text-wrap: balance;
}

/* ---------- 滚动揭示 ---------- */

.js-on .rv {
  opacity: 0;
  transform: translateY(32px);
  transition:
    opacity 700ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
}

.js-on .rv.rv-in {
  opacity: 1;
  transform: translateY(0);
}

/* ---------- 功能卡 ---------- */

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.feature-card {
  padding: 32px;
  background: #181818;
  border: 1px solid #272727;
  border-radius: 16px;
  transition:
    transform 500ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.feature-card:hover {
  background: #1f1f1f;
  transform: translateY(-4px);
}

.feature-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 24px;
  background: #272727;
  border-radius: 8px;
}

.feature-tile-text {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.feature-title {
  display: block;
  margin-bottom: 12px;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}

.feature-desc {
  display: block;
  font-size: 14px;
  line-height: 20px;
  color: #9b9b9b;
  text-wrap: pretty;
}

/* ---------- 步骤 ---------- */

.step-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.step-card {
  padding: 32px;
  background: #181818;
  border: 1px solid #272727;
  border-radius: 16px;
}

.step-num {
  display: block;
  margin-bottom: 24px;
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
  color: #313131;
}

.step-title {
  display: block;
  margin-bottom: 12px;
  font-size: 24px;
  font-weight: 600;
  line-height: 32px;
}

.step-desc {
  display: block;
  font-size: 14px;
  line-height: 20px;
  color: #9b9b9b;
  text-wrap: pretty;
}

/* ---------- 技术栈 ---------- */

.tech-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.tech-card {
  padding: 32px;
  background: #181818;
  border: 1px solid #272727;
  border-radius: 16px;
}

.tech-name {
  display: block;
  margin-bottom: 24px;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #9b9b9b;
  letter-spacing: 4px;
}

.tech-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tech-item {
  padding: 4px 12px;
  font-size: 14px;
  line-height: 20px;
  background: #272727;
  border-radius: 9999px;
}

/* ---------- FAQ ---------- */

.faq-item {
  padding: 24px 0;
}

.faq-item + .faq-item {
  border-top: 1px solid #1f1f1f;
}

.faq-q {
  display: block;
  margin-bottom: 8px;
  font-size: 18px;
  font-weight: 600;
  line-height: 28px;
}

.faq-a {
  display: block;
  font-size: 14px;
  line-height: 20px;
  color: #9b9b9b;
  text-wrap: pretty;
}

/* ---------- 最终 CTA ---------- */

.final-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 24px;
  text-align: center;
  background: #181818;
  border: 1px solid #272727;
  border-radius: 16px;
}

.final-title {
  display: block;
  max-width: 680px;
  margin-bottom: 16px;
  font-size: 36px;
  font-weight: 700;
  line-height: 40px;
  text-wrap: balance;
}

.final-sub {
  display: block;
  margin-bottom: 32px;
  font-size: 16px;
  line-height: 24px;
  color: #9b9b9b;
}

/* ---------- 页脚 ---------- */

.footer {
  padding: 32px 0;
  border-top: 1px solid #1f1f1f;
}

.footer-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.footer-copy {
  font-size: 14px;
  line-height: 20px;
  color: #9b9b9b;
}

.footer-links {
  display: flex;
  gap: 24px;
}

.footer-link {
  font-size: 14px;
  line-height: 20px;
  color: #9b9b9b;
  cursor: pointer;
  transition: color 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.footer-link:hover {
  color: #ffffff;
}

/* ---------- 响应式 ---------- */

@media (max-width: 900px) {
  .hero-inner {
    grid-template-columns: minmax(0, 1fr);
    gap: 48px;
  }

  .feature-grid,
  .step-grid,
  .tech-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero-title {
    font-size: 36px;
    line-height: 40px;
  }

  .tagline-line {
    font-size: 30px;
    line-height: 36px;
  }
}

@media (max-width: 720px) {
  .nav-links,
  .nav-actions {
    display: none;
  }

  .nav-toggle {
    display: block;
  }

  .hero {
    padding: 128px 0 64px;
  }

  .section {
    padding: 64px 0;
  }

  .tagline {
    padding: 64px 0;
  }

  .section-title,
  .final-title {
    font-size: 30px;
    line-height: 36px;
  }
}

/* ---------- 降低动效 ---------- */

@media (prefers-reduced-motion: reduce) {
  .phone {
    animation: none;
  }

  .js-on .rv,
  .menu-panel,
  .menu-link,
  .btn,
  .feature-card,
  .nav-link,
  .tag-word,
  .skip-link {
    transform: none;
    transition-duration: 300ms;
    transition-property: opacity;
  }

  .js-on .rv {
    transform: none;
  }
}
</style>
