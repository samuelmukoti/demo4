/* Snake Controls — keyboard input (Arrow keys + WASD) + touch swipe + D-pad.
 * Handles direction changes with reversal prevention and per-tick input buffering.
 * Phase 3, subtask 3-1: keyboard controls fully extracted from game.js.
 * Phase 3, subtask 3-2: touch swipe gesture detection and D-pad button controls.
 */
(function () {
  'use strict';

  // ── Module state ──────────────────────────────────────────────────────────
  var game       = null;  // SnakeGame public API reference
  var pendingDir = null;  // direction buffered for the current game tick
  var lastDir    = null;  // last committed direction (used to detect tick boundary)

  // Touch swipe tracking.
  var touchStartX = 0;
  var touchStartY = 0;

  // Minimum pixel delta required to register a swipe as intentional.
  var SWIPE_THRESHOLD = 30;

  // ── Lookup tables ─────────────────────────────────────────────────────────

  // Maps each direction to the direction that would cause a 180° reversal.
  var OPPOSITES = {
    up:    'down',
    down:  'up',
    left:  'right',
    right: 'left'
  };

  // Maps keyboard key values to snake directions.
  // Both lower- and upper-case WASD are included so Caps Lock is handled.
  var KEY_MAP = {
    ArrowUp:    'up',
    ArrowDown:  'down',
    ArrowLeft:  'left',
    ArrowRight: 'right',
    w: 'up',   W: 'up',
    s: 'down', S: 'down',
    a: 'left', A: 'left',
    d: 'right', D: 'right'
  };

  // ── Direction dispatcher ───────────────────────────────────────────────────
  // Central function for processing a direction from any input source.
  // Performs reversal prevention and buffers the direction for the current tick.
  function applyDirection(dir) {
    if (!game) { return; }

    var state = game.getState();
    if (state.gameState !== 'playing') { return; }

    // Reversal check: compare the requested direction against the pending
    // direction (if one has already been buffered this tick) or else against
    // the currently committed direction.
    var refDir = pendingDir !== null ? pendingDir : state.direction;
    if (dir === OPPOSITES[refDir]) { return; }

    // Buffer this direction for the current tick and forward it to the engine.
    pendingDir = dir;
    game.setDirection(dir);
  }

  // ── Keyboard handler ──────────────────────────────────────────────────────
  function handleKeyDown(e) {
    if (!game) { return; }

    var dir = KEY_MAP[e.key];
    if (!dir) { return; }

    var state = game.getState();
    if (state.gameState !== 'playing') { return; }

    // Prevent arrow keys from scrolling the page during gameplay.
    e.preventDefault();

    applyDirection(dir);
  }

  // ── Touch swipe handlers ───────────────────────────────────────────────────

  function handleTouchStart(e) {
    if (!game) { return; }

    var state = game.getState();
    if (state.gameState !== 'playing') { return; }

    // Prevent page scroll while the game is active.
    e.preventDefault();

    var touch = e.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }

  function handleTouchMove(e) {
    if (!game) { return; }

    var state = game.getState();
    if (state.gameState !== 'playing') { return; }

    // Prevent page scroll while the game is active.
    e.preventDefault();
  }

  function handleTouchEnd(e) {
    if (!game) { return; }

    var state = game.getState();
    if (state.gameState !== 'playing') { return; }

    e.preventDefault();

    var touch = e.changedTouches[0];
    var dx = touch.clientX - touchStartX;
    var dy = touch.clientY - touchStartY;

    // Require minimum swipe distance to distinguish from taps.
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) { return; }

    // Determine dominant axis and map to a snake direction.
    var dir;
    if (Math.abs(dx) >= Math.abs(dy)) {
      dir = dx > 0 ? 'right' : 'left';
    } else {
      dir = dy > 0 ? 'down' : 'up';
    }

    applyDirection(dir);
  }

  // ── D-pad button handlers ─────────────────────────────────────────────────

  // Creates a handler for a specific D-pad direction button.
  // Uses touchstart with preventDefault() on touch devices so that the
  // subsequent synthetic click event is suppressed, preventing double-firing.
  // On desktop (no touch) only the click event fires.
  function makeDpadHandler(dir) {
    return function (e) {
      e.preventDefault();
      applyDirection(dir);
    };
  }

  // Attaches touchstart and click listeners to a D-pad button element.
  function bindDpadButton(id, dir) {
    var el = document.getElementById(id);
    if (!el) { return; }
    var handler = makeDpadHandler(dir);
    // { passive: false } is required to call preventDefault() on touchstart.
    el.addEventListener('touchstart', handler, { passive: false });
    el.addEventListener('click', handler);
  }

  // ── Tick-boundary detection ────────────────────────────────────────────────
  // Runs every animation frame.  When the game's committed direction changes
  // (a game tick has occurred) the pending buffer is cleared so the next tick
  // accepts fresh input.  The buffer is also cleared whenever the game leaves
  // the playing state (pause, game-over, restart) so stale values cannot
  // block valid first moves in a new game.
  function tickWatcher() {
    if (game) {
      var state = game.getState();

      if (state.gameState !== 'playing') {
        // Outside of active play: reset both sentinels.  This ensures that
        // the very first keypress of a new game is validated against the
        // actual starting direction rather than a leftover pendingDir.
        pendingDir = null;
        lastDir    = null;
      } else if (state.direction !== lastDir) {
        // A tick just committed a new direction — open the slot for one more
        // buffered input in the upcoming tick.
        lastDir    = state.direction;
        pendingDir = null;
      }
    }

    requestAnimationFrame(tickWatcher);
  }

  // ── Initialisation ─────────────────────────────────────────────────────────
  function init(gameApi) {
    game    = gameApi;
    lastDir = game.getState().direction;

    document.addEventListener('keydown', handleKeyDown);

    // Attach touch swipe listeners to the game canvas.
    var canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove',  handleTouchMove,  { passive: false });
      canvas.addEventListener('touchend',   handleTouchEnd,   { passive: false });
    }

    // Attach D-pad button listeners.
    bindDpadButton('btn-up',    'up');
    bindDpadButton('btn-down',  'down');
    bindDpadButton('btn-left',  'left');
    bindDpadButton('btn-right', 'right');

    // Kick off the tick-boundary watcher loop.
    requestAnimationFrame(tickWatcher);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.SnakeControls = { init: init };
}());
