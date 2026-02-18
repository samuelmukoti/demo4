/* Snake Controls — keyboard input (Arrow keys + WASD) for Phase 3.
 * Handles direction changes with reversal prevention and per-tick input buffering.
 * Phase 3, subtask 3-1: keyboard controls fully extracted from game.js.
 */
(function () {
  'use strict';

  // ── Module state ──────────────────────────────────────────────────────────
  var game       = null;  // SnakeGame public API reference
  var pendingDir = null;  // direction buffered for the current game tick
  var lastDir    = null;  // last committed direction (used to detect tick boundary)

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

  // ── Keyboard handler ──────────────────────────────────────────────────────
  function handleKeyDown(e) {
    if (!game) { return; }

    var dir = KEY_MAP[e.key];
    if (!dir) { return; }

    var state = game.getState();
    if (state.gameState !== 'playing') { return; }

    // Prevent arrow keys from scrolling the page during gameplay.
    e.preventDefault();

    // Reversal check: compare the requested direction against the pending
    // direction (if one has already been buffered this tick) or else against
    // the currently committed direction.  This prevents a 180° reversal that
    // would otherwise slip through if the player presses e.g. Down then Up
    // within the same game tick.
    var refDir = pendingDir !== null ? pendingDir : state.direction;
    if (dir === OPPOSITES[refDir]) { return; }

    // Buffer this direction for the current tick and forward it to the engine.
    // game.setDirection also guards against reversals as a safety net.
    pendingDir = dir;
    game.setDirection(dir);
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

    // Kick off the tick-boundary watcher loop.
    requestAnimationFrame(tickWatcher);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.SnakeControls = { init: init };
}());
