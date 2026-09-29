/** 设计 token 唯一来源（DESIGN.md 落地，见 spec 2026-09-28-design-language-restyle）
 * 模板静态 class 的 hex 必须与本表一致；动态 :style 一律从这里取值 */
export const T = {
  ink: "#0D0D0D",
  onPrimary: "#FFFFFF",
  canvas: "#FFFFFF",
  surfaceSoft: "#F4F5F7",
  hairline: "#E3E3E6",
  hairlineSoft: "#EFEFF1",
  blockLime: "#D9F2B4",
  blockLilac: "#E7E3FA",
  blockCream: "#F7F2E7",
  blockMint: "#D6F0E3",
  blockPink: "#F9DCE4",
  blockCoral: "#F8D8C8",
  blockNavy: "#1B2A4A",
  mintStroke: "#A9DCC3",
  creamStroke: "#E4D5B5",
  pinkStroke: "#F0B8CB",
  lilacStroke: "#C4B8EE",
  masteryGreen: "#42B883",
  masteryAmber: "#F0B429",
  danger: "#D9303E",
  secondaryText: "#67676C",
  // 代码块配色登记：markdown.ts:51-53 的 PRE_STYLE/CODE_IN_PRE_STYLE 仍写字面量（rich-text 只吃内联字符串，无法引用 T），
  // 此处留档以便改色时两处对齐；值与那两行逐字符一致（含小写）
  codeBlock: "#16181D",
  codeBlockText: "#e6e6e6",
} as const;
