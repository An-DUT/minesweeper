/**
 * 可注入随机源（specs/06-design.md §6.4）
 * 逻辑层不直接使用 Math.random，全部通过注入的 rng，保证测试确定性。
 *
 * 契约：rng() 返回 [0, 1) 的浮点数。
 */

/** 生产用随机源 */
export function defaultRng() {
  return Math.random();
}

/**
 * 确定性随机源：按序吐出预设值，用尽后抛错。
 * 抛错而非回绕，可让「算法取用随机数的次数超出预期」这类 bug 立刻暴露。
 * @param {number[]} values
 */
export function makeSeqRng(values) {
  let i = 0;
  return function seqRng() {
    if (i >= values.length) {
      throw new Error(`seqRng 已用尽：算法请求了第 ${i + 1} 个随机数，但只提供了 ${values.length} 个`);
    }
    return values[i++];
  };
}

/** 从 rng 取 [0, max) 的整数 */
export function randomInt(rng, max) {
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError(`randomInt 需要正整数上界，收到 ${max}`);
  }
  const value = rng();
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`rng 必须返回 [0, 1) 的数，收到 ${value}`);
  }
  return Math.floor(value * max);
}
