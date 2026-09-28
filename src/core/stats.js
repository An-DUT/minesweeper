/**
 * 统计与不变量断言（specs/06-design.md §6.1 I1–I5）
 * 开发期与测试共用：verifyInvariants 在非生产路径上可作为运行时断言。
 */

import { CellState, GameStatus } from './constants.js';

/** 已翻开的雷格数量 */
export function countExploded(board) {
  return board.cells.filter((c) => c.mine && c.state === CellState.REVEALED).length;
}

/** 实际雷数 */
export function countMines(board) {
  return board.cells.filter((c) => c.mine).length;
}

/** 实际旗数 */
export function countFlags(board) {
  return board.cells.filter((c) => c.state === CellState.FLAGGED).length;
}

/** 已翻开的非雷格数 */
export function countRevealedSafe(board) {
  return board.cells.filter((c) => !c.mine && c.state === CellState.REVEALED).length;
}

/** 是否胜利：所有非雷格均已翻开 */
export function isWin(board) {
  if (!board.minesPlaced) return false;
  return countRevealedSafe(board) === board.cells.length - board.mineCount;
}

/**
 * 校验 I1–I5，返回违规描述数组（空数组表示全部通过）。
 * I4（flags 计数）在「过度插旗」场景下仍应成立，因此这里始终检查。
 */
export function verifyInvariants(board) {
  const problems = [];
  const push = (id, msg) => problems.push(`${id}: ${msg}`);

  // I1 雷数精确
  if (board.minesPlaced) {
    const actual = countMines(board);
    if (actual !== board.mineCount) {
      push('I1', `雷数 ${actual} ≠ mineCount ${board.mineCount}`);
    }
  }

  // I2 邻雷数正确
  for (let i = 0; i < board.cells.length; i += 1) {
    const cell = board.cells[i];
    if (cell.mine) continue;
    const r0 = Math.floor(i / board.cols);
    const c0 = i % board.cols;
    let expected = 0;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) continue;
        if (board.cells[r * board.cols + c].mine) expected += 1;
      }
    }
    if (cell.neighbors !== expected) {
      push('I2', `cells[${i}].neighbors ${cell.neighbors} ≠ 期望 ${expected}`);
    }
  }

  // I3 失败时恰好一个雷被翻开
  if (board.status === GameStatus.LOST) {
    const exploded = countExploded(board);
    if (exploded !== 1) push('I3', `失败状态下翻开的雷格数 ${exploded} ≠ 1`);
  }

  // I4 flags 计数与 flagged 态一致
  const actualFlags = countFlags(board);
  if (board.flags !== actualFlags) {
    push('I4', `board.flags ${board.flags} ≠ 实际 flagged 格数 ${actualFlags}`);
  }

  // I5 revealedCount 与真实已翻开非雷格数一致
  if (board.revealedCount !== countRevealedSafe(board)) {
    push('I5', `revealedCount ${board.revealedCount} ≠ 实际 ${countRevealedSafe(board)}`);
  }

  // I6 胜利状态下所有雷格已插旗
  if (board.status === GameStatus.WON) {
    const unflagged = board.cells.filter((c) => c.mine && c.state !== CellState.FLAGGED).length;
    if (unflagged !== 0) push('I6', `胜利状态下仍有 ${unflagged} 个雷格未插旗`);
  }

  return problems;
}

/** 断言全部不变量成立，否则抛错（供测试与开发期使用） */
export function assertInvariants(board, label = 'board') {
  const problems = verifyInvariants(board);
  if (problems.length > 0) {
    throw new Error(`${label} 不变量违规：\n  ${problems.join('\n  ')}`);
  }
}
