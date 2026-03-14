export const THEME_IDS = {
  mist: 'mist',
  pink: 'pink',
  ember: 'ember',
  cobalt: 'cobalt',
  jade: 'jade',
  gilded: 'gilded',
  idol: 'idol',
  paper: 'paper',
  mint: 'mint',
  vinyl: 'vinyl',
  terracotta: 'terracotta'
}

export const APPEARANCE_PREFERENCES = {
  system: 'system',
  light: 'light',
  dark: 'dark'
}

export const APPEARANCE_OPTIONS = [
  {
    value: APPEARANCE_PREFERENCES.system,
    label: '跟随系统',
    description: '自动跟随设备当前的浅色或深色外观'
  },
  {
    value: APPEARANCE_PREFERENCES.light,
    label: '浅色模式',
    description: '始终使用银雾玻璃主题的浅色外观'
  },
  {
    value: APPEARANCE_PREFERENCES.dark,
    label: '深色模式',
    description: '始终使用银雾玻璃主题的深色外观'
  }
]

export const THEME_DEFINITIONS = {
  [THEME_IDS.mist]: {
    id: THEME_IDS.mist,
    label: '银雾玻璃',
    description: '冷雾银灰和玻璃卡片的基础主题，支持浅色、深色和跟随系统。',
    defaultAppearance: 'light',
    supportsAppearanceControl: true,
    preview: ['#ffffff', '#eeeff2', '#141416'],
    appearances: {
      light: {
        '--app-bg': '#f5f5f7',
        '--app-bg-gradient': 'linear-gradient(180deg, #efeff2 0%, #e7e7eb 100%)',
        '--app-surface': '#ffffff',
        '--app-surface-soft': '#eeeff2',
        '--app-surface-muted': '#f0f0f2',
        '--app-text': '#141416',
        '--app-text-secondary': '#5f6570',
        '--app-text-tertiary': '#8e8e93',
        '--app-placeholder': '#a1a1a6',
        '--app-border': 'rgba(17, 20, 22, 0.06)',
        '--app-shadow': '0 8px 24px rgba(0, 0, 0, 0.06)',
        '--summary-card-gradient': 'linear-gradient(145deg, #17181c 0%, #24262d 52%, #33363e 100%)',
        '--summary-card-orb': 'rgba(255, 255, 255, 0.08)',
        '--summary-card-text': '#ffffff',
        '--summary-card-label': 'rgba(255, 255, 255, 0.56)',
        '--summary-card-button-bg': 'rgba(255, 255, 255, 0.08)',
        '--summary-card-button-border': 'rgba(255, 255, 255, 0.12)',
        '--summary-card-button-text': 'rgba(255, 255, 255, 0.82)',
        '--app-glass': 'rgba(255, 255, 255, 0.86)',
        '--app-glass-strong': 'rgba(255, 255, 255, 0.72)',
        '--app-glass-border': 'rgba(255, 255, 255, 0.52)',
        '--app-overlay': 'rgba(20, 20, 22, 0.22)'
      },
      dark: {
        '--app-bg': '#0f0f10',
        '--app-bg-gradient': 'linear-gradient(180deg, #0a0a0b 0%, #0f0f11 100%)',
        '--app-surface': '#1c1c1e',
        '--app-surface-soft': '#2c2c2e',
        '--app-surface-muted': '#28282a',
        '--app-text': '#f5f5f7',
        '--app-text-secondary': '#aeaeb2',
        '--app-text-tertiary': '#636366',
        '--app-placeholder': '#5a5a5f',
        '--app-border': 'rgba(255, 255, 255, 0.08)',
        '--app-shadow': '0 8px 24px rgba(0, 0, 0, 0.4)',
        '--summary-card-gradient': 'linear-gradient(145deg, #121319 0%, #1d2028 52%, #2d313c 100%)',
        '--summary-card-orb': 'rgba(255, 255, 255, 0.08)',
        '--summary-card-text': '#ffffff',
        '--summary-card-label': 'rgba(255, 255, 255, 0.58)',
        '--summary-card-button-bg': 'rgba(255, 255, 255, 0.08)',
        '--summary-card-button-border': 'rgba(255, 255, 255, 0.12)',
        '--summary-card-button-text': 'rgba(255, 255, 255, 0.84)',
        '--app-glass': 'rgba(34, 34, 38, 0.68)',
        '--app-glass-strong': 'rgba(24, 24, 28, 0.78)',
        '--app-glass-border': 'rgba(255, 255, 255, 0.10)',
        '--app-overlay': 'rgba(0, 0, 0, 0.36)'
      }
    }
  },
  [THEME_IDS.paper]: {
    id: THEME_IDS.paper,
    label: '纸页奶油',
    description: '更暖的纸页底色和收藏册气质，固定浅色外观。',
    defaultAppearance: 'light',
    supportsAppearanceControl: false,
    preview: ['#fffaf0', '#efe5d5', '#7a5e3f'],
    appearances: {
      light: {
        '--app-bg': '#f6efe4',
        '--app-bg-gradient': 'linear-gradient(180deg, #f8f1e8 0%, #efe4d5 100%)',
        '--app-surface': '#fffaf0',
        '--app-surface-soft': '#efe5d5',
        '--app-surface-muted': '#f4ebdd',
        '--app-text': '#2a221a',
        '--app-text-secondary': '#6f6253',
        '--app-text-tertiary': '#9d8e7a',
        '--app-placeholder': '#b4a594',
        '--app-border': 'rgba(82, 64, 39, 0.08)',
        '--app-shadow': '0 10px 28px rgba(86, 63, 32, 0.08)',
        '--summary-card-gradient': 'linear-gradient(145deg, #8f6546 0%, #b2875f 52%, #d5b184 100%)',
        '--summary-card-orb': 'rgba(255, 248, 238, 0.18)',
        '--summary-card-text': '#fffaf2',
        '--summary-card-label': 'rgba(255, 250, 242, 0.7)',
        '--summary-card-button-bg': 'rgba(255, 250, 242, 0.12)',
        '--summary-card-button-border': 'rgba(255, 250, 242, 0.18)',
        '--summary-card-button-text': 'rgba(255, 250, 242, 0.9)',
        '--app-glass': 'rgba(255, 250, 240, 0.84)',
        '--app-glass-strong': 'rgba(252, 243, 229, 0.74)',
        '--app-glass-border': 'rgba(255, 250, 240, 0.54)',
        '--app-overlay': 'rgba(42, 34, 26, 0.2)'
      }
    }
  },
  [THEME_IDS.pink]: {
    id: THEME_IDS.pink,
    label: '糖霜粉霓',
    description: '更大胆的粉色舞台感风格，偏甜但不做成儿童化，固定浅色外观。',
    defaultAppearance: 'light',
    supportsAppearanceControl: false,
    preview: ['#fff7fb', '#ffd3e8', '#ff5fa2'],
    appearances: {
      light: {
        '--app-bg': '#fff1f7',
        '--app-bg-gradient': 'linear-gradient(180deg, #fff4f9 0%, #ffd9ea 58%, #ffc8e1 100%)',
        '--app-surface': '#fff9fc',
        '--app-surface-soft': '#ffd7e8',
        '--app-surface-muted': '#ffe6f1',
        '--app-text': '#351521',
        '--app-text-secondary': '#7d4b62',
        '--app-text-tertiary': '#b06f8e',
        '--app-placeholder': '#c48aa5',
        '--app-border': 'rgba(143, 47, 92, 0.10)',
        '--app-shadow': '0 14px 32px rgba(181, 74, 123, 0.12)',
        '--summary-card-gradient': 'linear-gradient(145deg, #a12b63 0%, #d94d8c 52%, #ff7fb4 100%)',
        '--summary-card-orb': 'rgba(255, 242, 248, 0.22)',
        '--summary-card-text': '#fff9fc',
        '--summary-card-label': 'rgba(255, 249, 252, 0.72)',
        '--summary-card-button-bg': 'rgba(255, 249, 252, 0.12)',
        '--summary-card-button-border': 'rgba(255, 249, 252, 0.20)',
        '--summary-card-button-text': 'rgba(255, 249, 252, 0.92)',
        '--app-glass': 'rgba(255, 249, 252, 0.84)',
        '--app-glass-strong': 'rgba(255, 233, 243, 0.78)',
        '--app-glass-border': 'rgba(255, 255, 255, 0.5)',
        '--app-overlay': 'rgba(53, 21, 33, 0.18)'
      }
    }
  },
  [THEME_IDS.ember]: {
    id: THEME_IDS.ember,
    label: '霓橘流火',
    description: '更鲜艳的橘红霓光风格，像舞台灯和应援棒一起打亮，固定浅色外观。',
    defaultAppearance: 'light',
    supportsAppearanceControl: false,
    preview: ['#fff8f3', '#ffd1b2', '#ff6a3d'],
    appearances: {
      light: {
        '--app-bg': '#fff1e6',
        '--app-bg-gradient': 'linear-gradient(180deg, #fff4ea 0%, #ffd8bf 56%, #ffc39d 100%)',
        '--app-surface': '#fffaf6',
        '--app-surface-soft': '#ffd7bf',
        '--app-surface-muted': '#ffe6d7',
        '--app-text': '#391c15',
        '--app-text-secondary': '#885240',
        '--app-text-tertiary': '#be745b',
        '--app-placeholder': '#cf9078',
        '--app-border': 'rgba(168, 76, 34, 0.12)',
        '--app-shadow': '0 14px 32px rgba(205, 97, 47, 0.14)',
        '--summary-card-gradient': 'linear-gradient(145deg, #b63d1e 0%, #e96e2e 52%, #ff9b57 100%)',
        '--summary-card-orb': 'rgba(255, 241, 231, 0.24)',
        '--summary-card-text': '#fffaf6',
        '--summary-card-label': 'rgba(255, 250, 246, 0.72)',
        '--summary-card-button-bg': 'rgba(255, 250, 246, 0.14)',
        '--summary-card-button-border': 'rgba(255, 250, 246, 0.22)',
        '--summary-card-button-text': 'rgba(255, 250, 246, 0.94)',
        '--app-glass': 'rgba(255, 250, 246, 0.84)',
        '--app-glass-strong': 'rgba(255, 236, 222, 0.78)',
        '--app-glass-border': 'rgba(255, 255, 255, 0.52)',
        '--app-overlay': 'rgba(57, 28, 21, 0.18)'
      }
    }
  },
  [THEME_IDS.cobalt]: {
    id: THEME_IDS.cobalt,
    label: '钴蓝剧场',
    description: '冷调钴蓝和剧场灯幕的现代感主题，支持浅色、深色和跟随系统。',
    defaultAppearance: 'light',
    supportsAppearanceControl: true,
    preview: ['#f7f9ff', '#d6e0ff', '#315eff'],
    appearances: {
      light: {
        '--app-bg': '#edf2ff',
        '--app-bg-gradient': 'linear-gradient(180deg, #f2f5ff 0%, #dce5ff 58%, #cad8ff 100%)',
        '--app-surface': '#fbfcff',
        '--app-surface-soft': '#d7e1ff',
        '--app-surface-muted': '#e6ecff',
        '--app-text': '#182040',
        '--app-text-secondary': '#4b5f98',
        '--app-text-tertiary': '#7183b8',
        '--app-placeholder': '#8a9acd',
        '--app-border': 'rgba(44, 76, 178, 0.10)',
        '--app-shadow': '0 14px 32px rgba(61, 95, 203, 0.12)',
        '--summary-card-gradient': 'linear-gradient(145deg, #20326f 0%, #315eff 52%, #6b93ff 100%)',
        '--summary-card-orb': 'rgba(242, 246, 255, 0.22)',
        '--summary-card-text': '#fbfcff',
        '--summary-card-label': 'rgba(251, 252, 255, 0.72)',
        '--summary-card-button-bg': 'rgba(251, 252, 255, 0.14)',
        '--summary-card-button-border': 'rgba(251, 252, 255, 0.22)',
        '--summary-card-button-text': 'rgba(251, 252, 255, 0.94)',
        '--app-glass': 'rgba(251, 252, 255, 0.84)',
        '--app-glass-strong': 'rgba(236, 241, 255, 0.78)',
        '--app-glass-border': 'rgba(255, 255, 255, 0.52)',
        '--app-overlay': 'rgba(24, 32, 64, 0.18)'
      },
      dark: {
        '--app-bg': '#0f1322',
        '--app-bg-gradient': 'linear-gradient(180deg, #090c16 0%, #11172a 52%, #18203a 100%)',
        '--app-surface': '#151b30',
        '--app-surface-soft': '#243055',
        '--app-surface-muted': '#1c2544',
        '--app-text': '#eef3ff',
        '--app-text-secondary': '#b3c0ea',
        '--app-text-tertiary': '#7483b0',
        '--app-placeholder': '#61709d',
        '--app-border': 'rgba(118, 146, 255, 0.14)',
        '--app-shadow': '0 16px 36px rgba(0, 0, 0, 0.46)',
        '--summary-card-gradient': 'linear-gradient(145deg, #13214f 0%, #315eff 52%, #6b93ff 100%)',
        '--summary-card-orb': 'rgba(241, 246, 255, 0.16)',
        '--summary-card-text': '#fbfcff',
        '--summary-card-label': 'rgba(251, 252, 255, 0.72)',
        '--summary-card-button-bg': 'rgba(251, 252, 255, 0.10)',
        '--summary-card-button-border': 'rgba(251, 252, 255, 0.18)',
        '--summary-card-button-text': 'rgba(251, 252, 255, 0.92)',
        '--app-glass': 'rgba(21, 27, 48, 0.82)',
        '--app-glass-strong': 'rgba(14, 19, 36, 0.88)',
        '--app-glass-border': 'rgba(122, 146, 255, 0.14)',
        '--app-overlay': 'rgba(0, 0, 0, 0.42)'
      }
    }
  },
  [THEME_IDS.jade]: {
    id: THEME_IDS.jade,
    label: '翡翠丝绒',
    description: '玉石绿和丝绒质感的陈列主题，支持浅色、深色和跟随系统。',
    defaultAppearance: 'light',
    supportsAppearanceControl: true,
    preview: ['#f7fffb', '#cfe9dc', '#1f8a68'],
    appearances: {
      light: {
        '--app-bg': '#edf7f1',
        '--app-bg-gradient': 'linear-gradient(180deg, #f1faf5 0%, #d7ecdf 56%, #c4e1d2 100%)',
        '--app-surface': '#fbfffc',
        '--app-surface-soft': '#d0e7da',
        '--app-surface-muted': '#e2f0e8',
        '--app-text': '#173028',
        '--app-text-secondary': '#4a6f61',
        '--app-text-tertiary': '#729686',
        '--app-placeholder': '#89ac9c',
        '--app-border': 'rgba(26, 93, 70, 0.10)',
        '--app-shadow': '0 14px 30px rgba(32, 98, 75, 0.10)',
        '--summary-card-gradient': 'linear-gradient(145deg, #165341 0%, #1f8a68 52%, #73c2a6 100%)',
        '--summary-card-orb': 'rgba(241, 255, 249, 0.22)',
        '--summary-card-text': '#f9fffc',
        '--summary-card-label': 'rgba(249, 255, 252, 0.72)',
        '--summary-card-button-bg': 'rgba(249, 255, 252, 0.14)',
        '--summary-card-button-border': 'rgba(249, 255, 252, 0.22)',
        '--summary-card-button-text': 'rgba(249, 255, 252, 0.94)',
        '--app-glass': 'rgba(251, 255, 252, 0.84)',
        '--app-glass-strong': 'rgba(236, 248, 241, 0.78)',
        '--app-glass-border': 'rgba(255, 255, 255, 0.52)',
        '--app-overlay': 'rgba(23, 48, 40, 0.18)'
      },
      dark: {
        '--app-bg': '#0d1714',
        '--app-bg-gradient': 'linear-gradient(180deg, #07100d 0%, #11201c 48%, #173028 100%)',
        '--app-surface': '#142521',
        '--app-surface-soft': '#21453a',
        '--app-surface-muted': '#19322b',
        '--app-text': '#eefaf4',
        '--app-text-secondary': '#b4d5c6',
        '--app-text-tertiary': '#73998a',
        '--app-placeholder': '#5f8375',
        '--app-border': 'rgba(84, 190, 150, 0.14)',
        '--app-shadow': '0 16px 34px rgba(0, 0, 0, 0.44)',
        '--summary-card-gradient': 'linear-gradient(145deg, #0f3b2f 0%, #1f8a68 52%, #73c2a6 100%)',
        '--summary-card-orb': 'rgba(240, 255, 248, 0.14)',
        '--summary-card-text': '#f6fffb',
        '--summary-card-label': 'rgba(246, 255, 251, 0.72)',
        '--summary-card-button-bg': 'rgba(246, 255, 251, 0.10)',
        '--summary-card-button-border': 'rgba(246, 255, 251, 0.18)',
        '--summary-card-button-text': 'rgba(246, 255, 251, 0.92)',
        '--app-glass': 'rgba(20, 37, 33, 0.82)',
        '--app-glass-strong': 'rgba(12, 24, 21, 0.88)',
        '--app-glass-border': 'rgba(117, 194, 166, 0.14)',
        '--app-overlay': 'rgba(0, 0, 0, 0.4)'
      }
    }
  },
  [THEME_IDS.gilded]: {
    id: THEME_IDS.gilded,
    label: '鎏金典藏',
    description: '月白纸签到夜宴金饰的一体化典藏主题，支持浅色、深色和跟随系统。',
    defaultAppearance: 'light',
    supportsAppearanceControl: true,
    preview: ['#fffdf7', '#efe7d6', '#c29b4b'],
    appearances: {
      light: {
        '--app-bg': '#f6f2e8',
        '--app-bg-gradient': 'linear-gradient(180deg, #f9f6ee 0%, #ebe3d2 58%, #ded2bc 100%)',
        '--app-surface': '#fffdf8',
        '--app-surface-soft': '#efe7d8',
        '--app-surface-muted': '#f5efe3',
        '--app-text': '#2b2418',
        '--app-text-secondary': '#70624b',
        '--app-text-tertiary': '#9c8a6b',
        '--app-placeholder': '#b3a285',
        '--app-border': 'rgba(124, 96, 42, 0.10)',
        '--app-shadow': '0 12px 28px rgba(103, 80, 39, 0.08)',
        '--summary-card-gradient': 'linear-gradient(145deg, #8b6b31 0%, #c29b4b 52%, #e2c983 100%)',
        '--summary-card-orb': 'rgba(255, 250, 238, 0.22)',
        '--summary-card-text': '#fffdf8',
        '--summary-card-label': 'rgba(255, 253, 248, 0.74)',
        '--summary-card-button-bg': 'rgba(255, 253, 248, 0.14)',
        '--summary-card-button-border': 'rgba(255, 253, 248, 0.22)',
        '--summary-card-button-text': 'rgba(255, 253, 248, 0.94)',
        '--app-glass': 'rgba(255, 253, 248, 0.84)',
        '--app-glass-strong': 'rgba(248, 242, 228, 0.78)',
        '--app-glass-border': 'rgba(255, 255, 255, 0.52)',
        '--app-overlay': 'rgba(43, 36, 24, 0.16)'
      },
      dark: {
        '--app-bg': '#140d11',
        '--app-bg-gradient': 'linear-gradient(180deg, #090507 0%, #1a0f14 48%, #24141b 100%)',
        '--app-surface': '#1d1218',
        '--app-surface-soft': '#3a1b27',
        '--app-surface-muted': '#29171f',
        '--app-text': '#f8ebd2',
        '--app-text-secondary': '#d5b88a',
        '--app-text-tertiary': '#9e7f53',
        '--app-placeholder': '#80684a',
        '--app-border': 'rgba(210, 170, 87, 0.14)',
        '--app-shadow': '0 16px 36px rgba(0, 0, 0, 0.56)',
        '--summary-card-gradient': 'linear-gradient(145deg, #2a0e16 0%, #6f1f31 52%, #d2aa57 100%)',
        '--summary-card-orb': 'rgba(255, 231, 190, 0.16)',
        '--summary-card-text': '#fff5e2',
        '--summary-card-label': 'rgba(255, 245, 226, 0.72)',
        '--summary-card-button-bg': 'rgba(255, 245, 226, 0.10)',
        '--summary-card-button-border': 'rgba(210, 170, 87, 0.24)',
        '--summary-card-button-text': 'rgba(255, 245, 226, 0.94)',
        '--app-glass': 'rgba(30, 16, 23, 0.84)',
        '--app-glass-strong': 'rgba(20, 10, 15, 0.9)',
        '--app-glass-border': 'rgba(210, 170, 87, 0.12)',
        '--app-overlay': 'rgba(0, 0, 0, 0.5)'
      }
    }
  },
  [THEME_IDS.idol]: {
    id: THEME_IDS.idol,
    label: '星彩应援',
    description: '高饱和的偶像应援风格，带一点霓虹灯和舞台灯牌的感觉，固定浅色外观。',
    defaultAppearance: 'light',
    supportsAppearanceControl: false,
    preview: ['#fff8ff', '#e2d2ff', '#ff4fc6'],
    appearances: {
      light: {
        '--app-bg': '#f8f0ff',
        '--app-bg-gradient': 'linear-gradient(180deg, #fbf4ff 0%, #e5d7ff 45%, #ffd7f1 100%)',
        '--app-surface': '#fffaff',
        '--app-surface-soft': '#ecdfff',
        '--app-surface-muted': '#f5ebff',
        '--app-text': '#29153d',
        '--app-text-secondary': '#70479e',
        '--app-text-tertiary': '#a06fcd',
        '--app-placeholder': '#bc92df',
        '--app-border': 'rgba(118, 60, 184, 0.12)',
        '--app-shadow': '0 14px 34px rgba(154, 76, 220, 0.14)',
        '--summary-card-gradient': 'linear-gradient(145deg, #6c2ccf 0%, #ff4fc6 55%, #7c83ff 100%)',
        '--summary-card-orb': 'rgba(255, 243, 255, 0.24)',
        '--summary-card-text': '#fffaff',
        '--summary-card-label': 'rgba(255, 250, 255, 0.74)',
        '--summary-card-button-bg': 'rgba(255, 250, 255, 0.14)',
        '--summary-card-button-border': 'rgba(255, 250, 255, 0.24)',
        '--summary-card-button-text': 'rgba(255, 250, 255, 0.96)',
        '--app-glass': 'rgba(255, 250, 255, 0.84)',
        '--app-glass-strong': 'rgba(244, 234, 255, 0.78)',
        '--app-glass-border': 'rgba(255, 255, 255, 0.54)',
        '--app-overlay': 'rgba(41, 21, 61, 0.18)'
      }
    }
  },
  [THEME_IDS.mint]: {
    id: THEME_IDS.mint,
    label: '海盐薄荷',
    description: '更轻的海盐薄荷配色，清爽但仍保留卡片层次，固定浅色外观。',
    defaultAppearance: 'light',
    supportsAppearanceControl: false,
    preview: ['#fcfffd', '#dcece5', '#2e8b73'],
    appearances: {
      light: {
        '--app-bg': '#eef6f2',
        '--app-bg-gradient': 'linear-gradient(180deg, #eff7f4 0%, #ddeae4 100%)',
        '--app-surface': '#fcfffd',
        '--app-surface-soft': '#dcece5',
        '--app-surface-muted': '#e4f0eb',
        '--app-text': '#183129',
        '--app-text-secondary': '#567268',
        '--app-text-tertiary': '#7c9b90',
        '--app-placeholder': '#91aca2',
        '--app-border': 'rgba(24, 49, 41, 0.08)',
        '--app-shadow': '0 10px 28px rgba(24, 49, 41, 0.07)',
        '--summary-card-gradient': 'linear-gradient(145deg, #1b6457 0%, #2e8b73 52%, #72bfa7 100%)',
        '--summary-card-orb': 'rgba(240, 255, 249, 0.18)',
        '--summary-card-text': '#f8fffc',
        '--summary-card-label': 'rgba(248, 255, 252, 0.68)',
        '--summary-card-button-bg': 'rgba(248, 255, 252, 0.12)',
        '--summary-card-button-border': 'rgba(248, 255, 252, 0.18)',
        '--summary-card-button-text': 'rgba(248, 255, 252, 0.9)',
        '--app-glass': 'rgba(252, 255, 253, 0.84)',
        '--app-glass-strong': 'rgba(238, 248, 242, 0.78)',
        '--app-glass-border': 'rgba(255, 255, 255, 0.48)',
        '--app-overlay': 'rgba(16, 39, 33, 0.18)'
      }
    }
  },
  [THEME_IDS.vinyl]: {
    id: THEME_IDS.vinyl,
    label: '黑胶夜色',
    description: '更偏黑胶封套和黄铜灯光的夜色风格，固定深色外观。',
    defaultAppearance: 'dark',
    supportsAppearanceControl: false,
    preview: ['#15111a', '#2b2033', '#c7a56a'],
    appearances: {
      dark: {
        '--app-bg': '#120f16',
        '--app-bg-gradient': 'linear-gradient(180deg, #09070d 0%, #17111b 45%, #1d1721 100%)',
        '--app-surface': '#1a151d',
        '--app-surface-soft': '#2b2033',
        '--app-surface-muted': '#231b29',
        '--app-text': '#f5e7d1',
        '--app-text-secondary': '#cfb792',
        '--app-text-tertiary': '#8f795e',
        '--app-placeholder': '#776958',
        '--app-border': 'rgba(199, 165, 106, 0.14)',
        '--app-shadow': '0 14px 34px rgba(0, 0, 0, 0.54)',
        '--summary-card-gradient': 'linear-gradient(145deg, #17101d 0%, #392338 52%, #a06f34 100%)',
        '--summary-card-orb': 'rgba(255, 228, 189, 0.16)',
        '--summary-card-text': '#fff3e1',
        '--summary-card-label': 'rgba(255, 243, 225, 0.68)',
        '--summary-card-button-bg': 'rgba(255, 243, 225, 0.10)',
        '--summary-card-button-border': 'rgba(199, 165, 106, 0.24)',
        '--summary-card-button-text': 'rgba(255, 243, 225, 0.92)',
        '--app-glass': 'rgba(28, 20, 33, 0.84)',
        '--app-glass-strong': 'rgba(18, 12, 21, 0.9)',
        '--app-glass-border': 'rgba(199, 165, 106, 0.12)',
        '--app-overlay': 'rgba(0, 0, 0, 0.5)'
      }
    }
  },
  [THEME_IDS.terracotta]: {
    id: THEME_IDS.terracotta,
    label: '赤陶档案',
    description: '更像陈列记录册的赤陶档案风格，固定浅色外观。',
    defaultAppearance: 'light',
    supportsAppearanceControl: false,
    preview: ['#fff6f1', '#efd9ce', '#b25b45'],
    appearances: {
      light: {
        '--app-bg': '#f7ebe5',
        '--app-bg-gradient': 'linear-gradient(180deg, #f9efe9 0%, #ecd8ce 100%)',
        '--app-surface': '#fff6f1',
        '--app-surface-soft': '#efd9ce',
        '--app-surface-muted': '#f4e3da',
        '--app-text': '#2b1f1b',
        '--app-text-secondary': '#705851',
        '--app-text-tertiary': '#9c7f75',
        '--app-placeholder': '#b1958a',
        '--app-border': 'rgba(92, 54, 42, 0.08)',
        '--app-shadow': '0 10px 28px rgba(95, 61, 49, 0.08)',
        '--summary-card-gradient': 'linear-gradient(145deg, #8b4f3d 0%, #b25b45 52%, #d38a70 100%)',
        '--summary-card-orb': 'rgba(255, 244, 239, 0.18)',
        '--summary-card-text': '#fff8f5',
        '--summary-card-label': 'rgba(255, 248, 245, 0.7)',
        '--summary-card-button-bg': 'rgba(255, 248, 245, 0.12)',
        '--summary-card-button-border': 'rgba(255, 248, 245, 0.18)',
        '--summary-card-button-text': 'rgba(255, 248, 245, 0.92)',
        '--app-glass': 'rgba(255, 246, 241, 0.84)',
        '--app-glass-strong': 'rgba(249, 234, 225, 0.76)',
        '--app-glass-border': 'rgba(255, 246, 241, 0.52)',
        '--app-overlay': 'rgba(43, 31, 27, 0.2)'
      }
    }
  }
}

export const THEME_OPTIONS = [
  THEME_DEFINITIONS[THEME_IDS.mist],
  THEME_DEFINITIONS[THEME_IDS.paper],
  THEME_DEFINITIONS[THEME_IDS.mint],
  THEME_DEFINITIONS[THEME_IDS.vinyl],
  THEME_DEFINITIONS[THEME_IDS.terracotta],
  THEME_DEFINITIONS[THEME_IDS.pink],
  THEME_DEFINITIONS[THEME_IDS.ember],
  THEME_DEFINITIONS[THEME_IDS.cobalt],
  THEME_DEFINITIONS[THEME_IDS.jade],
  THEME_DEFINITIONS[THEME_IDS.gilded],
  THEME_DEFINITIONS[THEME_IDS.idol]
]

export function getThemeDefinition(themeId) {
  return THEME_DEFINITIONS[themeId] || THEME_DEFINITIONS[THEME_IDS.mist]
}

export function getThemeAppearance(themeDefinition, requestedAppearance) {
  if (themeDefinition.appearances[requestedAppearance]) {
    return requestedAppearance
  }

  if (themeDefinition.defaultAppearance && themeDefinition.appearances[themeDefinition.defaultAppearance]) {
    return themeDefinition.defaultAppearance
  }

  return Object.keys(themeDefinition.appearances)[0] || 'light'
}

export function themeSupportsAppearanceControl(themeDefinition) {
  return Boolean(themeDefinition?.supportsAppearanceControl)
}
