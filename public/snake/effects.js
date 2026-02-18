/* Snake Effects — Phase 4
 * Particle system, trail effects, food burst, neon glow, food pulse, screen shake.
 *
 * Integrates with game.js via:
 *   SnakeEffects.render(ctx, gameState, layer, timestamp)
 *   SnakeEffects.onEvent(eventType, data)
 *
 * Render is called twice per frame by game.js:
 *   layer='background' — before food/snake are drawn (glow halos, trail particles)
 *   layer='overlay'    — after food/snake are drawn (burst particles, screen-shake restore)
 *
 * Screen shake: ctx.save() + ctx.translate() applied in 'background', restored in 'overlay',
 * so all game elements drawn between the two calls shake together.
 */
(function () {
  'use strict';

  // ── Particle ───────────────────────────────────────────────────────────────

  /**
   * @param {number} x      Canvas pixel X
   * @param {number} y      Canvas pixel Y
   * @param {number} vx     Velocity X in px/ms
   * @param {number} vy     Velocity Y in px/ms
   * @param {number} life   Lifetime in ms
   * @param {string} color  CSS color string
   * @param {number} size   Radius in px at full life
   */
  function Particle(x, y, vx, vy, life, color, size) {
    this.x       = x;
    this.y       = y;
    this.vx      = vx;
    this.vy      = vy;
    this.life    = life;
    this.maxLife = life;
    this.color   = color;
    this.size    = size;
  }

  Particle.prototype.update = function (dt) {
    this.x    += this.vx * dt;
    this.y    += this.vy * dt;
    this.life -= dt;
    // Gentle drag so particles decelerate naturally
    this.vx   *= 0.97;
    this.vy   *= 0.97;
  };

  Particle.prototype.isAlive = function () {
    return this.life > 0;
  };

  Particle.prototype.render = function (ctx) {
    var alpha  = Math.max(0, this.life / this.maxLife);
    // Shrink slightly as the particle fades; keep a minimum size while visible
    var radius = this.size * (0.25 + alpha * 0.75);
    if (radius < 0.4) { return; }

    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.shadowBlur  = radius * 4;
    ctx.shadowColor = this.color;
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // ── Module state ──────────────────────────────────────────────────────────

  var particles     = [];   // active Particle instances
  var lastTimestamp = 0;    // previous frame timestamp (ms)
  var trailTimer    = 0;    // accumulated ms since last trail emission

  // Screen shake
  var shakeRemaining = 0;   // ms of shake left
  var shakeDuration  = 0;   // total shake duration (for intensity ramp-down)
  var shakeAmplitude = 0;   // max pixel displacement
  var shakeX         = 0;   // current-frame X offset (px)
  var shakeY         = 0;   // current-frame Y offset (px)

  // ── Color palettes ────────────────────────────────────────────────────────

  var TRAIL_COLORS = ['#00ff88', '#00ccff', '#00ff44', '#22ffaa', '#00ffcc'];
  var BURST_COLORS = ['#ffdd00', '#ffaa00', '#ff8800', '#ffff44', '#ffffaa', '#ffffff'];

  // ── Emission helpers ──────────────────────────────────────────────────────

  /**
   * Emit a small cluster of trail particles at a snake-segment canvas position.
   * @param {{x:number,y:number}} seg   Grid-coordinate segment
   * @param {number}              cs    Cell size in px
   */
  function emitTrail(seg, cs) {
    var cx = seg.x * cs + cs * 0.5;
    var cy = seg.y * cs + cs * 0.5;
    for (var i = 0; i < 2; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 0.01 + Math.random() * 0.025; // slow drift, px/ms
      particles.push(new Particle(
        cx + (Math.random() - 0.5) * cs * 0.5,
        cy + (Math.random() - 0.5) * cs * 0.5,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        160 + Math.random() * 200,   // 160–360 ms lifetime
        TRAIL_COLORS[Math.floor(Math.random() * TRAIL_COLORS.length)],
        1 + Math.random() * 2        // 1–3 px radius
      ));
    }
  }

  /**
   * Emit a radial burst of particles at a canvas pixel position (food eaten).
   * @param {number} cx  Canvas pixel X (centre of burst)
   * @param {number} cy  Canvas pixel Y (centre of burst)
   */
  function emitBurst(cx, cy) {
    var count = 18;
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      var speed = 0.07 + Math.random() * 0.11; // faster than trail, px/ms
      particles.push(new Particle(
        cx,
        cy,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        400 + Math.random() * 400,   // 400–800 ms lifetime
        BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
        3 + Math.random() * 4        // 3–7 px radius
      ));
    }
  }

  // ── Screen shake ──────────────────────────────────────────────────────────

  function startShake(duration, amplitude) {
    shakeRemaining = duration;
    shakeDuration  = duration;
    shakeAmplitude = amplitude;
  }

  function updateShake(dt) {
    if (shakeRemaining <= 0) {
      shakeX = 0;
      shakeY = 0;
      return;
    }
    shakeRemaining  = Math.max(0, shakeRemaining - dt);
    var intensity   = shakeRemaining / shakeDuration; // 1 → 0 as shake winds down
    var amp         = shakeAmplitude * intensity;
    shakeX = (Math.random() * 2 - 1) * amp;
    shakeY = (Math.random() * 2 - 1) * amp;
  }

  // ── Glow draw helpers ─────────────────────────────────────────────────────

  /**
   * Draw a pulsing golden halo behind the food item.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{food:Object,cellSize:number}} state
   * @param {number} timestamp  rAF timestamp (ms)
   */
  function drawFoodGlow(ctx, state, timestamp) {
    var food = state.food;
    if (!food) { return; }

    var cs    = state.cellSize;
    var cx    = food.x * cs + cs * 0.5;
    var cy    = food.y * cs + cs * 0.5;

    // Gentle pulse: ~1.75 Hz (period ≈ 570 ms)
    var pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.011);
    var glowR = cs * 0.42 + pulse * cs * 0.22;
    var alpha = 0.18 + pulse * 0.32;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur  = glowR * 2.5;
    ctx.shadowColor = '#ffaa00';
    ctx.fillStyle   = '#ffcc44';
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw an extra soft green halo behind the snake head.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{snake:Array,cellSize:number}} state
   */
  function drawSnakeHeadGlow(ctx, state) {
    var snake = state.snake;
    if (!snake || snake.length === 0) { return; }

    var cs   = state.cellSize;
    var head = snake[0];
    var cx   = head.x * cs + cs * 0.5;
    var cy   = head.y * cs + cs * 0.5;

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.shadowBlur  = cs * 2;
    ctx.shadowColor = '#00ff88';
    ctx.fillStyle   = '#00ff88';
    ctx.beginPath();
    ctx.arc(cx, cy, cs * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Public: onEvent ──────────────────────────────────────────────────────

  /**
   * Called by game.js triggerEvent() for game events.
   * @param {string} type  'eat' | 'gameover'
   * @param {Object} data  Event payload
   */
  function onEvent(type, data) {
    if (type === 'eat') {
      // After 'eat', the snake head occupies the cell where food was consumed.
      var game = window.SnakeGame;
      if (game) {
        var state = game.getState();
        if (state && state.snake && state.snake.length > 0) {
          var cs   = state.cellSize;
          var head = state.snake[0];
          emitBurst(
            head.x * cs + cs * 0.5,
            head.y * cs + cs * 0.5
          );
        }
      }
    } else if (type === 'gameover') {
      startShake(650, 9);
    }
  }

  // ── Public: render ────────────────────────────────────────────────────────

  /**
   * Called by game.js render() before ('background') and after ('overlay')
   * the food and snake are drawn.
   *
   * 'background': update state, apply shake transform, draw glow halos.
   * 'overlay':    draw particles on top, then restore the shake transform.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object}                  state      Output of game.getState()
   * @param {string}                  layer      'background' | 'overlay'
   * @param {number}                  timestamp  rAF timestamp (ms)
   */
  function render(ctx, state, layer, timestamp) {
    if (!state) { return; }

    if (layer === 'background') {
      // ── Update ──
      var dt = lastTimestamp > 0 ? timestamp - lastTimestamp : 0;
      // Cap dt to avoid particle explosions after long tab-switch gaps.
      if (dt > 200) { dt = 200; }
      lastTimestamp = timestamp;

      updateShake(dt);

      // Update particles and discard dead ones.
      var alive = [];
      for (var i = 0; i < particles.length; i++) {
        particles[i].update(dt);
        if (particles[i].isAlive()) {
          alive.push(particles[i]);
        }
      }
      particles = alive;

      // Emit trail particles while playing (throttled: every 100 ms).
      if (state.gameState === 'playing' && state.snake && state.snake.length > 1) {
        trailTimer += dt;
        if (trailTimer >= 100) {
          trailTimer = 0;
          // Emit from body segments (skip head at index 0).
          var limit = Math.min(state.snake.length, 7);
          for (var j = 1; j < limit; j++) {
            emitTrail(state.snake[j], state.cellSize);
          }
        }
      } else {
        trailTimer = 0;
      }

      // ── Apply screen-shake transform ──
      // ctx.save() is always called here; ctx.restore() is called in 'overlay'.
      // This causes food and snake (drawn between the two calls) to shift with the shake.
      ctx.save();
      if (shakeX !== 0 || shakeY !== 0) {
        ctx.translate(shakeX, shakeY);
      }

      // ── Draw glow halos (behind food and snake sprites) ──
      if (state.gameState === 'playing' || state.gameState === 'paused') {
        drawFoodGlow(ctx, state, timestamp);
        drawSnakeHeadGlow(ctx, state);
      }

    } else if (layer === 'overlay') {
      // ── Draw particles on top of food and snake (still in shaken coords) ──
      for (var k = 0; k < particles.length; k++) {
        particles[k].render(ctx);
      }

      // ── Restore the shake transform applied in 'background' ──
      ctx.restore();
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  window.SnakeEffects = {
    render:  render,
    onEvent: onEvent
  };

}());
