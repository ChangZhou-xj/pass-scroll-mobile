/*
 * @Author: moxunjinmu
 * @Date: 2025-03-27 19:29:01
 * @Description: -
 */
module.exports = {
  extends: [
    "stylelint-config-recommended",
    "stylelint-config-recommended-scss",
    "stylelint-config-recommended-vue/scss",
    "stylelint-config-html/vue",
    "stylelint-config-recess-order",
  ],
  plugins: ["stylelint-prettier"],
  overrides: [
    {
      files: ["**/*.{vue,html}"],
      customSyntax: "postcss-html",
    },
    {
      files: ["**/*.{css,scss}"],
      customSyntax: "postcss-scss",
    },
  ],
  rules: {
    "import-notation": "string",
    "selector-class-pattern": null,
    "custom-property-pattern": null,
    "keyframes-name-pattern": null,
    "no-descending-specificity": null,
    "no-empty-source": null,
    "selector-pseudo-class-no-unknown": [
      true,
      {
        ignorePseudoClasses: ["global", "export", "deep"],
      },
    ],
    "selector-type-no-unknown": [
      true,
      {
        ignoreTypes: ["page"],
      },
    ],
    "unit-no-unknown": [
      true,
      {
        ignoreUnits: ["rpx"],
      },
    ],
    // 项目样式使用小程序 rpx 单位（同 unit-no-unknown 的放行），该规则会误报 rpx 值，关闭
    "declaration-property-value-no-unknown": null,
    "property-no-unknown": [
      true,
      {
        ignoreProperties: [],
      },
    ],
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["apply", "use", "forward"],
      },
    ],
  },
};
