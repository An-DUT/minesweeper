/**
 * 输入适配（FR-02、FR-03、FR-11、FR-15、FR-16）
 *
 * 统一用 Pointer Events，避免 mouse/touch 双路监听导致的长按与点击重复触发。
 * - 左键点击：翻开
 * - 右键：三态标记（阻止 contextmenu）
 * - 双击 / 中键：chord 快速展开
 * - 触屏长按 400ms：标记（并阻止后续 click）
 * - 键盘：方向键移动焦点，Enter 翻开，F / 空格 标记
 */

const LONG_PRESS_MS = 400;

export function attachInput(root, renderer, handlers) {
  const { grid } = root;
  /** 长按已触发标记，用于吞掉随后的 click */
  let longPressFired = false;
  let longPressTimer = null;
  let activePointerId = null;

  const clearLongPress = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    activePointerId = null;
  };

  // ── 触屏 / 指针长按插旗 ────────────────────────────────
  grid.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    if (event.button !== 0) return;
    const index = renderer.indexFromEvent(event);
    if (index < 0) return;

    activePointerId = event.pointerId;
    longPressFired = false;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (activePointerId !== event.pointerId) return;
      longPressFired = true;
      handlers.onFlag(index);
    }, LONG_PRESS_MS);
  });

  const endPointer = (event) => {
    if (event.pointerType === 'mouse') return;
    if (event.pointerId !== activePointerId && activePointerId !== null) return;
    clearLongPress();
  };
  grid.addEventListener('pointerup', endPointer);
  grid.addEventListener('pointercancel', endPointer);
  grid.addEventListener('pointerleave', endPointer);

  // 长按后抑制滚动与长按菜单
  grid.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  // ── 鼠标点击 ─────────────────────────────────────────
  grid.addEventListener('click', (event) => {
    const index = renderer.indexFromEvent(event);
    if (index < 0) return;
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    // 键盘触发的 click（detail === 0）交给 keydown 处理，避免重复
    if (event.detail === 0) return;
    renderer.focusIndex = index;
    handlers.onReveal(index);
  });

  // ── 右键标记 ─────────────────────────────────────────
  grid.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return; // 中键交给 dblclick 逻辑，避免重复
    const index = renderer.indexFromEvent(event);
    if (index < 0) return;
    event.preventDefault();
    handlers.onChord(index);
  });

  grid.addEventListener('mousedown', (event) => {
    if (event.button !== 1) return;
    event.preventDefault(); // 阻止中键自动滚动
  });

  grid.addEventListener('dblclick', (event) => {
    const index = renderer.indexFromEvent(event);
    if (index < 0) return;
    event.preventDefault();
    handlers.onChord(index);
  });

  grid.addEventListener('mouseup', (event) => {
    if (event.button !== 2) return;
    const index = renderer.indexFromEvent(event);
    if (index < 0) return;
    event.preventDefault();
    handlers.onFlag(index);
  });

  // ── 键盘 ────────────────────────────────────────────
  grid.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target.closest('.cell') : null;
    if (!target) return;
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index)) return;
    const cols = renderer.renderedCols;
    const rows = renderer.renderedRows;
    const r = Math.floor(index / cols);
    const c = index % cols;

    let next = -1;
    switch (event.key) {
      case 'ArrowUp': next = r > 0 ? index - cols : index; break;
      case 'ArrowDown': next = r < rows - 1 ? index + cols : index; break;
      case 'ArrowLeft': next = c > 0 ? index - 1 : index; break;
      case 'ArrowRight': next = c < cols - 1 ? index + 1 : index; break;
      case 'Home': next = r * cols; break;
      case 'End': next = r * cols + cols - 1; break;
      case 'f': case 'F':
        event.preventDefault();
        handlers.onFlag(index);
        return;
      case ' ':
        event.preventDefault();
        handlers.onFlag(index);
        return;
      case 'Enter':
        event.preventDefault();
        handlers.onReveal(index);
        return;
      case 'c': case 'C':
        event.preventDefault();
        handlers.onChord(index);
        return;
      default:
        return;
    }

    event.preventDefault();
    renderer.focusCell(next);
  });

  // ── 全局：空格/回车不要滚动页面 ──────────────────────
  document.addEventListener('keydown', (event) => {
    if (event.key === ' ' && event.target instanceof Element && event.target.closest('.cell')) {
      event.preventDefault();
    }
  });

  return () => {
    clearLongPress();
  };
}
