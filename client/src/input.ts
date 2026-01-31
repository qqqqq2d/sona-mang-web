import { GameState, ClientPhase, isMyTurn, getLocalPlayer, getReadyCount } from './state';
import { PlayerState, MIN_PLAYERS } from './protocol';
import * as network from './network';
import { playSound } from './audio';

// Reference resolution for touch calculations (must match renderer.ts)
const REFERENCE_WIDTH = 640;
const REFERENCE_HEIGHT = 480;

// Mobile detection (coarse pointer = touch screen)
const isMobile = (): boolean => {
  return window.matchMedia('(pointer: coarse)').matches;
};

// Offscreen canvas for text measurement
let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!measureCtx) {
    measureCanvas = document.createElement('canvas');
    measureCtx = measureCanvas.getContext('2d');
  }
  return measureCtx;
}

// Menu item hitbox detection - must match renderer box dimensions exactly
function getMenuItemAtPoint(refX: number, refY: number, scale: number): number {
  const ctx = getMeasureContext();
  if (!ctx) return -1;

  const centerX = 320; // REFERENCE_WIDTH / 2
  const menuPositions = [220, 300]; // Must match renderer menuY values
  const menuItems = ['CREATE GAME', 'JOIN GAME'];
  const boxPaddingX = 20;
  const boxPaddingY = 8;
  const textSize = Math.round(40 * scale);

  ctx.font = `${textSize}px sans-serif`;

  for (let i = 0; i < menuPositions.length; i++) {
    const textWidth = ctx.measureText(menuItems[i]).width / scale;
    const boxWidth = textWidth + boxPaddingX * 2;
    const boxHeight = 40 + boxPaddingY * 2;
    const boxX = centerX - boxWidth / 2;
    const boxY = menuPositions[i] - boxPaddingY;

    if (refX >= boxX && refX <= boxX + boxWidth &&
        refY >= boxY && refY <= boxY + boxHeight) {
      return i;
    }
  }
  return -1;
}

// Button definitions: name -> [refX, refY, refWidth, refHeight]
// Must match the button positions in renderer.ts
const BUTTON_DEFS: { [phase: string]: { [name: string]: [number, number, number, number] } } = {
  [ClientPhase.SERVER_CONNECT]: {
    'back': [10, 10, 95, 35],
    'continue': [320 - 60, 260, 120, 40],
  },
  [ClientPhase.LOBBY_CREATE]: {
    'back': [10, 10, 95, 35],
    'create': [320 - 60, 260, 120, 40],
  },
  [ClientPhase.LOBBY_JOIN]: {
    'back': [10, 10, 95, 35],
    'refresh': [640 - 90, 10, 80, 35],
  },
  [ClientPhase.LOBBY_WAITING]: {
    'back': [10, 10, 95, 35],
    // ready and start buttons use dynamic positioning, handled separately
  },
  [ClientPhase.GAME_OVER]: {
    'continue': [320 - 80, 360, 160, 45],
    'failed': [320 - 100, 420, 200, 40],
    // 'back' button in failed combos view is handled dynamically
  },
};

// Check which button is at a point, returns button name or null
function getButtonAtPoint(phase: ClientPhase, refX: number, refY: number): string | null {
  const buttons = BUTTON_DEFS[phase];
  if (!buttons) return null;

  for (const [name, [bx, by, bw, bh]] of Object.entries(buttons)) {
    if (refX >= bx && refX <= bx + bw && refY >= by && refY <= by + bh) {
      return name;
    }
  }
  return null;
}

// Estonian character handling
const ESTONIAN_UPPER: { [key: string]: string } = {
  'ä': 'Ä', 'ö': 'Ö', 'ü': 'Ü', 'õ': 'Õ', 'š': 'Š', 'ž': 'Ž',
};

// Hidden input element for mobile keyboard
let hiddenInput: HTMLInputElement | null = null;

export function toUpperEstonian(input: string): string {
  let result = '';
  for (const char of input) {
    if (ESTONIAN_UPPER[char]) {
      result += ESTONIAN_UPPER[char];
    } else {
      result += char.toUpperCase();
    }
  }
  return result;
}

export function isValidLetter(char: string): boolean {
  const upper = toUpperEstonian(char);
  // A-Z or Estonian special characters
  if (upper.length === 1 && upper >= 'A' && upper <= 'Z') return true;
  if ('ÄÖÜÕŠŽ'.includes(upper)) return true;
  return false;
}

export function setupInputHandlers(state: GameState): void {
  // Keyboard input
  document.addEventListener('keydown', (e) => handleKeyDown(e, state));

  // Create hidden input for mobile keyboard
  hiddenInput = document.createElement('input');
  hiddenInput.id = 'hidden-input';
  hiddenInput.style.cssText = 'position: fixed; top: 0; left: -9999px; opacity: 0;';
  hiddenInput.setAttribute('autocomplete', 'off');
  hiddenInput.setAttribute('autocapitalize', 'characters');
  hiddenInput.setAttribute('autocorrect', 'off');
  hiddenInput.setAttribute('spellcheck', 'false');
  hiddenInput.setAttribute('type', 'text');
  document.body.appendChild(hiddenInput);

  hiddenInput.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    const text = input.value;
    input.value = '';

    handleTextInput(state, text);
  });

  // Handle Enter key on mobile keyboard
  hiddenInput.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.phase === ClientPhase.PLAYING && isMyTurn(state) && state.localInput.length > 0) {
        network.submitWord(state.localInput);
      }
    }
  });

  // Touch/click handling
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  canvas.addEventListener('click', (e) => handleTap(e, state, canvas));

  // Touch start - track which menu item or button is being pressed
  canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    const refX = (touchX / rect.width) * REFERENCE_WIDTH;
    const refY = (touchY / rect.height) * REFERENCE_HEIGHT;
    const scale = Math.min(rect.width / REFERENCE_WIDTH, rect.height / REFERENCE_HEIGHT);

    // Check menu items (main menu only)
    if (state.phase === ClientPhase.MAIN_MENU) {
      state.menuPressedIndex = getMenuItemAtPoint(refX, refY, scale);
    }

    // Check buttons
    const button = getButtonAtPoint(state.phase, refX, refY);
    state.pressedButton = button;
  });

  // Touch end - handle tap and clear pressed state
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Clear pressed state
    state.menuPressedIndex = -1;
    state.pressedButton = null;

    handleTapAt(state, x, y, rect.width, rect.height);
  });

  // Touch cancel - clear pressed state
  canvas.addEventListener('touchcancel', () => {
    state.menuPressedIndex = -1;
    state.pressedButton = null;
  });

  // Mouse move for hover detection
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert to reference coordinates
    const refX = (mouseX / rect.width) * REFERENCE_WIDTH;
    const refY = (mouseY / rect.height) * REFERENCE_HEIGHT;
    const scale = Math.min(rect.width / REFERENCE_WIDTH, rect.height / REFERENCE_HEIGHT);

    // Main menu hover
    if (state.phase === ClientPhase.MAIN_MENU) {
      const newSelection = getMenuItemAtPoint(refX, refY, scale);
      state.menuHoveredIndex = newSelection;

      if (newSelection !== -1 && state.menuSelectedIndex !== newSelection) {
        state.prevSelectedIndex = state.menuSelectedIndex;
        state.menuSelectedIndex = newSelection;
        state.menuTransitionTime = 0;
        playSound('selection', 0.3);
      }
    } else {
      state.menuHoveredIndex = -1;
    }

    // Button hover (all phases)
    let button = getButtonAtPoint(state.phase, refX, refY);

    // Check dynamic lobby waiting buttons
    if (state.phase === ClientPhase.LOBBY_WAITING && !button) {
      const centerX = REFERENCE_WIDTH / 2;
      const aspectRatio = rect.width / rect.height;
      const mobileBoost = aspectRatio < 1.0 ? 1.0 + (1.0 - aspectRatio) * 0.4 : 1.0;
      const buttonSpacing = 10 + (mobileBoost - 1) * 40;

      if (refX >= centerX - 100 - buttonSpacing && refX <= centerX - buttonSpacing &&
          refY >= 340 && refY <= 380) {
        button = 'ready';
      } else if (state.isHost && refX >= centerX + buttonSpacing && refX <= centerX + buttonSpacing + 100 &&
          refY >= 340 && refY <= 380) {
        button = 'start';
      }
    }

    // Handle game over buttons based on showFailedCombos state
    if (state.phase === ClientPhase.GAME_OVER) {
      if (state.showFailedCombos) {
        // Only back button visible in failed combos view
        button = null;
        const centerX = REFERENCE_WIDTH / 2;
        if (refX >= centerX - 60 && refX <= centerX + 60 &&
            refY >= 400 && refY <= 440) {
          button = 'back';
        }
      } else {
        // Hide 'failed' button if no failed combos
        if (button === 'failed' && state.failedCombos.length === 0) {
          button = null;
        }
      }
    }

    if (button !== state.hoveredButton) {
      state.hoveredButton = button;
      if (button !== null) {
        playSound('selection', 0.3);
      }
    }
  });

  // Mouse leave - clear hover state
  canvas.addEventListener('mouseleave', () => {
    state.menuHoveredIndex = -1;
    state.hoveredButton = null;
  });
}

function handleTextInput(state: GameState, text: string): void {
  if (state.phase === ClientPhase.PLAYING && isMyTurn(state)) {
    for (const char of text) {
      if (isValidLetter(char)) {
        state.localInput += toUpperEstonian(char);
        network.sendInput(state.localInput);
      }
    }
  } else if (state.phase === ClientPhase.SERVER_CONNECT) {
    // Only player name input
    for (const char of text) {
      if (state.playerName.length < 16 && /[a-zA-Z0-9_\- ]/.test(char)) {
        state.playerName += char;
      }
    }
  } else if (state.phase === ClientPhase.LOBBY_CREATE) {
    for (const char of text) {
      if (state.gameName.length < 20 && /[a-zA-Z0-9_\- ]/.test(char)) {
        state.gameName += char;
      }
    }
  }
}

function handleTap(e: MouseEvent, state: GameState, canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  handleTapAt(state, x, y, rect.width, rect.height);
}

// Padding for tap areas (makes buttons easier to tap on mobile)
const TAP_PADDING = 10;

function inTapArea(refX: number, refY: number, areaX: number, areaY: number, areaW: number, areaH: number): boolean {
  return refX >= areaX - TAP_PADDING &&
         refX <= areaX + areaW + TAP_PADDING &&
         refY >= areaY - TAP_PADDING &&
         refY <= areaY + areaH + TAP_PADDING;
}

function handleTapAt(state: GameState, tapX: number, tapY: number, winWidth: number, winHeight: number): void {
  // Convert tap position to reference coordinates
  const scaleX = winWidth / REFERENCE_WIDTH;
  const scaleY = winHeight / REFERENCE_HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  const refX = tapX / scaleX;
  const refY = tapY / scaleY;

  switch (state.phase) {
    case ClientPhase.MAIN_MENU:
      handleMainMenuTap(state, refX, refY, scale);
      break;
    case ClientPhase.SERVER_CONNECT:
      handleServerConnectTap(state, refX, refY);
      break;
    case ClientPhase.LOBBY_CREATE:
      handleLobbyCreateTap(state, refX, refY);
      break;
    case ClientPhase.LOBBY_JOIN:
      handleLobbyJoinTap(state, refX, refY);
      break;
    case ClientPhase.LOBBY_WAITING:
      handleLobbyWaitingTap(state, refX, refY);
      break;
    case ClientPhase.PLAYING:
    case ClientPhase.SPECTATING:
      handleGameTap(state, refX, refY);
      break;
    case ClientPhase.GAME_OVER:
      handleGameOverTap(state, refX, refY);
      break;
  }
}

function handleMainMenuTap(state: GameState, refX: number, refY: number, scale: number): void {
  const menuItem = getMenuItemAtPoint(refX, refY, scale);
  if (menuItem !== -1) {
    playSound('selected', 0.5);
    state.joiningGame = (menuItem === 1);
    state.phase = ClientPhase.SERVER_CONNECT;
  }
}

function autoConnectToServer(state: GameState): void {
  // Use the same host that served the page, with WebSocket port
  const host = window.location.hostname || 'localhost';
  const port = '8080'; // WebSocket server port
  const address = `${host}:${port}`;

  state.serverAddress = address;
  state.phase = ClientPhase.CONNECTING;

  network.connect(
    address,
    () => {
      // Connected
      state.connected = true;
      if (state.joiningGame) {
        state.phase = ClientPhase.LOBBY_JOIN;
        network.listGames();
      } else {
        state.phase = ClientPhase.LOBBY_CREATE;
      }
    },
    () => {
      // Disconnected - go back to main menu
      state.connected = false;
      state.phase = ClientPhase.MAIN_MENU;
      state.players = [];
    }
  );
}

function handleServerConnectTap(state: GameState, refX: number, refY: number): void {
  const centerX = REFERENCE_WIDTH / 2;

  // Back button (top-left) - matches drawButton('< Back', 10, 10, 70, 35)
  if (inTapArea(refX, refY, 10, 10, 95, 35)) {
    state.phase = ClientPhase.MAIN_MENU;
    playSound('selected', 0.5);
    return;
  }

  // Player name field - matches y(185) to y(185 + 40)
  if (inTapArea(refX, refY, 0, 185, REFERENCE_WIDTH, 40)) {
    focusHiddenInput();
    return;
  }

  // Continue button - matches drawButton('Continue', centerX - 60, 260, 120, 40)
  if (inTapArea(refX, refY, centerX - 60, 260, 120, 40)) {
    if (state.playerName.length > 0) {
      playSound('selected', 0.5);
      blurHiddenInput();
      autoConnectToServer(state);
    }
    return;
  }

  // Tap anywhere else to close keyboard
  blurHiddenInput();
}

function handleLobbyCreateTap(state: GameState, refX: number, refY: number): void {
  const centerX = REFERENCE_WIDTH / 2;

  // Back button (top-left) - matches drawButton('< Back', 10, 10, 70, 35)
  if (inTapArea(refX, refY, 10, 10, 95, 35)) {
    network.disconnect();
    state.phase = ClientPhase.MAIN_MENU;
    playSound('selected', 0.5);
    return;
  }

  // Game name field - matches y(185) to y(185 + 40)
  if (inTapArea(refX, refY, 0, 185, REFERENCE_WIDTH, 40)) {
    focusHiddenInput();
    return;
  }

  // Create button - matches drawButton('Create', centerX - 60, 260, 120, 40)
  if (inTapArea(refX, refY, centerX - 60, 260, 120, 40)) {
    if (state.gameName.length > 0) {
      playSound('selected', 0.5);
      blurHiddenInput();
      network.createGame(state.playerName, state.gameName);
    }
    return;
  }

  // Tap anywhere else to close keyboard
  blurHiddenInput();
}

function handleLobbyJoinTap(state: GameState, refX: number, refY: number): void {
  // Back button (top-left) - matches drawButton('< Back', 10, 10, 70, 35)
  if (inTapArea(refX, refY, 10, 10, 95, 35)) {
    network.disconnect();
    state.phase = ClientPhase.MAIN_MENU;
    playSound('selected', 0.5);
    return;
  }

  // Refresh button (top-right) - matches drawButton('Refresh', REFERENCE_WIDTH - 90, 10, 80, 35)
  if (inTapArea(refX, refY, REFERENCE_WIDTH - 90, 10, 80, 35)) {
    network.listGames();
    playSound('selection', 0.3);
    return;
  }

  // Games list - items start at y(190) with 32px spacing
  const gamesList = state.gamesList;
  const startY = 190;
  const itemHeight = 32;

  for (let i = 0; i < gamesList.length; i++) {
    const itemY = startY + i * itemHeight;
    if (inTapArea(refX, refY, 0, itemY, REFERENCE_WIDTH, itemHeight)) {
      state.menuSelectedIndex = i;
      playSound('selected', 0.5);
      network.joinGame(gamesList[i].id, state.playerName);
      return;
    }
  }
}

function handleLobbyWaitingTap(state: GameState, refX: number, refY: number): void {
  const centerX = REFERENCE_WIDTH / 2;

  // Calculate mobile boost for button spacing (must match renderer)
  const aspectRatio = window.innerWidth / window.innerHeight;
  const mobileBoost = aspectRatio < 1.0 ? 1.0 + (1.0 - aspectRatio) * 0.4 : 1.0;
  const buttonSpacing = 10 + (mobileBoost - 1) * 40;

  // Back button (top-left) - matches drawButton('< Back', 20, 10, 85, 35)
  if (inTapArea(refX, refY, 10, 10, 95, 35)) {
    network.disconnect();
    state.phase = ClientPhase.MAIN_MENU;
    state.players = [];
    playSound('selected', 0.5);
    return;
  }

  // Ready button - dynamic position based on mobile boost
  if (inTapArea(refX, refY, centerX - 100 - buttonSpacing, 340, 100, 40)) {
    const local = getLocalPlayer(state);
    if (local) {
      const newReady = local.state !== PlayerState.READY;
      network.setReady(newReady);
      playSound('selected', 0.5);
    }
    return;
  }

  // Start button (host only) - dynamic position based on mobile boost
  if (state.isHost && inTapArea(refX, refY, centerX + buttonSpacing, 340, 100, 40)) {
    const readyCount = getReadyCount(state);
    if (readyCount >= MIN_PLAYERS) {
      network.startGame();
      playSound('selected', 0.5);
    }
    return;
  }
}

function handleGameTap(state: GameState, refX: number, refY: number): void {
  // Input text area - tap to open keyboard (around y=220, height ~60)
  if (isMyTurn(state) && inTapArea(refX, refY, 0, 190, REFERENCE_WIDTH, 70)) {
    focusHiddenInput();
    return;
  }

  // Tap anywhere else to close keyboard
  blurHiddenInput();
}

function handleGameOverTap(state: GameState, refX: number, refY: number): void {
  const centerX = REFERENCE_WIDTH / 2;

  if (state.showFailedCombos) {
    // Back button when viewing failed combos
    if (inTapArea(refX, refY, centerX - 60, 400, 120, 40)) {
      playSound('selected', 0.5);
      state.showFailedCombos = false;
      return;
    }
    return;
  }

  // Continue button - matches drawButton(buttonText, centerX - 80, 360, 160, 45)
  if (inTapArea(refX, refY, centerX - 80, 360, 160, 45)) {
    playSound('selected', 0.5);
    if (state.players.length > 1) {
      state.phase = ClientPhase.LOBBY_WAITING;
      for (const player of state.players) {
        player.state = PlayerState.CONNECTED;
      }
    } else {
      network.disconnect();
      state.phase = ClientPhase.MAIN_MENU;
      state.players = [];
    }
    return;
  }

  // View Failed Combos button (only if there are failed combos)
  if (state.failedCombos.length > 0 && inTapArea(refX, refY, centerX - 100, 420, 200, 40)) {
    playSound('selected', 0.5);
    state.showFailedCombos = true;
    return;
  }

  // Tap anywhere else to close keyboard
  blurHiddenInput();
}

export function focusHiddenInput(): void {
  if (hiddenInput) {
    hiddenInput.focus();
  }
}

export function blurHiddenInput(): void {
  if (hiddenInput) {
    hiddenInput.blur();
  }
}

function handleKeyDown(e: KeyboardEvent, state: GameState): void {
  // Ignore key repeats (holding down a key), except for Backspace
  if (e.repeat && e.key !== 'Backspace') return;

  // Skip text input handling if the hidden input has focus (it handles its own input)
  const hiddenInputFocused = document.activeElement === hiddenInput;

  // Prevent default for game keys
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace'].includes(e.key)) {
    e.preventDefault();
  }

  // If hidden input is focused, only handle special keys (Enter, Escape, Backspace)
  // Text input will be handled by the hidden input's input event
  if (hiddenInputFocused && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    return;
  }

  switch (state.phase) {
    case ClientPhase.MAIN_MENU:
      handleMainMenuInput(e, state);
      break;

    case ClientPhase.SERVER_CONNECT:
      handleServerConnectInput(e, state);
      break;

    case ClientPhase.LOBBY_CREATE:
      handleLobbyCreateInput(e, state);
      break;

    case ClientPhase.LOBBY_JOIN:
      handleLobbyJoinInput(e, state);
      break;

    case ClientPhase.LOBBY_WAITING:
      handleLobbyWaitingInput(e, state);
      break;

    case ClientPhase.PLAYING:
    case ClientPhase.SPECTATING:
      handleGameInput(e, state);
      break;

    case ClientPhase.GAME_OVER:
      handleGameOverInput(e, state);
      break;
  }
}

function handleMainMenuInput(e: KeyboardEvent, state: GameState): void {
  const menuItems = 2; // Create, Join

  if (e.key === 'ArrowUp') {
    state.prevSelectedIndex = state.menuSelectedIndex;
    state.menuSelectedIndex = (state.menuSelectedIndex - 1 + menuItems) % menuItems;
    state.menuTransitionTime = 0;
    playSound('selection', 0.3);
  } else if (e.key === 'ArrowDown') {
    state.prevSelectedIndex = state.menuSelectedIndex;
    state.menuSelectedIndex = (state.menuSelectedIndex + 1) % menuItems;
    state.menuTransitionTime = 0;
    playSound('selection', 0.3);
  } else if (e.key === 'Enter') {
    playSound('selected', 0.5);
    if (state.menuSelectedIndex === 0) {
      // Create game
      state.joiningGame = false;
      state.phase = ClientPhase.SERVER_CONNECT;
    } else if (state.menuSelectedIndex === 1) {
      // Join game
      state.joiningGame = true;
      state.phase = ClientPhase.SERVER_CONNECT;
    }
  } else if (e.key === 'Escape') {
    // Could close the app/tab
  }
}

function handleServerConnectInput(e: KeyboardEvent, state: GameState): void {
  if (e.key === 'Escape') {
    state.phase = ClientPhase.MAIN_MENU;
    return;
  }

  if (e.key === 'Backspace') {
    if (state.playerName.length > 0) {
      state.playerName = state.playerName.slice(0, -1);
    }
    return;
  }

  if (e.key === 'Enter' && state.playerName.length > 0) {
    // Auto-connect to server
    autoConnectToServer(state);
    return;
  }

  // Text input for player name
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    const char = e.key;
    if (state.playerName.length < 16 && /[a-zA-Z0-9_\- ]/.test(char)) {
      state.playerName += char;
    }
  }
}

function handleLobbyCreateInput(e: KeyboardEvent, state: GameState): void {
  if (e.key === 'Escape') {
    network.disconnect();
    state.phase = ClientPhase.MAIN_MENU;
    return;
  }

  if (e.key === 'Backspace') {
    if (state.gameName.length > 0) {
      state.gameName = state.gameName.slice(0, -1);
    }
    return;
  }

  if (e.key === 'Enter' && state.gameName.length > 0) {
    network.createGame(state.playerName, state.gameName);
    return;
  }

  // Text input for game name
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    if (state.gameName.length < 20 && /[a-zA-Z0-9_\- ]/.test(e.key)) {
      state.gameName += e.key;
    }
  }
}

function handleLobbyJoinInput(e: KeyboardEvent, state: GameState): void {
  if (e.key === 'Escape') {
    network.disconnect();
    state.phase = ClientPhase.MAIN_MENU;
    return;
  }

  // Get games list
  const gamesList = state.gamesList;

  if (e.key === 'ArrowUp') {
    state.menuSelectedIndex = Math.max(0, state.menuSelectedIndex - 1);
    playSound('selection', 0.3);
  } else if (e.key === 'ArrowDown') {
    state.menuSelectedIndex = Math.min(gamesList.length - 1, state.menuSelectedIndex + 1);
    playSound('selection', 0.3);
  } else if (e.key === 'Enter' && gamesList.length > 0) {
    const selectedGame = gamesList[state.menuSelectedIndex];
    if (selectedGame) {
      network.joinGame(selectedGame.id, state.playerName);
      playSound('selected', 0.5);
    }
  } else if (e.key === 'r' || e.key === 'R') {
    // Refresh games list
    network.listGames();
  }
}

function handleLobbyWaitingInput(e: KeyboardEvent, state: GameState): void {
  if (e.key === 'Escape') {
    network.disconnect();
    state.phase = ClientPhase.MAIN_MENU;
    state.players = [];
    return;
  }

  if (e.key === 'r' || e.key === 'R') {
    // Toggle ready state
    const local = getLocalPlayer(state);
    if (local) {
      const newReady = local.state !== PlayerState.READY;
      network.setReady(newReady);
      playSound('selected', 0.5);
    }
  }

  if (e.key === 'Enter' && state.isHost) {
    // Host starts game
    const readyCount = getReadyCount(state);
    console.log('Enter pressed, readyCount:', readyCount, 'MIN_PLAYERS:', MIN_PLAYERS);
    if (readyCount >= MIN_PLAYERS) {
      console.log('Starting game via Enter...');
      network.startGame();
      playSound('selected', 0.5);
    }
  }
}

function handleGameInput(e: KeyboardEvent, state: GameState): void {
  if (e.key === 'Escape') {
    network.disconnect();
    state.phase = ClientPhase.MAIN_MENU;
    state.players = [];
    return;
  }

  // Only handle input if it's our turn
  if (!isMyTurn(state)) return;

  if (e.key === 'Backspace') {
    if (state.localInput.length > 0) {
      // Handle multi-byte Estonian characters
      const lastChar = state.localInput.slice(-1);
      const isMultiByte = lastChar.charCodeAt(0) > 127;
      state.localInput = state.localInput.slice(0, isMultiByte ? -1 : -1);
      network.sendInput(state.localInput);
    }
    return;
  }

  if (e.key === 'Enter') {
    if (state.localInput.length > 0) {
      network.submitWord(state.localInput);
    }
    return;
  }

  // Text input
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    if (isValidLetter(e.key)) {
      state.localInput += toUpperEstonian(e.key);
      network.sendInput(state.localInput);
    }
  }
}

function handleGameOverInput(e: KeyboardEvent, state: GameState): void {
  if (e.key === 'Escape') {
    network.disconnect();
    state.phase = ClientPhase.MAIN_MENU;
    state.players = [];
    return;
  }

  if (e.key === 'Enter') {
    // Return to lobby
    if (state.players.length > 1) {
      state.phase = ClientPhase.LOBBY_WAITING;
      // Reset player states
      for (const player of state.players) {
        player.state = PlayerState.CONNECTED;
      }
    } else {
      network.disconnect();
      state.phase = ClientPhase.MAIN_MENU;
      state.players = [];
    }
  }
}
