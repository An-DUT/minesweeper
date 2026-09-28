/**
 * 雷区逻辑（specs/06-design.md §6.3）
 * 纯逻辑模块：禁止引用 document / window / localStorage。
 *
 * 所有导出函数都是「就地修改传入的 board」并返回同一对象引用，
 * 但 board 是普通可序列化对象，测试可用 structuredClone 做快照对比。
 */

import { CellState, GameStatus, NEIGHBOR_OFFSETS, maxMines } from './constants.js';
import { defaultRng, randomInt } from './rng.js';

/** 创建一个未布雷的空雷区 */
export function createBoard(rows, cols, mineCount) {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
    throw new RangeError(`非法板面尺寸：${rows}×${cols}`);
  }
  const total = rows * cols;
  if (!Number.isInteger(mineCount) || mineCount < 0 || mineCount > maxMines(rows, cols)) {
    throw new RangeError(`非法雷数：${mineCount}（${rows}×${cols} 允许 0..${maxMines(rows, cols)}）`);
  }

  const cells = new Array(total);
  for (let i = 0; i < total; i += 1) {
    cells[i] = { mine: false, neighbors: 0, state: CellState.HIDDEN };
  }

  return {
    rows,
    cols,
    mineCount,
    cells,
    minesPlaced: false,
    status: GameStatus.READY,
    flags: 0,
    revealedCount: 0,
    /** 布雷时是否发生了雷数下调（A2） */
    minesClamped: false,
    /** 踩中的那个雷的 index（失败时用于 UI 高亮），无则为 -1 */
    explodedIndex: -1,
  };
}

/** 返回 index 的 8 邻域中落在板内的下标 */
export function neighborsOf(board, index) {
  const { rows, cols } = board;
  const r0 = Math.floor(index / cols);
  const c0 = index % cols;
  const out = [];
  for (let k = 0; k < NEIGHBOR_OFFSETS.length; k += 1) {
    const r = r0 + NEIGHBOR_OFFSETS[k][0];
    const c = c0 + NEIGHBOR_OFFSETS[k][1];
    if (r >= 0 && r < rows && c >= 0 && c < cols) out.push(r * cols + c);
  }
  return out;
}

/**
 * 布雷（首点安全 + 部分 Fisher–Yates 均匀洗牌，A1）。
 * 幂等：已布雷则原样返回。
 * @param {object} board
 * @param {number} safeIndex 首次点击的格，保证它及其 8 邻域无雷
 * @param {() => number} rng
 */
export function placeMines(board, safeIndex, rng = defaultRng) {
  if (board.minesPlaced) return board;
  if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex >= board.cells.length) {
    throw new RangeError(`非法 safeIndex：${safeIndex}`);
  }

  const total = board.cells.length;
  // A2 降级链 ①：优先排除首点 + 8 邻域，保证 3×3 首点安全区
  const safeZone = new Set([safeIndex, ...neighborsOf(board, safeIndex)]);

  // 无雷局面：无需布雷，但仍要保证状态推进与邻雷数正确
  if (board.mineCount === 0) {
    board.minesPlaced = true;
    board.status = GameStatus.PLAYING;
    computeNeighborCounts(board);
    return board;
  }

  // A2 降级链 ②/③：安全区之外的格数不足时，下调雷数而不是缩小安全区。
  // 缩小安全区会破坏「首点及其邻域无雷」这一硬保证，因此绝不允许。
  let minesToPlace = board.mineCount;
  if (total - safeZone.size < minesToPlace) {
    minesToPlace = Math.max(0, total - safeZone.size);
    board.mineCount = minesToPlace;
    board.minesClamped = true;
  }

  // 池 = 安全区之外的所有下标（保持升序，使随机结果可复现）
  const pool = [];
  for (let i = 0; i < total; i += 1) if (!safeZone.has(i)) pool.push(i);

  // 部分 Fisher–Yates：从池中均匀抽出 minesToPlace 个位置放到池尾。
  // 当 minesToPlace === pool.length 时「全部都是雷」，无需也无法洗牌
  //   —— 若不跳过，标准写法会让 start = 0 而白洗整池并消耗 n 个随机数。
  if (minesToPlace < pool.length) {
    const start = pool.length - minesToPlace;
    for (let i = pool.length - 1; i >= start; i -= 1) {
      const j = randomInt(rng, i + 1);
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
  }

  const mineStart = pool.length - minesToPlace;
  for (let i = mineStart; i < pool.length; i += 1) {
    board.cells[pool[i]].mine = true;
  }

  board.minesPlaced = true;
  board.status = GameStatus.PLAYING;
  computeNeighborCounts(board);
  return board;
}

/** 计算每格邻雷数（I2） */
export function computeNeighborCounts(board) {
  for (let i = 0; i < board.cells.length; i += 1) {
    if (board.cells[i].mine) {
      board.cells[i].neighbors = 0;
      continue;
    }
    let count = 0;
    for (const n of neighborsOf(board, i)) if (board.cells[n].mine) count += 1;
    board.cells[i].neighbors = count;
  }
  return board;
}

/**
 * 判断某格此刻是否允许被翻开（内部谓词，同时被 reveal 与 chord 复用）。
 * 注意：question 不是保护态（A3）。
 */
function canReveal(board, index) {
  const cell = board.cells[index];
  if (cell.state === CellState.REVEALED) return false;
  if (cell.state === CellState.FLAGGED) return false;
  return true;
}

/**
 * 翻开一格。首点会触发布雷；0 邻雷格触发 BFS 展开。
 * @returns {{revealed: number[], exploded: boolean, newlyRevealed: number[]}}
 *   revealed = 本次被翻开的全部格子；newlyRevealed = 从 hidden/question 变为 revealed 的格子
 */
export function reveal(board, index, rng = defaultRng) {
  const none = { revealed: [], exploded: false, newlyRevealed: [] };
  if (board.status === GameStatus.WON || board.status === GameStatus.LOST) return none;
  // 必须先校验 index 再布雷：否则 UI 层传错参数会留下「已布雷但无首点安全」的坏局面
  if (!Number.isInteger(index) || index < 0 || index >= board.cells.length) return none;

  if (!board.minesPlaced) placeMines(board, index, rng);
  if (!canReveal(board, index)) return none;

  const cell = board.cells[index];
  if (cell.mine) {
    cell.state = CellState.REVEALED;
    board.status = GameStatus.LOST;
    board.explodedIndex = index;
    return { revealed: [index], exploded: true, newlyRevealed: [index] };
  }

  // BFS 展开
  const queue = [index];
  const visited = new Set(); // 必需：防止 0 区被重复入队导致队列膨胀
  const revealed = [];
  const newlyRevealed = [];

  while (queue.length > 0) {
    const i = queue.shift();
    if (visited.has(i)) continue;
    visited.add(i);
    if (!canReveal(board, i)) continue;

    const current = board.cells[i];
    current.state = CellState.REVEALED;
    board.revealedCount += 1;
    revealed.push(i);
    newlyRevealed.push(i);

    if (current.neighbors === 0) {
      for (const n of neighborsOf(board, i)) {
        if (!visited.has(n) && canReveal(board, n)) queue.push(n);
      }
    }
  }

  if (board.status === GameStatus.READY) board.status = GameStatus.PLAYING;
  checkWin(board);
  return { revealed, exploded: false, newlyRevealed };
}

/**
 * 右键标记：hidden → flagged → question → hidden
 * 已翻开格不响应。返回是否发生了状态变化。
 */
export function toggleFlag(board, index) {
  if (board.status === GameStatus.WON || board.status === GameStatus.LOST) return false;
  if (!Number.isInteger(index) || index < 0 || index >= board.cells.length) return false;

  const cell = board.cells[index];
  if (cell.state === CellState.REVEALED) return false;

  if (cell.state === CellState.HIDDEN) {
    cell.state = CellState.FLAGGED;
    board.flags += 1;
  } else if (cell.state === CellState.FLAGGED) {
    cell.state = CellState.QUESTION;
    board.flags -= 1;
  } else if (cell.state === CellState.QUESTION) {
    cell.state = CellState.HIDDEN;
  }
  return true;
}

/**
 * 双击快速展开（chord）。
 * 条件：目标为已翻开的数字格，且其 8 邻域旗数恰好等于该数字。
 * 注意：不要求周围已全部翻开；一圈旗时「有已翻开的邻居」不再作为前提。
 */
export function chord(board, index, rng = defaultRng) {
  const none = { revealed: [], exploded: false, newlyRevealed: [] };
  if (board.status === GameStatus.WON || board.status === GameStatus.LOST) return none;
  if (!Number.isInteger(index) || index < 0 || index >= board.cells.length) return none;

  const cell = board.cells[index];
  if (cell.state !== CellState.REVEALED) return none;
  if (cell.neighbors === 0) return none;

  const neighbors = neighborsOf(board, index);
  const flagCount = neighbors.filter((n) => board.cells[n].state === CellState.FLAGGED).length;
  if (flagCount !== cell.neighbors) return none;

  const revealed = [];
  const newlyRevealed = [];

  for (const n of neighbors) {
    if (!canReveal(board, n)) continue;
    const result = reveal(board, n, rng);
    revealed.push(...result.revealed);
    newlyRevealed.push(...result.newlyRevealed);
    // 踩雷后立即中止（FR-09），不再翻开其余邻格
    if (result.exploded || board.status === GameStatus.LOST) {
      return { revealed, exploded: true, newlyRevealed };
    }
  }

  checkWin(board);
  return { revealed, exploded: false, newlyRevealed };
}

/**
 * 胜利判定（FR-10）：所有非雷格均已翻开。
 * 满足时自动为剩余雷格插旗，并把 status 置为 won。
 * @returns {boolean} 本次调用是否「刚刚」达成胜利
 */
export function checkWin(board) {
  if (board.status === GameStatus.WON || board.status === GameStatus.LOST) return false;
  if (!board.minesPlaced) return false;

  const totalSafe = board.cells.length - board.mineCount;
  if (board.revealedCount < totalSafe) return false;

  for (const cell of board.cells) {
    if (cell.mine && cell.state !== CellState.FLAGGED) {
      // question / hidden → flagged：flag 计数只增不减。
      // 问号不计入 flags，所以这里绝不能先减一次（否则净变化为 0，破坏不变量 I4）。
      cell.state = CellState.FLAGGED;
      board.flags += 1;
    }
  }
  board.status = GameStatus.WON;
  return true;
}

/** 剩余雷数 = 总雷数 − 旗数（FR-07，允许为负，UI 用符号显示） */
export function remainingMines(board) {
  return board.mineCount - board.flags;
}
