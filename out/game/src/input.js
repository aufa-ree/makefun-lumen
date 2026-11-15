// Keyboard and pointer input. WASD and the arrow keys steer; the mouse aims the lantern
// beam (its position is read in field coordinates, scaled from the window); holding the
// mouse button or Space fires the beam. One-shot presses (start, restart, pause, pulse,
// level-up choices) are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_PULSE = 4;
export const ACTION_CHOICE_1 = 8;
export const ACTION_CHOICE_2 = 16;
export const ACTION_CHOICE_3 = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const PULSE = new Set(['KeyE']);

export function createInput(target, toField) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let firing = false;
  let actions = 0;
  let click = null;
  const mouse = { x: 640, y: 360 };

  function trackMouse(event) {
    const rect = target.getBoundingClientRect();
    const point = toField(event.clientX - rect.left, event.clientY - rect.top);
    mouse.x = point.x;
    mouse.y = point.y;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      firing = true;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (PULSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PULSE;
    } else if (event.code === 'Digit1') {
      if (!event.repeat) actions |= ACTION_CHOICE_1;
    } else if (event.code === 'Digit2') {
      if (!event.repeat) actions |= ACTION_CHOICE_2;
    } else if (event.code === 'Digit3') {
      if (!event.repeat) actions |= ACTION_CHOICE_3;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (CONFIRM.has(event.code)) firing = false;
  });
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    firing = false;
  });
  target.addEventListener('pointermove', trackMouse);
  target.addEventListener('pointerdown', (event) => {
    trackMouse(event);
    firing = true;
    click = { x: mouse.x, y: mouse.y };
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', () => {
    firing = false;
  });

  return {
    mouse,
    /** The steering direction as a unit vector (or zero when still). */
    direction() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      const length = Math.hypot(x, y);
      if (length === 0) return { x: 0, y: 0 };
      return { x: x / length, y: y / length };
    },
    firing() {
      return firing;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last pointerdown's field position, once, then cleared. */
    takeClick() {
      const point = click;
      click = null;
      return point;
    },
  };
}
