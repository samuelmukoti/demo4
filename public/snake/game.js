/* Snake Game — Core Engine
 * Phase 2, subtask 2-1: canvas setup, render loop, grid system, snake, arrow keys.
 * Phase 2, subtask 2-2: food spawning, wall/self collision, score, snake growth.
 * Game-state screens (start/pause/gameover) are added in subtask 2-3.
 */
(function () {
  'use strict';

  // ── Configuration ─────────────────────────────────────────────────────────
  var CELLS_ACROSS = 20;   // target number of columns (also rows — square grid)
  var TICK_MS      = 150;  // ms between game logic ticks (adjustable for speed)

  // ── Module state ──────────────────────────────────────────────────────────
  var canvas, ctx;
  var cellSize, gridW, gridH;

  // Snake: array of {x, y} cell objects; index 0 is the head.
  var snake = [];
  var direction     = 'right';
  var nextDirection = 'right';

  // Food, score and gameState are managed here so subtasks 2-2 / 2-3 can
  // patch them in without restructuring the file.
  var food      = null;   // {x, y} — set by subtask 2-2
  var score     = 0;      // incremented by subtask 2-2
  var gameState = 'playing'; // expanded to start/paused/gameover in subtask 2-3

  var lastTickTime = 0;
  var animFrameId  = null;

  // Event-handler registry (used by effects.js / controls.js hooks).
  var eventHandlers = {};

  // ── Initialisation ────────────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('game-canvas');
    if (!canvas || !canvas.getContext) {
      return; // Canvas not supported — fallback text shown by jade template
    }
    ctx = canvas.getContext('2d');

    resizeCanvas();
    resetSnake();

    // Hook external modules in if they have already loaded.
    if (window.SnakeControls && typeof window.SnakeControls.init === 'function') {
      window.SnakeControls.init(window.SnakeGame);
    }

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

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

    cellSize = Math.floor(size / CELLS_ACROSS);
    gridW    = Math.floor(canvas.width  / cellSize);
    gridH    = Math.floor(canvas.height / cellSize);
  }

  function handleResize() {
    resizeCanvas();
    // Clamp snake segments to the new grid bounds so none are off-screen.
    for (var i = 0; i < snake.length; i++) {
      snake[i].x = Math.min(snake[i].x, gridW - 1);
      snake[i].y = Math.min(snake[i].y, gridH - 1);
    }
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
    food          = null;
    spawnFood();
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
  // Called at a fixed interval derived from TICK_MS.
  // Subtask 2-3 will add state guards (start/pause/gameover screens).
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
      return;
    }

    // Self-collision — game over if head overlaps any existing body segment.
    for (var i = 0; i < snake.length; i++) {
      if (newHead.x === snake[i].x && newHead.y === snake[i].y) {
        gameState = 'gameover';
        triggerEvent('gameover', { score: score });
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
      triggerEvent('eat', { score: score });
      spawnFood();
    } else {
      snake.pop();
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  function renderLoop(timestamp) {
    animFrameId = requestAnimationFrame(renderLoop);

    if (gameState === 'playing' && timestamp - lastTickTime >= TICK_MS) {
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

    // Food — rendered by drawFood(); no-op until subtask 2-2 sets food.
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

  // ── Input: arrow keys (minimal — delegated to controls.js in subtask 3-1) ─
  function handleKeyDown(e) {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setDirection('up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        setDirection('down');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setDirection('left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        setDirection('right');
        break;
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
    // Exposed for subtask 2-2 / 2-3 to call when resetting game state:
    resetSnake:   resetSnake,
    // Expose tick configuration for subtask 5-1 (progressive difficulty):
    getTickMs: function ()      { return TICK_MS; },
    setTickMs: function (ms)    { TICK_MS = ms; },
    // Expose game-state setter for subtask 2-3:
    setGameState: function (s)  { gameState = s; },
    // Expose food/score setters for subtask 2-2:
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
