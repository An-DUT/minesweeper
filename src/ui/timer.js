/**
 * 计时器（specs/06-design.md §6.3 计时）
 *
 * 关键设计：显示值由 now() 的差值算出，而不是每秒累加。
 * 浏览器在后台会节流 setInterval，累加式计时必然少计；差值式不受影响。
 *
 * 时钟与调度器均可注入，既便于单元测试，也避免测试必须等待真实时间。
 */

import { TIMER_MAX } from '../core/constants.js';

const TICK_MS = 100;

export class Timer {
  /**
   * @param {(seconds: number) => void} onTick
   * @param {object} [options]
   * @param {() => number} [options.now] 单调时钟，默认 performance.now
   * @param {Function} [options.setIntervalFn]
   * @param {Function} [options.clearIntervalFn]
   */
  constructor(onTick, options = {}) {
    this.onTick = onTick;
    this.now = options.now ?? (() => performance.now());
    this.setIntervalFn = options.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalFn = options.clearIntervalFn ?? ((id) => clearInterval(id));
    this.tickMs = options.tickMs ?? TICK_MS;
    this.startTs = 0;
    this.started = false;
    this.intervalId = null;
    this.seconds = 0;
  }

  get isRunning() {
    return this.intervalId !== null;
  }

  /** 开始计时（重复调用会被忽略） */
  start() {
    if (this.isRunning) return;
    this.startTs = this.now();
    this.started = true;
    this.seconds = 0;
    this.onTick(0);
    this.intervalId = this.setIntervalFn(() => this.tick(), this.tickMs);
  }

  /** 停止计时并返回最终秒数 */
  stop() {
    if (this.intervalId !== null) {
      this.clearIntervalFn(this.intervalId);
      this.intervalId = null;
    }
    this.tick();
    return this.seconds;
  }

  /** 重置为 0 并停止 */
  reset() {
    if (this.intervalId !== null) {
      this.clearIntervalFn(this.intervalId);
      this.intervalId = null;
    }
    this.seconds = 0;
    this.startTs = 0;
    this.started = false;
    this.onTick(0);
  }

  /** 计算并上报当前秒数 */
  tick() {
    if (!this.started) {
      this.seconds = 0;
      return;
    }
    const elapsed = (this.now() - this.startTs) / 1000;
    const seconds = Math.min(TIMER_MAX, Math.floor(elapsed));
    if (seconds !== this.seconds) {
      this.seconds = seconds;
      this.onTick(seconds);
    }
  }
}

export const TIMER_TICK_MS = TICK_MS;
