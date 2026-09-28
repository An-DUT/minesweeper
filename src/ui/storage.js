/**
 * localStorage 读写封装（specs/02-functional.md 持久化键）
 *
 * 所有访问都做异常兜底：无痕模式、配额超限、被禁用、数据损坏
 * 都不能让游戏崩掉，最差情况退化为「不持久化」。
 */

import { STORAGE_KEYS } from '../core/constants.js';

/** 探测 localStorage 是否真正可用（Safari 无痕下 setItem 会抛错） */
function probeStorage() {
  try {
    const key = '__minesweeper_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = typeof window === 'undefined' ? null : probeStorage();

/** 读取 JSON 对象；失败返回兜底值 */
function readJson(key, fallback) {
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readString(key, fallback) {
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    return raw === null ? fallback : raw;
  } catch {
    return fallback;
  }
}

function writeString(key, value) {
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export const storage = {
  /** 是否可用（不可用时 UI 可以隐藏「最高分」相关提示） */
  get available() {
    return store !== null;
  },

  /** 读取全部最高分：{ [difficultyKey]: seconds } */
  loadBestTimes() {
    const raw = readJson(STORAGE_KEYS.BEST_TIMES, {});
    /** 只保留正整数值，剔除脏数据 */
    const clean = {};
    for (const [key, value] of Object.entries(raw)) {
      if (Number.isInteger(value) && value > 0) clean[key] = value;
    }
    return clean;
  },

  /** 读取某难度的最高分（无记录返回 null） */
  getBestTime(key) {
    const all = this.loadBestTimes();
    return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
  },

  /**
   * 提交成绩。仅在严格更快（或首次）时写入。
   * @returns {{updated: boolean, best: number, previous: number|null}}
   */
  submitTime(key, seconds) {
    const all = this.loadBestTimes();
    const previous = Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
    const better = previous === null || seconds < previous;
    if (better && Number.isFinite(seconds) && seconds >= 0) {
      all[key] = seconds;
      writeJson(STORAGE_KEYS.BEST_TIMES, all);
      return { updated: true, best: seconds, previous };
    }
    return { updated: false, best: previous ?? seconds, previous };
  },

  loadTheme() {
    const value = readString(STORAGE_KEYS.THEME, '');
    return value === 'dark' || value === 'light' ? value : null;
  },

  saveTheme(theme) {
    return writeString(STORAGE_KEYS.THEME, theme);
  },

  loadDifficulty() {
    return readString(STORAGE_KEYS.DIFFICULTY, '');
  },

  saveDifficulty(key) {
    return writeString(STORAGE_KEYS.DIFFICULTY, key);
  },
};
