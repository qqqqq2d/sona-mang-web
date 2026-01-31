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
  }

  // Update visual effects
  updateWrongAnswerFlash(deltaTime);
  updateCorrectAnswerFlash(deltaTime);
  updateTimeoutFlash(deltaTime);

  // Handle pending sounds
  if (state.pendingCorrectSound) {
    playSound('correct', 0.5);
    state.pendingCorrectSound = false;
  }
  if (state.pendingWrongSound) {
    playSound('wrong', 0.5);
    state.pendingWrongSound = false;
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

// Start the game
init().catch(console.error);
