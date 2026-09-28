/**
 * 应用组装层（T8/T9/T10 的接线）
 * 依赖方向：ui/app.js → ui/* → core/*，绝不反向。
 */

import { GameStatus, PRESETS, TIMER_MAX, maxMines, normalizeDifficulty } from '../core/constants.js';
import { createGame } from '../core/game.js';
import { Renderer } from './render.js';
import { attachInput } from './input.js';
import { Timer } from './timer.js';
import { Theme } from './theme.js';
import { storage } from './storage.js';

const DEFAULT_KEY = 'beginner';

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺少必需的 DOM 元素：#${id}`);
  return el;
}

function collectElements() {
  return {
    grid: byId('grid'),
    board: byId('board'),
    mineCount: byId('mine-count'),
    timer: byId('timer'),
    status: byId('status'),
    progress: byId('progress'),
    remainingMines: byId('remaining-mines'),
    face: byId('face'),
    restart: byId('restart'),
    difficultyButtons: byId('difficulty-buttons'),
    customRows: byId('custom-rows'),
    customCols: byId('custom-cols'),
    customMines: byId('custom-mines'),
    customApply: byId('custom-apply'),
    customNote: byId('custom-note'),
    message: byId('message'),
    themeToggle: byId('theme-toggle'),
    bestTime: byId('best-time'),
    storageNote: byId('storage-note'),
  };
}

export function createApp() {
  const el = collectElements();

  /** 动态状态集中在 app 内，渲染层保持无状态 */
  const state = {
    seconds: 0,
    /** 终局或破纪录提示；'' 表示不显示 */
    message: '',
    lastBestTime: null,
  };

  const timer = new Timer((seconds) => {
    state.seconds = seconds;
    renderer.renderStatus(game.snapshot(), state.seconds);
  });

  const renderer = new Renderer(el, null);

  const theme = new Theme((current) => {
    const isDark = current === 'dark';
    el.themeToggle.textContent = isDark ? '☀️ 浅色' : '🌙 深色';
    el.themeToggle.setAttribute('aria-pressed', String(isDark));
    el.themeToggle.setAttribute('aria-label', isDark ? '切换到浅色模式' : '切换到深色模式');
  });

  // ── 难度 ──────────────────────────────────────────────
  const difficulties = new Map(Object.entries(PRESETS));
  let activeKey = DEFAULT_KEY;
  let game = createGame(normalizeDifficulty(PRESETS[DEFAULT_KEY]));

  // ── 渲染与同步 ────────────────────────────────────────
  function syncStatus() {
    renderer.renderStatus(game.snapshot(), state.seconds);
    renderBestTime();
    syncMessage();
  }

  function renderBestTime() {
    const best = storage.getBestTime(activeKey);
    el.bestTime.textContent = best === null ? '—' : `${best} 秒`;
  }

  function syncMessage() {
    const text = state.message;
    if (el.message.textContent !== text) el.message.textContent = text;
    el.message.hidden = text === '';
  }

  function renderBoardFull() {
    renderer.renderBoard(game);
    syncStatus();
    syncActiveButton();
  }

  function syncActiveButton() {
    for (const btn of el.difficultyButtons.querySelectorAll('button[data-difficulty]')) {
      const isActive = btn.dataset.difficulty === activeKey;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    }
  }

  /** 计时开关：首点后开始，终局停止 */
  function syncTimerState() {
    if (game.isTiming && !timer.isRunning) timer.start();
    else if (!game.isTiming && timer.isRunning) timer.stop();
  }

  // ── 操作入口 ──────────────────────────────────────────
  function applyMove(action) {
    if (game.isOver) return;

    // 玩家主动操作时清掉上一局的提示
    if (state.message !== '') {
      state.message = '';
      syncMessage();
    }

    action();
    syncTimerState();
    renderer.renderBoard(game);
    syncStatus();

    if (game.isWon) handleWin();
    else if (game.isLost) handleLose();
  }

  function handleWin() {
    const seconds = timer.stop();
    // 极快取胜（不足 1 秒）时记录值不能为 0：0 会被存储层当作脏数据剔除，
    // 导致纪录「写进去又消失」。最低记为 1 秒（与经典扫雷显示下限一致）。
    const recorded = Math.max(1, seconds);
    const result = storage.submitTime(activeKey, recorded);
    state.message = `🎉 扫雷成功！用时 ${recorded} 秒`;
    if (result.updated && result.previous !== null) {
      state.message += `，刷新最高纪录（原 ${result.previous} 秒）`;
    } else if (!result.updated && result.best) {
      state.message += `，最高纪录 ${result.best} 秒`;
    }
    renderBestTime();
    syncMessage();
    renderer.renderBoard(game);
  }

  function handleLose() {
    timer.stop();
    state.message = '💥 踩到雷了，按重开或点击笑脸再来一局。';
    syncMessage();
    renderer.renderBoard(game);
  }

  const moveHandlers = {
    onReveal(index) {
      applyMove(() => game.revealCell(index));
    },
    onFlag(index) {
      applyMove(() => game.toggleFlag(index));
    },
    onChord(index) {
      applyMove(() => game.chord(index));
    },
  };

  attachInput(el, renderer, moveHandlers);

  // ── 重开 ──────────────────────────────────────────────
  /**
   * 重开当前对局。
   * @param {object} [difficulty] 传入时改为在该难度上重开（UI 与调试均可用）
   */
  function restart(difficulty) {
    if (difficulty && typeof difficulty === 'object' && difficulty.rows) {
      startDifficulty(difficulty.key ?? activeKey, difficulty);
      return;
    }
    timer.reset();
    state.seconds = 0;
    state.message = '';
    game.reset();
    renderer.resetFocus();
    renderBoardFull();
  }

  // 注意：必须用箭头函数包一层，否则事件对象会被当成 difficulty 传入
  el.restart.addEventListener('click', () => restart());
  el.face.addEventListener('click', () => restart());

  // ── 难度切换 ──────────────────────────────────────────
  function startDifficulty(key, difficulty) {
    activeKey = key;
    timer.reset();
    state.seconds = 0;
    state.message = '';
    game = createGame(normalizeDifficulty(difficulty));
    storage.saveDifficulty(key);
    renderer.resetFocus();
    renderBoardFull();
  }

  el.difficultyButtons.addEventListener('click', (event) => {
    const btn = event.target instanceof Element
      ? event.target.closest('button[data-difficulty]')
      : null;
    if (!btn) return;
    const difficulty = difficulties.get(btn.dataset.difficulty);
    if (!difficulty) return;
    startDifficulty(difficulty.key, difficulty);
  });

  // ── 自定义难度 ────────────────────────────────────────
  function readCustomDifficulty() {
    const rows = Number(el.customRows.value);
    const cols = Number(el.customCols.value);
    const mines = Number(el.customMines.value);
    const limit = maxMines(rows, cols);
    if (mines > limit) {
      return {
        error: `行×列 ${rows}×${cols} 时雷数最多 ${limit} 个（需为首点留出安全区），已按 ${limit} 处理。`,
        difficulty: normalizeDifficulty({
          key: `custom:${rows}x${cols}x${limit}`,
          label: `自定义 ${rows}×${cols}/${limit}`,
          rows,
          cols,
          mines: limit,
        }),
      };
    }
    const normalized = normalizeDifficulty({
      key: `custom:${rows}x${cols}x${mines}`,
      label: `自定义 ${rows}×${cols}/${mines}`,
      rows,
      cols,
      mines,
    });
    return { error: '', difficulty: normalized };
  }

  el.customApply.addEventListener('click', () => {
    const { error, difficulty } = readCustomDifficulty();
    el.customNote.textContent = error;
    startDifficulty(difficulty.key, difficulty);
    el.customNote.textContent = error; // startDifficulty 不触碰 note
  });

  // 输入框变化时提示将采用的合法值
  const syncCustomNote = () => {
    const rows = Number(el.customRows.value);
    const cols = Number(el.customCols.value);
    const limit = maxMines(rows, cols);
    el.customMines.max = String(limit);
    el.customNote.textContent = `行/列 5–40，雷数 1–${limit}`;
  };
  for (const input of [el.customRows, el.customCols, el.customMines]) {
    input.addEventListener('input', syncCustomNote);
  }

  // ── 主题 ──────────────────────────────────────────────
  el.themeToggle.addEventListener('click', () => theme.toggle());

  // ── 初始化 ────────────────────────────────────────────
  function init() {
    theme.apply();
    theme.watchSystem();

    if (!storage.available) {
      el.storageNote.hidden = false;
      el.storageNote.textContent = '当前浏览器禁用了本地存储，最高分与主题偏好不会被保存。';
    }

    const savedKey = storage.loadDifficulty();
    if (savedKey && difficulties.has(savedKey)) activeKey = savedKey;
    else activeKey = DEFAULT_KEY;
    if (difficulties.has(activeKey)) {
      game = createGame(normalizeDifficulty(difficulties.get(activeKey)));
    }

    syncCustomNote();
    renderBoardFull();
    syncTimerState();

    // 调试句柄（仅供开发与自动化验证使用）
    window.__minesweeper = {
      get game() { return game; },
      get renderer() { return renderer; },
      get timer() { return timer; },
      get state() { return state; },
      restart,
      startDifficulty,
      TIMER_MAX,
    };
  }

  init();
  return { restart, startDifficulty, getGame: () => game };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => createApp());
  } else {
    createApp();
  }
}
