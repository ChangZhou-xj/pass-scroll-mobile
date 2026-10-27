/**
 * srs.spec.ts——记忆曲线算法的单元测试
 *
 * 这里是纯函数测试（不碰数据库）：把 now 钉死成固定时刻，断言"答哪一档 → 下次什么时候"。
 * 算法是复习体验的地基，改 srs.ts 时先跑 npm test 确认这些断言仍然成立。
 */
import { DEFAULT_CURVE, PRESET_CURVES, intervalForStage, normalizeCurve, retention, schedule } from "./srs";

const NOW = new Date("2026-10-27T10:00:00.000Z");
const MINUTE = 60_000;
const DAY = 60 * 24;

describe("srs 间隔重复调度", () => {
  const fresh = { stage: 0, ease: DEFAULT_CURVE.ease, lapses: 0, reviewCount: 0 };

  it("答 GOOD 进入下一阶段，间隔取曲线下一档（10 分钟 → 1 天）", () => {
    const first = schedule(fresh, "GOOD", DEFAULT_CURVE, NOW);
    expect(first.stage).toBe(1);
    expect(first.intervalMinutes).toBe(DEFAULT_CURVE.steps[1]);
    expect(first.dueAt.getTime()).toBe(NOW.getTime() + DEFAULT_CURVE.steps[1] * MINUTE);

    const second = schedule(first, "GOOD", DEFAULT_CURVE, first.dueAt);
    expect(second.stage).toBe(2);
    expect(second.intervalMinutes).toBe(DEFAULT_CURVE.steps[2]);
  });

  it("答 AGAIN 打回起点并累计遗忘次数，同时下调难度系数", () => {
    const learned = { stage: 5, ease: 2.5, lapses: 0, reviewCount: 5 };
    const back = schedule(learned, "AGAIN", DEFAULT_CURVE, NOW);
    expect(back.stage).toBe(0);
    expect(back.lapses).toBe(1);
    expect(back.ease).toBeCloseTo(2.3, 5);
    expect(back.intervalMinutes).toBe(DEFAULT_CURVE.steps[0]);
  });

  it("答 HARD 停在原阶段但缩短间隔（不惩罚进度）", () => {
    const state = { stage: 3, ease: 2.5, lapses: 0, reviewCount: 3 };
    const hard = schedule(state, "HARD", DEFAULT_CURVE, NOW);
    expect(hard.stage).toBe(3);
    expect(hard.intervalMinutes).toBe(Math.round(DEFAULT_CURVE.steps[3] * DEFAULT_CURVE.hardFactor));
  });

  it("答 EASY 步长更快且难度系数上调", () => {
    const easy = schedule(fresh, "EASY", DEFAULT_CURVE, NOW);
    expect(easy.stage).toBe(1);
    expect(easy.ease).toBeCloseTo(2.65, 5);
    expect(easy.intervalMinutes).toBeGreaterThan(DEFAULT_CURVE.steps[1]);
  });

  it("走到 masteredStage 才标 MASTERED，之前一律 LEARNING", () => {
    let state = schedule(fresh, "GOOD", DEFAULT_CURVE, NOW); // stage 1
    expect(state.mastery).toBe("LEARNING");
    for (let i = 1; i < DEFAULT_CURVE.masteredStage - 1; i++) {
      state = schedule(state, "GOOD", DEFAULT_CURVE, NOW);
      expect(state.mastery).toBe("LEARNING");
    }
    state = schedule(state, "GOOD", DEFAULT_CURVE, NOW);
    expect(state.stage).toBe(DEFAULT_CURVE.masteredStage);
    expect(state.mastery).toBe("MASTERED");
  });

  it("超出曲线长度后按 ease 指数外推，而不是封顶不动", () => {
    const last = DEFAULT_CURVE.steps[DEFAULT_CURVE.steps.length - 1];
    const atEnd = intervalForStage(DEFAULT_CURVE.steps.length - 1, DEFAULT_CURVE, 2.5);
    const beyond = intervalForStage(DEFAULT_CURVE.steps.length, DEFAULT_CURVE, 2.5);
    expect(atEnd).toBe(last);
    expect(beyond).toBe(Math.round(last * 2.5));
  });

  it("难度系数有下限，反复 AGAIN 也不会把间隔压成 0", () => {
    let state = schedule(fresh, "AGAIN", DEFAULT_CURVE, NOW);
    for (let i = 0; i < 20; i++) state = schedule(state, "AGAIN", DEFAULT_CURVE, NOW);
    expect(state.ease).toBeGreaterThanOrEqual(1.3);
    expect(state.intervalMinutes).toBeGreaterThan(0);
  });
});

describe("遗忘曲线与曲线配置清洗", () => {
  it("保持率随衰减时间单调下降，刚复习完为 1", () => {
    expect(retention(0, 1440)).toBe(1);
    expect(retention(1440, 1440)).toBeLessThan(retention(100, 1440));
    expect(retention(1440, 1440)).toBeCloseTo(Math.exp(-1), 5);
  });

  it("强度越大（记得越牢）同时刻保持率越高", () => {
    expect(retention(100, 60 * 24 * 30)).toBeGreaterThan(retention(100, 60));
  });

  it("非法曲线配置被清洗成合法值而不是抛错", () => {
    const cleaned = normalizeCurve({ steps: [0, -5, 999999999], ease: 99, newPerDay: -3 });
    expect(cleaned.steps.every((s) => s >= 1)).toBe(true);
    expect(cleaned.ease).toBeLessThanOrEqual(3.2);
    expect(cleaned.newPerDay).toBeGreaterThanOrEqual(1);
  });

  it("空配置回落到默认曲线", () => {
    expect(normalizeCurve(null).steps).toEqual(DEFAULT_CURVE.steps);
    expect(normalizeCurve({}).ease).toBe(DEFAULT_CURVE.ease);
  });

  it("三套预置曲线的疏密关系成立：密集 < 经典 < 舒缓", () => {
    expect(PRESET_CURVES.intensive.steps[1]).toBeLessThan(PRESET_CURVES.classic.steps[1]);
    expect(PRESET_CURVES.classic.steps[1]).toBeLessThan(PRESET_CURVES.relaxed.steps[1]);
  });
});

describe("单位换算基线", () => {
  it("默认曲线首档是 10 分钟、末档是 60 天", () => {
    expect(DEFAULT_CURVE.steps[0]).toBe(10);
    expect(DEFAULT_CURVE.steps[DEFAULT_CURVE.steps.length - 1]).toBe(DAY * 60);
  });
});
