// ESLint 扁平配置 — 最小安全网：vue essential + 精选正确性规则
// 目标：npm run lint 在现有代码上零 error 通过；风格类问题一律不管
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  // ---------- 忽略目录 ----------
  {
    ignores: [
      'dist/**',
      'android/**',
      'src-tauri/**',
      'node_modules/**',
      'public/**',
      'src/assets/**',
      // agent 工作区（含独立 git worktree），不属于主代码
      '.claude/**'
    ]
  },

  // ---------- Vue 3 essential 规则集（含 .vue 解析器配置） ----------
  ...pluginVue.configs['flat/essential'],

  // ---------- 全部 JS / Vue 源码：浏览器环境 + 正确性规则 ----------
  {
    files: ['**/*.{js,mjs,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // <script setup> 编译器宏
        defineProps: 'readonly',
        defineEmits: 'readonly',
        defineExpose: 'readonly',
        defineOptions: 'readonly',
        defineModel: 'readonly',
        withDefaults: 'readonly'
      }
    },
    rules: {
      // --- error：真正的 bug 级问题，当前代码必须为 0 ---
      'no-undef': 'error',
      'no-const-assign': 'error',
      'no-class-assign': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-global-assign': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-self-assign': 'error',
      'no-setter-return': 'error',
      'getter-return': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': 'error',
      'no-constant-binary-expression': 'error',
      'no-invalid-regexp': 'error',
      'no-loss-of-precision': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-obj-calls': 'error',
      'no-sparse-arrays': 'error',
      'for-direction': 'error',
      'no-ex-assign': 'error',
      'no-debugger': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'error',
      'no-fallthrough': 'error',

      // --- warn：有价值但存量代码存在违反，不阻塞 lint ---
      // async executor 现有 1 处（blobToCanvas，已用 try/catch 包裹）
      'no-async-promise-executor': 'warn',
      'no-unused-vars': ['warn', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_'
      }],
      'no-irregular-whitespace': 'warn'
    }
  },

  // ---------- Vue 规则微调 ----------
  {
    files: ['**/*.vue'],
    rules: {
      // 视图组件大量单词命名（HomeView 内部组件等），存量不改
      'vue/multi-word-component-names': 'off',
      // v-memo 嵌套 v-for 属于性能问题而非崩溃，存量 3 处，降为 warn
      'vue/valid-v-memo': 'warn',
      // Vue 3.4 编译器可静态提升字面量 const，运行时正常，降为 warn
      'vue/valid-define-props': 'warn'
    }
  },

  // ---------- Node 环境文件（构建配置与脚本） ----------
  {
    files: ['vite.config.js', 'vitest.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },

  // ---------- Vitest 测试文件（vitest.config.js 开了 globals: true） ----------
  {
    files: ['src/**/__tests__/**/*.test.js', 'src/test-utils/**/*.js'],
    languageOptions: {
      globals: { ...globals.vitest }
    }
  }
]
