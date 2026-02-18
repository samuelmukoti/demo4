/* Snake Game — Core Engine
 * Phase 2, subtask 2-1: canvas setup, render loop, grid system, snake, arrow keys.
 * Phase 2, subtask 2-2: food spawning, wall/self collision, score, snake growth.
 * Phase 2, subtask 2-3: game state management (start/pause/gameover screens).
 * Phase 3, subtask 3-1: arrow key handling removed; delegated fully to controls.js.
 * Phase 5, subtask 5-1: progressive difficulty, high score, auto-pause, resize handling.
 * Phase 5, subtask 5-2: small screen fallback, min 10x10 grid, responsive polish.
 */
(function () {
  'use strict';

  // ── Configuration ─────────────────────────────────────────────────────────
  var CELLS_ACROSS   = 20;   // target number of columns (also rows — square grid)
  var TICK_MS        = 150;  // base ms between game logic ticks
  var TICK_MIN_MS    = 60;   // fastest allowed tick interval
  var TICK_STEP_MS   = 10;   // ms reduction per difficulty level
  var TICK_LEVEL_EVERY = 5;  // food items consumed per difficulty level
  var MIN_GRID       = 10;   // minimum grid dimension (cells) in each axis
  var MIN_SCREEN_PX  = 280;  // viewport width (px) below which the game is suppressed

  // ── Module state ──────────────────────────────────────────────────────────
  var canvas, ctx;
  var cellSize, gridW, gridH;
  var gameInitialized = false; // true once the game has been fully set up

  // Current tick interval — decreases as difficulty rises; reset on new game.
  var currentTickMs = TICK_MS;

  // Snake: array of {x, y} cell objects; index 0 is the head.
  var snake = [];
  var direction     = 'right';
  var nextDirection = 'right';

  // Food, score, high score and game state.
  var food      = null;   // {x, y}
  var score     = 0;
  var highScore = 0;
  var gameState = 'start'; // start | playing | paused | gameover

  var lastTickTime = 0;
  var animFrameId  = null;

  // Overlay DOM element (created dynamically in init).
  var overlayEl = null;

  // Event-handler registry (used by effects.js / controls.js hooks).
  var eventHandlers = {};

  // ── Initialisation ────────────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('game-canvas');
    if (!canvas || !canvas.getContext) {
      return; // Canvas not supported — fallback text shown by jade template
    }
    ctx = canvas.getContext('2d');

    // Register resize/orientation/visibility listeners early so we can react
    // even when the page starts in a too-small state.
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (window.innerWidth < MIN_SCREEN_PX) {
      // Viewport too small — CSS media query shows the fallback message.
      return;
    }

    setupGame();
  }

  // Complete game setup; called from init() or from handleResize() when the
  // viewport grows back above MIN_SCREEN_PX after starting too small.
  function setupGame() {
    if (gameInitialized) { return; }
    gameInitialized = true;

    resizeCanvas();
    loadHighScore();
    resetSnake();
    createOverlay();
    showStartOverlay();

    // Hook external modules in if they have already loaded.
    if (window.SnakeControls && typeof window.SnakeControls.init === 'function') {
      window.SnakeControls.init(window.SnakeGame);
    }

    document.addEventListener('keydown', handleKeyDown);
    animFrameId = requestAnimationFrame(renderLoop);
  }

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  function resizeCanvas() {
    var container = canvas.parentElement;
    var availableW = container.clientWidth  || 400;
    var availableH = window.innerHeight - 220; // leave room for header + d-pad
    availableH = Math.max(availableH, 200);

    var size = Math.min(availableW, availableH);
    size = Math.max(size, 200); // absolute minimum canvas size

    canvas.width  = size;
    canvas.height = size;

    cellSize = Math.max(1, Math.floor(size / CELLS_ACROSS));
    gridW    = Math.max(MIN_GRID, Math.floor(canvas.width  / cellSize));
    gridH    = Math.max(MIN_GRID, Math.floor(canvas.height / cellSize));
  }

  function handleResize() {
    if (window.innerWidth < MIN_SCREEN_PX) {
      // Screen shrank below the minimum — pause if playing.
      if (gameState === 'playing') {
        pauseGame();
      }
      return;
    }

    // If the game was never started (viewport was too small at load time),
    // initialise it now that there is enough room.
    if (!gameInitialized) {
      setupGame();
      return;
    }

    resizeCanvas();
    // Clamp snake segments to the new grid bounds so none are off-screen.
    for (var i = 0; i < snake.length; i++) {
      snake[i].x = Math.min(snake[i].x, gridW - 1);
      snake[i].y = Math.min(snake[i].y, gridH - 1);
    }
    // Clamp food position to new grid bounds.
    if (food) {
      food.x = Math.min(food.x, gridW - 1);
      food.y = Math.min(food.y, gridH - 1);
    }
  }

  // Pause the game on mobile orientation changes to avoid disorienting the player.
  function handleOrientationChange() {
    if (gameState === 'playing') {
      pauseGame();
    }
  }

  // ── High score (localStorage) ─────────────────────────────────────────────
  function loadHighScore() {
    try {
      var saved = parseInt(localStorage.getItem('snakeHighScore'), 10);
      if (!isNaN(saved) && saved > 0) {
        highScore = saved;
      }
    } catch (e) {
      highScore = 0;
    }
    updateHighScoreDisplay();
  }

  function saveHighScore() {
    try {
      localStorage.setItem('snakeHighScore', String(highScore));
    } catch (e) {}
  }

  // ── Score display helpers ─────────────────────────────────────────────────
  function updateScoreDisplay() {
    var el = document.getElementById('score');
    if (el) { el.textContent = score; }
  }

  function updateHighScoreDisplay() {
    var el = document.getElementById('high-score');
    if (el) { el.textContent = highScore; }
  }

  // ── Snake reset ───────────────────────────────────────────────────────────
  function resetSnake() {
    var midX = Math.floor(gridW / 2);
    var midY = Math.floor(gridH / 2);
    snake = [
      { x: midX,     y: midY },
      { x: midX - 1, y: midY },
      { x: midX - 2, y: midY }
    ];
    direction     = 'right';
    nextDirection = 'right';
    lastTickTime  = 0;
    score         = 0;
    currentTickMs = TICK_MS;
    food          = null;
    spawnFood();
  }

  // ── Overlay management ────────────────────────────────────────────────────
  function createOverlay() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'game-overlay';
    overlayEl.style.display = 'none';
    // Attach interaction handlers once on the overlay element.
    overlayEl.addEventListener('click', handleOverlayInteraction);
    overlayEl.addEventListener('touchend', handleOverlayInteraction, { passive: false });
    canvas.parentElement.appendChild(overlayEl);
  }

  function showStartOverlay() {
    gameState = 'start';
    overlayEl.innerHTML =
      '<div class="overlay-content">' +
        '<div class="overlay-title">SNAKE</div>' +
        '<div class="overlay-instructions">Press Space / Tap to Start</div>' +
      '</div>';
    overlayEl.style.display = 'flex';
  }

  function showPauseOverlay() {
    overlayEl.innerHTML =
      '<div class="overlay-content">' +
        '<div class="overlay-title">PAUSED</div>' +
        '<div class="overlay-instructions">Press Space or Esc to Resume</div>' +
      '</div>';
    overlayEl.style.display = 'flex';
  }

  function showGameOverOverlay() {
    if (score > highScore) {
      highScore = score;
      saveHighScore();
      updateHighScoreDisplay();
    }
    overlayEl.innerHTML =
      '<div class="overlay-content">' +
        '<div class="overlay-title">GAME OVER</div>' +
        '<div class="overlay-score">Score: ' + score + '</div>' +
        '<div class="overlay-score">Best: ' + highScore + '</div>' +
        '<button class="overlay-btn" id="play-again-btn">Play Again</button>' +
      '</div>';
    overlayEl.style.display = 'flex';
    var btn = document.getElementById('play-again-btn');
    if (btn) {
      btn.addEventListener('click', restartGame);
    }
  }

  function hideOverlay() {
    if (overlayEl) {
      overlayEl.style.display = 'none';
    }
  }

  // ── Game state transitions ─────────────────────────────────────────────────
  function startGame() {
    hideOverlay();
    gameState    = 'playing';
    lastTickTime = 0;
  }

  function pauseGame() {
    gameState = 'paused';
    showPauseOverlay();
  }

  function resumeGame() {
    hideOverlay();
    gameState    = 'playing';
    lastTickTime = 0;
  }

  function restartGame() {
    resetSnake();
    updateScoreDisplay();
    hideOverlay();
    gameState    = 'playing';
    lastTickTime = 0;
  }

  // ── Food ──────────────────────────────────────────────────────────────────

  // Returns true if the given {x, y} position overlaps any snake segment.
  function isOnSnake(pos) {
    for (var i = 0; i < snake.length; i++) {
      if (snake[i].x === pos.x && snake[i].y === pos.y) {
        return true;
      }
    }
    return false;
  }

  // Place food at a random grid cell that is not occupied by the snake.
  function spawnFood() {
    var pos;
    var attempts = 0;
    var maxAttempts = gridW * gridH;
    do {
      pos = {
        x: Math.floor(Math.random() * gridW),
        y: Math.floor(Math.random() * gridH)
      };
      attempts++;
    } while (isOnSnake(pos) && attempts < maxAttempts);
    food = pos;
  }

  // ── Game tick (logic) ─────────────────────────────────────────────────────
  function gameTick() {
    // Commit the buffered direction exactly once per tick.
    direction = nextDirection;

    var head    = snake[0];
    var newHead = { x: head.x, y: head.y };

    switch (direction) {
      case 'up':    newHead.y -= 1; break;
      case 'down':  newHead.y += 1; break;
      case 'left':  newHead.x -= 1; break;
      case 'right': newHead.x += 1; break;
    }

    // Wall collision — game over if head moves outside the grid.
    if (newHead.x < 0 || newHead.x >= gridW ||
        newHead.y < 0 || newHead.y >= gridH) {
      gameState = 'gameover';
      triggerEvent('gameover', { score: score });
      showGameOverOverlay();
      return;
    }

    // Self-collision — game over if head overlaps any existing body segment.
    for (var i = 0; i < snake.length; i++) {
      if (newHead.x === snake[i].x && newHead.y === snake[i].y) {
        gameState = 'gameover';
        triggerEvent('gameover', { score: score });
        showGameOverOverlay();
        return;
      }
    }

    // Check whether the new head lands on food before moving the snake.
    var ateFood = food && newHead.x === food.x && newHead.y === food.y;

    // Advance snake: prepend new head.
    snake.unshift(newHead);

    if (ateFood) {
      // Growth: keep the tail segment (don't pop) so the snake lengthens by 1.
      score += 1;
      updateScoreDisplay();
      // Progressive difficulty: decrease tick interval every TICK_LEVEL_EVERY food items.
      var level = Math.floor(score / TICK_LEVEL_EVERY);
      currentTickMs = Math.max(TICK_MIN_MS, TICK_MS - level * TICK_STEP_MS);
      triggerEvent('eat', { score: score });
      spawnFood();
    } else {
      snake.pop();
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  function renderLoop(timestamp) {
    animFrameId = requestAnimationFrame(renderLoop);

    if (gameState === 'playing' && timestamp - lastTickTime >= currentTickMs) {
      lastTickTime = timestamp;
      gameTick();
    }

    render(timestamp);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function render(timestamp) {
    // Dark background
    ctx.fillStyle = '#080810';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Effects — background layer (particles behind snake, etc.)
    if (window.SnakeEffects && typeof window.SnakeEffects.render === 'function') {
      window.SnakeEffects.render(ctx, getState(), 'background', timestamp);
    }

    // Food
    if (food) {
      drawFood();
    }

    // Snake segments
    drawSnake();

    // Effects — overlay layer (particles in front, screen-shake, etc.)
    if (window.SnakeEffects && typeof window.SnakeEffects.render === 'function') {
      window.SnakeEffects.render(ctx, getState(), 'overlay', timestamp);
    }
  }

  function drawSnake() {
    var len = snake.length;

    for (var i = len - 1; i >= 0; i--) {
      var seg = snake[i];
      var px  = seg.x * cellSize + 1;
      var py  = seg.y * cellSize + 1;
      var sz  = cellSize - 2;

      if (i === 0) {
        // Head — full brightness with stronger glow
        ctx.fillStyle  = '#00ff88';
        ctx.shadowBlur  = 14;
        ctx.shadowColor = '#00ff88';
      } else {
        // Body — fade from bright to dim tail
        var fade = 1 - (i / len) * 0.55;
        var g    = Math.round(204 * fade);
        var b    = Math.round(102 * fade);
        ctx.fillStyle  = 'rgba(0,' + g + ',' + b + ',1)';
        ctx.shadowBlur  = 7;
        ctx.shadowColor = '#00cc66';
      }

      ctx.fillRect(px, py, sz, sz);
    }

    // Reset shadow to avoid bleeding onto other draw calls.
    ctx.shadowBlur = 0;
  }

  function drawFood() {
    var px = food.x * cellSize + 2;
    var py = food.y * cellSize + 2;
    var sz = cellSize - 4;

    ctx.fillStyle  = '#ff6600';
    ctx.shadowBlur  = 12;
    ctx.shadowColor = '#ff8800';
    ctx.fillRect(px, py, sz, sz);
    ctx.shadowBlur = 0;
  }

  // ── Input: state control keys (Space / Escape) ────────────────────────────
  // Directional input (arrow keys + WASD) is handled exclusively by controls.js.
  function handleKeyDown(e) {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (gameState === 'start') {
          startGame();
        } else if (gameState === 'paused') {
          resumeGame();
        } else if (gameState === 'gameover') {
          restartGame();
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (gameState === 'playing') {
          pauseGame();
        } else if (gameState === 'paused') {
          resumeGame();
        }
        break;
    }
  }

  // Tapping the overlay starts or resumes the game (mobile + desktop).
  // The game-over Play Again button has its own dedicated click handler.
  function handleOverlayInteraction(e) {
    if (e.type === 'touchend') {
      e.preventDefault();
    }
    if (gameState === 'start') {
      startGame();
    } else if (gameState === 'paused') {
      resumeGame();
    }
    // gameState === 'gameover': handled exclusively by the Play Again button.
  }

  // Auto-pause when the browser tab is hidden (e.g. user switches tabs).
  function handleVisibilityChange() {
    if (document.hidden && gameState === 'playing') {
      pauseGame();
    }
  }

  // ── Event system ──────────────────────────────────────────────────────────
  function on(type, handler) {
    if (!eventHandlers[type]) {
      eventHandlers[type] = [];
    }
    eventHandlers[type].push(handler);
  }

  function triggerEvent(type, data) {
    var handlers = eventHandlers[type];
    if (handlers) {
      for (var i = 0; i < handlers.length; i++) {
        handlers[i](data);
      }
    }
    // Forward to effects module if it has registered a listener.
    if (window.SnakeEffects && typeof window.SnakeEffects.onEvent === 'function') {
      window.SnakeEffects.onEvent(type, data);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  // Exposed as window.SnakeGame so controls.js and effects.js can integrate.

  function setDirection(dir) {
    if (gameState !== 'playing') { return; }
    var opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (dir !== opposites[direction]) {
      nextDirection = dir;
    }
  }

  function getState() {
    return {
      snake:     snake,
      food:      food,
      score:     score,
      gameState: gameState,
      direction: direction,
      cellSize:  cellSize,
      gridW:     gridW,
      gridH:     gridH
    };
  }

  window.SnakeGame = {
    setDirection: setDirection,
    getState:     getState,
    on:           on,
    // Exposed for external reset calls:
    resetSnake:   resetSnake,
    // Expose tick configuration (returns/sets the live interval, not the base constant):
    getTickMs: function ()      { return currentTickMs; },
    setTickMs: function (ms)    { currentTickMs = ms; },
    // Expose game-state setter for external modules:
    setGameState: function (s)  { gameState = s; },
    // Expose food/score setters for external modules:
    setFood:      function (f)  { food = f; },
    setScore:     function (n)  { score = n; },
    triggerEvent: triggerEvent
  };

  // ── Boot ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
