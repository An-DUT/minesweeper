/**
 * DOM 差量渲染（specs/03-technical.md 渲染契约）
 *
 * 契约：每个格子都是 <button class="cell" data-index data-r data-c data-state data-neighbors>，
 * data-state ∈ {hidden, flagged, question, revealed}。
 * 渲染层只做「读逻辑状态 → 同步 class / data 属性」的差量更新，绝不重建整块网格。
 */

import { CellState, GameStatus } from '../core/constants.js';

const STATE_CLASSES = ['is-hidden', 'is-flagged', 'is-question', 'is-revealed'];
const MINE_CLASS = 'is-mine';
const EXPLODED_CLASS = 'is-exploded';
const WRONG_FLAG_CLASS = 'is-wrong-flag';

/** 数字 1–8 的中文无障碍标签（避免只读数字） */
const NUMBER_LABELS = ['', '一', '二', '三', '四', '五', '六', '七', '八'];

export class Renderer {
  /**
   * @param {object} elements 由 index.html 提供的元素集合
   * @param {(index: number) => void} onCellActivate 键盘/点击激活回调
   */
  constructor(elements, onCellActivate) {
    this.el = elements;
    this.onCellActivate = onCellActivate;
    /** index → HTMLButtonElement */
    this.cellEls = [];
    /** 已渲染的尺寸，用于判断是否需要重建网格 */
    this.renderedRows = 0;
    this.renderedCols = 0;
    /** 上一次渲染的锚点，用于 focus 恢复 */
    this.focusIndex = 0;
  }

  /** 按需创建网格 DOM；尺寸变化时重建 */
  ensureGrid(rows, cols) {
    if (this.renderedRows === rows && this.renderedCols === cols && this.cellEls.length === rows * cols) {
      return false;
    }

    const grid = this.el.grid;
    grid.textContent = '';
    grid.style.setProperty('--cols', String(cols));
    grid.style.setProperty('--rows', String(rows));
    this.cellEls = new Array(rows * cols);

    const frag = document.createDocumentFragment();
    for (let i = 0; i < rows * cols; i += 1) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cell is-hidden';
      btn.dataset.index = String(i);
      btn.dataset.r = String(r);
      btn.dataset.c = String(c);
      btn.dataset.state = CellState.HIDDEN;
      btn.dataset.neighbors = '0';
      btn.tabIndex = i === 0 ? 0 : -1; // roving tabindex
      btn.setAttribute('aria-label', `第 ${r + 1} 行第 ${c + 1} 列，未翻开`);
      frag.appendChild(btn);
      this.cellEls[i] = btn;
    }
    grid.appendChild(frag);

    this.renderedRows = rows;
    this.renderedCols = cols;
    return true;
  }

  /** 全量同步一次棋盘状态（差量：只在值变化时写 DOM） */
  renderBoard(game) {
    const board = game.board;
    this.ensureGrid(board.rows, board.cols);

    const over = board.status === GameStatus.WON || board.status === GameStatus.LOST;

    for (let i = 0; i < board.cells.length; i += 1) {
      const cell = board.cells[i];
      const el = this.cellEls[i];
      const revealed = cell.state === CellState.REVEALED;

      // data-state
      if (el.dataset.state !== cell.state) {
        el.dataset.state = cell.state;
        el.classList.remove(...STATE_CLASSES);
        el.classList.add(`is-${cell.state}`);
      }

      // data-neighbors 与数字文本
      const neighbors = revealed && !cell.mine ? cell.neighbors : 0;
      const neighborsStr = String(board.cells[i].neighbors);
      if (el.dataset.neighbors !== neighborsStr) el.dataset.neighbors = neighborsStr;
      const text = revealed && !cell.mine && cell.neighbors > 0 ? String(cell.neighbors) : '';
      if (el.textContent !== text) el.textContent = text;

      // 终局揭示：所有雷显示，错误旗标红
      const showMine = over && cell.mine;
      el.classList.toggle(MINE_CLASS, showMine);
      const wrongFlag = over && cell.state === CellState.FLAGGED && !cell.mine;
      el.classList.toggle(WRONG_FLAG_CLASS, wrongFlag);
      el.classList.toggle(EXPLODED_CLASS, over && i === board.explodedIndex);

      // 无障碍标签与环境属性
      const label = describeCell(cell, i, board, over);
      if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
      if (el.getAttribute('aria-disabled') !== String(over)) {
        el.setAttribute('aria-disabled', String(over));
      }
      el.tabIndex = i === this.focusIndex ? 0 : -1;
    }
  }

  /** 重置网格（重开/换难度时调用），保证焦点锚点回到首格 */
  resetFocus() {
    this.focusIndex = 0;
  }

  /** 同步顶部状态栏：剩余雷数、计时、进度、状态提示 */
  renderStatus(snapshot, seconds) {
    const { el } = this;
    const remaining = snapshot.remainingMines;
    const remainingText = remaining < 0 ? `-${Math.abs(remaining)}` : String(remaining);
    if (el.mineCount.textContent !== remainingText) el.mineCount.textContent = remainingText;

    const timeText = String(Math.min(999, seconds)).padStart(3, '0');
    if (el.timer.textContent !== timeText) el.timer.textContent = timeText;

    const statusText = describeStatus(snapshot);
    if (el.status.textContent !== statusText) el.status.textContent = statusText;

    el.remainingMines.dataset.negative = String(remaining < 0);

    const progressText = `${snapshot.progress.revealed}/${snapshot.progress.total}`;
    if (el.progress.textContent !== progressText) el.progress.textContent = progressText;

    // 表情按钮：反映当前局面
    const face = snapshot.status === GameStatus.WON ? '😎'
      : snapshot.status === GameStatus.LOST ? '😵'
        : '🙂';
    if (el.face.textContent !== face) el.face.textContent = face;
    const faceLabel = snapshot.status === GameStatus.WON ? '已胜利，点击重开'
      : snapshot.status === GameStatus.LOST ? '已失败，点击重开'
        : '重新开始';
    if (el.face.getAttribute('aria-label') !== faceLabel) el.face.setAttribute('aria-label', faceLabel);

    el.board.dataset.status = snapshot.status;
  }

  /** 移动焦点到指定格（键盘导航用） */
  focusCell(index) {
    const el = this.cellEls[index];
    if (!el) return;
    this.focusIndex = index;
    for (let i = 0; i < this.cellEls.length; i += 1) {
      this.cellEls[i].tabIndex = i === index ? 0 : -1;
    }
    el.focus({ preventScroll: true });
  }

  /** 依据 data-index 找到格子下标（事件委托用） */
  indexFromEvent(event) {
    const target = event.target instanceof Element ? event.target.closest('.cell') : null;
    if (!target || !this.el.grid.contains(target)) return -1;
    const index = Number(target.dataset.index);
    return Number.isInteger(index) ? index : -1;
  }
}

/** 生成格子的无障碍描述 */
function describeCell(cell, index, board, over) {
  const r = Math.floor(index / board.cols) + 1;
  const c = (index % board.cols) + 1;
  const pos = `第 ${r} 行第 ${c} 列`;
  if (cell.state === CellState.FLAGGED) {
    if (over && !cell.mine) return `${pos}，错误的旗标`;
    return `${pos}，已插旗`;
  }
  if (cell.state === CellState.QUESTION) return `${pos}，问号标记`;
  if (cell.state === CellState.REVEALED) {
    if (cell.mine) return `${pos}，地雷`;
    if (cell.neighbors === 0) return `${pos}，空白`;
    return `${pos}，周围 ${NUMBER_LABELS[cell.neighbors] ?? cell.neighbors} 个雷`;
  }
  if (over && cell.mine) return `${pos}，地雷`;
  return `${pos}，未翻开`;
}

/** 顶部状态提示文案 */
function describeStatus(snapshot) {
  switch (snapshot.status) {
    case GameStatus.WON:
      return '恭喜，扫雷成功！';
    case GameStatus.LOST:
      return '踩到雷了，再来一局吧。';
    case GameStatus.PLAYING:
      return snapshot.minesPlaced ? '进行中……' : '点击任意格子开始';
    default:
      return '点击任意格子开始（首点必定安全）';
  }
}
