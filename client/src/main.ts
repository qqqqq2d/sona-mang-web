import { GameState, ClientPhase, createInitialState } from './state';
import { initRenderer, render } from './renderer';
import { setupInputHandlers } from './input';
import { initAudio, loadAllSounds, playSound } from './audio';
import { processMessages } from './network';

let state: GameState;
let lastTime = 0;

async function init(): Promise<void> {
  // Initialize state
  state = createInitialState();

  // Initialize renderer
  if (!initRenderer()) {
    console.error('Failed to initialize renderer');
    return;
  }

  // Initialize audio
  await initAudio();
  await loadAllSounds();

  // Setup input handlers
  setupInputHandlers(state);

  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function gameLoop(currentTime: number): void {
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  // Update
  update(deltaTime);

  // Render
  render(state);

  // Continue loop
  requestAnimationFrame(gameLoop);
}

function update(deltaTime: number): void {
  // Process network messages
  processMessages(state);

  // Update animation time
  state.animTime += deltaTime;
  state.menuTransitionTime += deltaTime;

  // Update turn timer (client-side prediction)
  if (state.phase === ClientPhase.PLAYING || state.phase === ClientPhase.SPECTATING) {
    state.turnTimer -= deltaTime;
    if (state.turnTimer < 0) {
      state.turnTimer = 0;
    }

    // Timer tick sound logic - play at 5, 3, 2, 1 seconds
    const prev = state.prevTurnTimer;
    const curr = state.turnTimer;
    const tickTimes = [5, 3, 2, 1];

    // Reset prevTurnTimer when turn changes
    if (state.currentTurnPlayerId !== state.prevTurnPlayerId && state.currentTurnPlayerId !== '') {
      state.prevTurnPlayerId = state.currentTurnPlayerId;
      state.prevTurnTimer = state.turnTimer;
    } else {
      // Play at specific second thresholds
      for (const t of tickTimes) {
        if (prev > t && curr <= t) {
          playSound('timer_tick', 0.2);
          state.timerTickFlash = true;
          state.timerTickFlashOpacity = 1.0;
          break;
        }
      }
    }

    state.prevTurnTimer = curr;
  }

  // Update visual effects
  updateWrongAnswerFlash(deltaTime);
  updateCorrectAnswerFlash(deltaTime);
  updateTimeoutFlash(deltaTime);
  updateTimerTickFlash(deltaTime);
  updateButtonHighlights(deltaTime);
  updateViewTransition(deltaTime);

  // Handle pending sounds
  if (state.pendingCorrectSound) {
    playSound('correct', 0.5);
    state.pendingCorrectSound = false;
  }
  if (state.pendingWrongSound) {
    playSound('wrong', 0.5);
    state.pendingWrongSound = false;
  }
  if (state.pendingTurnOverSound) {
    playSound('turn_over', 0.5);
    state.pendingTurnOverSound = false;
    state.timerTickFlash = true;
    state.timerTickFlashOpacity = 1.0;
  }
}

function updateWrongAnswerFlash(deltaTime: number): void {
  if (!state.wrongAnswerFlash) return;

  const speed = deltaTime * 1.0;

  if (state.wrongAnswerOpacityUp) {
    state.wrongAnswerOpacity += speed;
    if (state.wrongAnswerOpacity >= 0.15) {
      state.wrongAnswerOpacity = 0.15;
      state.wrongAnswerOpacityUp = false;
    }
  } else {
    state.wrongAnswerOpacity -= speed * 0.5;
    if (state.wrongAnswerOpacity <= 0) {
      state.wrongAnswerOpacity = 0;
      state.wrongAnswerFlash = false;
      state.wrongAnswerOpacityUp = true;
    }
  }
}

function updateCorrectAnswerFlash(deltaTime: number): void {
  if (!state.correctAnswerFlash) return;

  const speed = deltaTime * 0.3;
  state.correctAnswerOpacity -= speed;

  if (state.correctAnswerOpacity <= 0) {
    state.correctAnswerOpacity = 0;
    state.correctAnswerFlash = false;
  }
}

function updateTimerTickFlash(deltaTime: number): void {
  if (!state.timerTickFlash) return;

  const speed = deltaTime * 1.0; // Fast fade
  state.timerTickFlashOpacity -= speed;

  if (state.timerTickFlashOpacity <= 0) {
    state.timerTickFlashOpacity = 0;
    state.timerTickFlash = false;
  }
}

function updateTimeoutFlash(deltaTime: number): void {
  if (!state.timeoutFlash) return;

  const speed = deltaTime * 1.5;

  if (state.timeoutOpacityUp) {
    state.timeoutOpacity += speed;
    if (state.timeoutOpacity >= 0.6) {
      state.timeoutOpacity = 0.6;
      state.timeoutOpacityUp = false;
    }
  } else {
    state.timeoutOpacity -= speed;
    if (state.timeoutOpacity <= 0) {
      state.timeoutOpacity = 0;
      state.timeoutFlash = false;
      state.timeoutOpacityUp = true;
    }
  }
}

function updateButtonHighlights(deltaTime: number): void {
  const speed = deltaTime * 8; // Fast fade

  // Update menu item highlights
  for (let i = 0; i < state.menuHighlightOpacity.length; i++) {
    const isActive = i === state.menuHoveredIndex || i === state.menuPressedIndex;
    if (isActive) {
      state.menuHighlightOpacity[i] = Math.min(1, state.menuHighlightOpacity[i] + speed);
    } else {
      state.menuHighlightOpacity[i] = Math.max(0, state.menuHighlightOpacity[i] - speed);
    }
  }

  // Update button highlights
  const allButtons = ['back', 'continue', 'create', 'refresh', 'ready', 'start', 'failed', 'info'];
  for (const button of allButtons) {
    const isActive = button === state.hoveredButton || button === state.pressedButton;
    const current = state.buttonHighlightOpacity[button] || 0;
    if (isActive) {
      state.buttonHighlightOpacity[button] = Math.min(1, current + speed);
    } else {
      state.buttonHighlightOpacity[button] = Math.max(0, current - speed);
    }
  }
}

function updateViewTransition(deltaTime: number): void {
  const isGamePhase = state.phase === ClientPhase.PLAYING || state.phase === ClientPhase.SPECTATING;
  const wasGamePhase = state.previousGamePhase === ClientPhase.PLAYING || state.previousGamePhase === ClientPhase.SPECTATING;

  // Detect transition between PLAYING and SPECTATING
  if (isGamePhase && wasGamePhase && state.phase !== state.previousGamePhase && !state.viewTransitionActive) {
    // Start fade out transition, keep rendering old phase
    state.viewTransitionActive = true;
    state.viewTransitionFadingOut = true;
    state.pendingPhase = state.phase;
    state.renderPhase = state.previousGamePhase;
  }

  // Update previous phase
  state.previousGamePhase = state.phase;

  // Set renderPhase and displayCombo when not transitioning
  if (!state.viewTransitionActive) {
    state.renderPhase = state.phase;
    state.displayCombo = state.currentCombo;
  }

  // Animate transition
  if (state.viewTransitionActive) {
    const speed = deltaTime * 1.5; // Transition speed

    if (state.viewTransitionFadingOut) {
      // Fade to black
      state.viewTransitionOpacity += speed;
      if (state.viewTransitionOpacity >= 1) {
        state.viewTransitionOpacity = 1;
        state.viewTransitionFadingOut = false;
        // Switch to new view and combo at peak black
        state.renderPhase = state.pendingPhase;
        state.displayCombo = state.currentCombo;
      }
    } else {
      // Fade from black
      state.viewTransitionOpacity -= speed;
      if (state.viewTransitionOpacity <= 0) {
        state.viewTransitionOpacity = 0;
        state.viewTransitionActive = false;
        state.pendingPhase = null;
      }
    }
  }
}

// Start the game
init().catch(console.error);
