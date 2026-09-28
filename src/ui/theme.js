/**
 * 主题（FR-14）
 * 优先级：localStorage 显式选择 > 系统 prefers-color-scheme
 */

import { storage } from './storage.js';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export class Theme {
  /** @param {(theme: string) => void} onChange */
  constructor(onChange) {
    this.onChange = onChange;
    this.media = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(DARK_QUERY)
      : null;
    this.explicit = storage.loadTheme();
  }

  /** 当前生效的主题 */
  get current() {
    if (this.explicit) return this.explicit;
    return this.media && this.media.matches ? 'dark' : 'light';
  }

  /** 是否由用户显式指定 */
  get isExplicit() {
    return this.explicit !== null;
  }

  /** 应用主题到文档并广播 */
  apply() {
    const theme = this.current;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    this.onChange(theme);
    return theme;
  }

  /** 手动切换并持久化 */
  toggle() {
    this.explicit = this.current === 'dark' ? 'light' : 'dark';
    storage.saveTheme(this.explicit);
    return this.apply();
  }

  /** 跟随系统变化（仅在用户未显式选择时生效） */
  watchSystem() {
    if (!this.media) return () => {};
    const handler = () => {
      if (!this.explicit) this.apply();
    };
    this.media.addEventListener('change', handler);
    return () => this.media.removeEventListener('change', handler);
  }
}
