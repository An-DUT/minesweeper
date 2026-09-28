/**
 * 常量与枚举（specs/06-design.md §6.1）
 * 纯数据模块：不依赖 DOM、不依赖其他模块。
 */

/** 格子状态枚举 */
export const CellState = Object.freeze({
  HIDDEN: 'hidden',
  FLAGGED: 'flagged',
  QUESTION: 'question',
  REVEALED: 'revealed',
});

/** 游戏状态枚举 */
export const GameStatus = Object.freeze({
  READY: 'ready',
  PLAYING: 'playing',
  WON: 'won',
  LOST: 'lost',
});

/** 右键标记的三态循环：hidden → flagged → question → hidden */
export const FLAG_CYCLE = Object.freeze([
  CellState.FLAGGED,
  CellState.QUESTION,
  CellState.HIDDEN,
]);

/** 经典难度预设 */
export const PRESETS = Object.freeze({
  beginner: Object.freeze({ key: 'beginner', label: '初级', rows: 9, cols: 9, mines: 10 }),
  intermediate: Object.freeze({ key: 'intermediate', label: '中级', rows: 16, cols: 16, mines: 40 }),
  expert: Object.freeze({ key: 'expert', label: '高级', rows: 16, cols: 30, mines: 99 }),
});

/** 自定义难度的取值范围（FR-12） */
export const LIMITS = Object.freeze({
  rows: Object.freeze({ min: 5, max: 40 }),
  cols: Object.freeze({ min: 5, max: 40 }),
  /** 雷数下限固定为 1；上限为 行×列 − 9（保证首点安全用），但至少允许 行×列 − 1 */
  minMines: 1,
});

/** 计时器显示上限 */
export const TIMER_MAX = 999;

/** 8 邻域偏移 */
export const NEIGHBOR_OFFSETS = Object.freeze([
  Object.freeze([-1, -1]), Object.freeze([-1, 0]), Object.freeze([-1, 1]),
  Object.freeze([0, -1]), Object.freeze([0, 1]),
  Object.freeze([1, -1]), Object.freeze([1, 0]), Object.freeze([1, 1]),
]);

/** localStorage 键名 */
export const STORAGE_KEYS = Object.freeze({
  BEST_TIMES: 'minesweeper:bestTimes',
  THEME: 'minesweeper:theme',
  DIFFICULTY: 'minesweeper:difficulty',
});

/**
 * 计算某难度下的雷数上限。
 * 优先保证首点安全所需的 9 格排除集；板面过小时退化为 行×列 − 1（A2 降级链）。
 */
export function maxMines(rows, cols) {
  const total = rows * cols;
  return Math.max(1, total >= 10 ? total - 9 : total - 1);
}

/** 把难度描述符规范化，并钳制雷数到合法区间 */
export function normalizeDifficulty({ key, label, rows, cols, mines }) {
  const r = clamp(rows, LIMITS.rows.min, LIMITS.rows.max);
  const c = clamp(cols, LIMITS.cols.min, LIMITS.cols.max);
  const m = clamp(mines, LIMITS.minMines, maxMines(r, c));
  return Object.freeze({
    key: key ?? `custom:${r}x${c}x${m}`,
    label: label ?? `自定义 ${r}×${c}/${m}`,
    rows: r,
    cols: c,
    mines: m,
    /** mines 是否被钳制过（用于 UI 提示，A2） */
    clamped: m !== mines,
  });
}

/** 数值钳制 */
export function clamp(value, min, max) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
