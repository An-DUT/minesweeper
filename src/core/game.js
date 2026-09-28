/**
 * 游戏状态机（specs/02-functional.md 状态机 / specs/06-design.md）
 * 纯逻辑模块：禁止引用 document / window。
 *
 * 状态流转：ready → playing → (won | lost)
 * 终局后除重开外，所有操作无副作用。
 */

import { GameStatus } from './constants.js';
import {
  chord,
  createBoard,
  placeMines,
  remainingMines,
  reveal,
  toggleFlag,
} from './board.js';
import { defaultRng } from './rng.js';
import { countFlags, countRevealedSafe, isWin, verifyInvariants } from './stats.js';

/** 难度描述符 → 板面尺寸的唯一入口（含雷数钳制） */
export function resolveDifficulty(difficulty) {
  return {
    key: difficulty.key,
    label: difficulty.label,
    rows: difficulty.rows,
    cols: difficulty.cols,
    mines: difficulty.mines,
    clamped: Boolean(difficulty.clamped),
  };
}

export class Game {
  /**
   * @param {object} difficulty 已规范化的难度描述符
   * @param {() => number} rng 可注入随机源
   */
  constructor(difficulty, rng = defaultRng) {
    this.difficulty = resolveDifficulty(difficulty);
    this.rng = rng;
    this.board = null;
    /** 单局内的操作次数，便于调试与测试 */
    this.moves = 0;
    this.reset();
  }

  /** 重开（FR-08）：回到 ready，不布雷 */
  reset() {
    this.board = createBoard(
      this.difficulty.rows,
      this.difficulty.cols,
      this.difficulty.mines,
    );
    this.moves = 0;
    return this.board;
  }

  get status() {
    return this.board.status;
  }

  get isOver() {
    return this.board.status === GameStatus.WON || this.board.status === GameStatus.LOST;
  }

  get isWon() {
    return this.board.status === GameStatus.WON;
  }

  get isLost() {
    return this.board.status === GameStatus.LOST;
  }

  /** 计时是否应该运行：首次布雷后开始，终局即停 */
  get isTiming() {
    return this.board.minesPlaced && !this.isOver;
  }

  get remainingMines() {
    return remainingMines(this.board);
  }

  /** 进度：已翻开非雷格 / 全部非雷格 */
  get progress() {
    const totalSafe = this.board.cells.length - this.board.mineCount;
    return {
      revealed: countRevealedSafe(this.board),
      total: totalSafe,
    };
  }

  /**
   * 左键翻开。首点在此触发布雷（FR-04）。
   * @returns {{revealed:number[], exploded:boolean, newlyRevealed:number[], firstMove:boolean, won:boolean}}
   */
  revealCell(index) {
    const firstMove = !this.board.minesPlaced;
    const before = this.board.status;
    const result = reveal(this.board, index, this.rng);
    if (result.revealed.length > 0 || firstMove) this.moves += 1;
    return {
      ...result,
      firstMove,
      won: before !== GameStatus.WON && this.board.status === GameStatus.WON,
    };
  }

  /** 右键标记 */
  toggleFlag(index) {
    const changed = toggleFlag(this.board, index);
    if (changed) this.moves += 1;
    return changed;
  }

  /** 双击快速展开（FR-11） */
  chord(index) {
    const result = chord(this.board, index, this.rng);
    if (result.revealed.length > 0) this.moves += 1;
    return result;
  }

  /** 显式布雷（一般不需要，revealCell 会自动触发；供测试与预置局面使用） */
  placeMinesAt(index) {
    return placeMines(this.board, index, this.rng);
  }

  /** 当前是否已满足胜利条件（不改变状态） */
  checkWinCondition() {
    return isWin(this.board);
  }

  /** 不变量校验，返回问题列表 */
  verify() {
    return verifyInvariants(this.board);
  }

  /** 供 UI 读取的轻量快照（不含 cells，避免 UI 误改逻辑数据） */
  snapshot() {
    return {
      key: this.difficulty.key,
      label: this.difficulty.label,
      rows: this.board.rows,
      cols: this.board.cols,
      mineCount: this.board.mineCount,
      status: this.board.status,
      flags: countFlags(this.board),
      remainingMines: this.remainingMines,
      progress: this.progress,
      minesPlaced: this.board.minesPlaced,
      minesClamped: this.board.minesClamped,
      explodedIndex: this.board.explodedIndex,
    };
  }
}

/** 工厂函数：UI 层统一用它创建游戏 */
export function createGame(difficulty, rng = defaultRng) {
  return new Game(difficulty, rng);
}
