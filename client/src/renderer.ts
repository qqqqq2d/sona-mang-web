import {
  GameState,
  ClientPhase,
  getLocalPlayer,
  getCurrentTurnPlayer,
  isMyTurn,
  getReadyCount,
} from './state';
import { PlayerState, PlayerInfo, MIN_PLAYERS, MAX_PLAYERS, GameInfo, DEFAULT_LIVES } from './protocol';

// Constants
const ENABLE_COMBO_PULSING = true;
const ENABLE_TEXT_SHADOW = true;
const SHOW_TIMER = false;
const TEXT_SHADOW_OFFSET = 2;
const TEXT_SHADOW_COLOR = 'rgba(0, 0, 0, 0.4)';

// Reference resolution (matches SDL3 version)
const REFERENCE_WIDTH = 640;
const REFERENCE_HEIGHT = 480;

// Mobile detection (coarse pointer = touch screen)
const isMobile = (): boolean => {
  return window.matchMedia('(pointer: coarse)').matches;
};

// Colors
const BG_COLOR = '#000005';
const BG_MENU_COLOR = '#000009';
const BG_GAME_OVER = '#000007';

interface ScaleInfo {
  windowWidth: number;
  windowHeight: number;
  scaleX: number;
  scaleY: number;
  scale: number;
  mobileBoost: number;
}

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let scale: ScaleInfo;

// Heart image for lives
let heartImage: HTMLImageElement | null = null;
let tintedHeartCanvas: HTMLCanvasElement | null = null;
let circleImage: HTMLImageElement | null = null;

// Pre-tinted circle canvases (matching SDL3 color mod)
let activeCircleCanvas: HTMLCanvasElement | null = null;
let grayCircleCanvas: HTMLCanvasElement | null = null;

export function initRenderer(): boolean {
  canvas = document.getElementById('game') as HTMLCanvasElement;
  if (!canvas) return false;

  const context = canvas.getContext('2d');
  if (!context) return false;

  ctx = context;

  // Handle resize
  window.addEventListener('resize', handleResize);
  handleResize();

  // Load heart image from file and tint it red like SDL3 (255, 80, 80)
  heartImage = new Image();
  heartImage.onload = () => {
    tintedHeartCanvas = createTintedHeart(heartImage!, 255, 80, 80);
  };
  heartImage.src = '/assets/heart-white.svg';

  circleImage = new Image();
  createCircleImage();

  // Hide loading screen
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';

  return true;
}

function createCircleImage(): void {
  // Use high resolution for crisp circles on high-DPI displays
  const size = 512;

  // Create base white circle with anti-aliasing
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = size;
  baseCanvas.height = size;
  const baseCtx = baseCanvas.getContext('2d')!;
  baseCtx.imageSmoothingEnabled = true;
  baseCtx.imageSmoothingQuality = 'high';
  baseCtx.fillStyle = '#ffffff';
  baseCtx.beginPath();
  baseCtx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  baseCtx.fill();

  circleImage!.src = baseCanvas.toDataURL();

  // Create active circle (current player)
  activeCircleCanvas = document.createElement('canvas');
  activeCircleCanvas.width = size;
  activeCircleCanvas.height = size;
  const activeCtx = activeCircleCanvas.getContext('2d')!;
  activeCtx.imageSmoothingEnabled = true;
  activeCtx.imageSmoothingQuality = 'high';
  activeCtx.drawImage(baseCanvas, 0, 0);
  activeCtx.globalCompositeOperation = 'source-atop';
  activeCtx.fillStyle = 'rgb(255, 255, 255)';
  activeCtx.fillRect(0, 0, size, size);

  // Create gray circle (inactive player) - SDL3: (200, 200, 200) with alpha 200
  grayCircleCanvas = document.createElement('canvas');
  grayCircleCanvas.width = size;
  grayCircleCanvas.height = size;
  const grayCtx = grayCircleCanvas.getContext('2d')!;
  grayCtx.imageSmoothingEnabled = true;
  grayCtx.imageSmoothingQuality = 'high';
  grayCtx.globalAlpha = 200 / 255;
  grayCtx.drawImage(baseCanvas, 0, 0);
  grayCtx.globalAlpha = 1.0;
  grayCtx.globalCompositeOperation = 'source-atop';
  grayCtx.fillStyle = 'rgb(200, 200, 200)';
  grayCtx.fillRect(0, 0, size, size);
}

function createTintedHeart(img: HTMLImageElement, r: number, g: number, b: number): HTMLCanvasElement {
  // Use a high resolution for crisp scaling
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const tempCtx = canvas.getContext('2d')!;

  // Enable image smoothing for better quality
  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = 'high';

  // Draw the original image with alpha (SDL3 uses 200/255 ≈ 0.78)
  tempCtx.globalAlpha = 200 / 255;
  tempCtx.drawImage(img, 0, 0, size, size);
  tempCtx.globalAlpha = 1.0;

  // Apply color tint using source-atop blend mode
  tempCtx.globalCompositeOperation = 'source-atop';
  tempCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  tempCtx.fillRect(0, 0, size, size);

  return canvas;
}

// Store dimensions to avoid keyboard resize issues on mobile
let storedWidth: number | null = null;
let storedHeight: number | null = null;

export function getCanvasDimensions(): { width: number; height: number } {
  return { width: storedWidth || 640, height: storedHeight || 480 };
}

function handleResize(): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // Update stored dimensions on first call or when width changes (orientation change)
  // Keyboard only changes height, so we ignore height-only changes
  if (storedWidth === null || rect.width !== storedWidth) {
    storedWidth = rect.width;
    storedHeight = rect.height;
  }

  // Use stored dimensions to prevent keyboard from resizing the canvas
  const width = storedWidth;
  const height = storedHeight!;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  ctx.scale(dpr, dpr);

  // Enable image smoothing for crisp scaled images
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const scaleX = width / REFERENCE_WIDTH;
  const scaleY = height / REFERENCE_HEIGHT;

  // Calculate mobile boost for narrow screens
  // On narrow/portrait screens, boost text and UI elements
  const aspectRatio = width / height;
  let mobileBoost = 1.0;
  if (aspectRatio < 1.0) {
    // Portrait mode: boost more as screen gets narrower
    // At aspect ratio 0.5 (very narrow), boost is ~1.4
    // At aspect ratio 1.0 (square), boost is 1.0
    mobileBoost = 1.0 + (1.0 - aspectRatio) * 0.4;
  }

  scale = {
    windowWidth: width,
    windowHeight: height,
    scaleX,
    scaleY,
    scale: Math.min(scaleX, scaleY),
    mobileBoost,
  };
}

function x(value: number): number {
  return value * scale.scaleX;
}

function y(value: number): number {
  return value * scale.scaleY;
}

function fontSize(size: number): number {
  return Math.round(size * scale.scale * scale.mobileBoost);
}

function uiScale(): number {
  return scale.scale * scale.mobileBoost;
}

function drawText(
  text: string,
  posX: number,
  posY: number,
  color: string,
  size: number,
  centered: boolean = false
): void {
  ctx.font = `${size}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';

  const textWidth = ctx.measureText(text).width;
  const finalX = centered ? posX - textWidth / 2 : posX;

  // Shadow
  if (ENABLE_TEXT_SHADOW) {
    ctx.fillStyle = TEXT_SHADOW_COLOR;
    ctx.fillText(text, finalX + TEXT_SHADOW_OFFSET, posY + TEXT_SHADOW_OFFSET);
    ctx.fillStyle = color;
  }

  ctx.fillText(text, finalX, posY);
}

function drawInputWithComboHighlight(
  input: string,
  combo: string,
  posX: number,
  posY: number,
  size: number
): void {
  if (!input || !combo) {
    drawText(input || '_', posX, posY, '#ffff00', size, true);
    return;
  }

  ctx.font = `${size}px sans-serif`;
  ctx.textBaseline = 'top';

  const comboIndex = input.toUpperCase().indexOf(combo.toUpperCase());
  const normalColor = '#ffff00';
  const brightColor = '#ffffaa';

  if (comboIndex === -1) {
    // Combo not found, draw all normal
    drawText(input, posX, posY, normalColor, size, true);
    return;
  }

  // Split into before, combo, and after parts
  const before = input.substring(0, comboIndex);
  const comboText = input.substring(comboIndex, comboIndex + combo.length);
  const after = input.substring(comboIndex + combo.length);

  // Calculate total width for centering
  const totalWidth = ctx.measureText(input).width;
  let currentX = posX - totalWidth / 2;

  // Draw shadow for entire text first
  if (ENABLE_TEXT_SHADOW) {
    ctx.fillStyle = TEXT_SHADOW_COLOR;
    ctx.fillText(input, currentX + TEXT_SHADOW_OFFSET, posY + TEXT_SHADOW_OFFSET);
  }

  // Draw before part (normal)
  if (before) {
    ctx.fillStyle = normalColor;
    ctx.fillText(before, currentX, posY);
    currentX += ctx.measureText(before).width;
  }

  // Draw combo part (bright)
  ctx.fillStyle = brightColor;
  ctx.fillText(comboText, currentX, posY);
  currentX += ctx.measureText(comboText).width;

  // Draw after part (normal)
  if (after) {
    ctx.fillStyle = normalColor;
    ctx.fillText(after, currentX, posY);
  }
}

function drawScaledText(
  text: string,
  posX: number,
  posY: number,
  color: string,
  size: number,
  textScale: number,
  centered: boolean = true,
  shadowOffset: number = TEXT_SHADOW_OFFSET
): void {
  ctx.save();
  ctx.font = `${size}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';

  const textWidth = ctx.measureText(text).width;
  const scaledWidth = textWidth * textScale;
  const scaledHeight = size * textScale;

  const finalX = centered ? posX - scaledWidth / 2 : posX;
  const finalY = posY - (scaledHeight - size) / 2;

  ctx.translate(finalX + scaledWidth / 2, finalY + scaledHeight / 2);
  ctx.scale(textScale, textScale);
  ctx.translate(-textWidth / 2, -size / 2);

  // Shadow
  if (ENABLE_TEXT_SHADOW) {
    ctx.fillStyle = TEXT_SHADOW_COLOR;
    ctx.fillText(text, shadowOffset / textScale, shadowOffset / textScale);
    ctx.fillStyle = color;
  }

  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawVignette(): void {
  const gradient = ctx.createRadialGradient(
    scale.windowWidth / 2,
    scale.windowHeight / 2,
    0,
    scale.windowWidth / 2,
    scale.windowHeight / 2,
    Math.max(scale.windowWidth, scale.windowHeight) * 0.7
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.6)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
}

function drawFlashOverlay(color: string, opacity: number): void {
  if (opacity <= 0) return;
  ctx.fillStyle = color.replace('1)', `${opacity})`);
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
}

function drawViewTransition(state: GameState): void {
  if (state.viewTransitionOpacity <= 0) return;
  ctx.fillStyle = `rgba(0, 0, 0, ${state.viewTransitionOpacity})`;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
}

function drawButton(
  text: string,
  refX: number,
  refY: number,
  refWidth: number,
  refHeight: number,
  highlightOpacity: number = 0
): void {
  // Apply mobile boost to button dimensions, adjust position to keep centered
  const boost = scale.mobileBoost;
  const originalW = x(refWidth);
  const originalH = y(refHeight);
  const bw = originalW * boost;
  const bh = originalH * boost;
  const bx = x(refX) - (bw - originalW) / 2;
  const by = y(refY) - (bh - originalH) / 2;
  const boxRadius = Math.min(bh / 2, 20 * boost); // Pill-shaped, capped

  // Border opacity: base 0.6, highlighted up to 1.0
  const borderOpacity = 0.6 + highlightOpacity * 0.4;
  const borderColor = `rgba(80, 50, 120, ${borderOpacity})`;

  // Draw rounded purple border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, boxRadius);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Button text
  const textSize = fontSize(20);
  ctx.font = `${textSize}px sans-serif`;
  ctx.fillStyle = '#b4b4b4';
  ctx.textBaseline = 'middle';
  const textWidth = ctx.measureText(text).width;
  ctx.fillText(text, bx + (bw - textWidth) / 2, by + bh / 2);
}

function drawBackButton(state: GameState): void {
  const highlight = state.buttonHighlightOpacity?.['back'] || 0;
  // Move left on PC (mobileBoost ~= 1), keep at 20 on mobile
  const backX = scale.mobileBoost > 1.05 ? 20 : 10;
  drawButton('< Back', backX, 10, 85, 35, highlight);
}

export function render(state: GameState): void {
  if (!ctx) return;

  switch (state.phase) {
    case ClientPhase.MAIN_MENU:
      renderMainMenu(state);
      break;

    case ClientPhase.SERVER_CONNECT:
      renderServerConnect(state);
      break;

    case ClientPhase.CONNECTING:
      renderConnecting(state);
      break;

    case ClientPhase.LOBBY_CREATE:
      renderLobbyCreate(state);
      break;

    case ClientPhase.LOBBY_JOIN:
      renderLobbyJoin(state);
      break;

    case ClientPhase.LOBBY_WAITING:
      renderLobbyWaiting(state);
      break;

    case ClientPhase.PLAYING:
    case ClientPhase.SPECTATING:
      // Use renderPhase during transitions to show old view until fade completes
      const viewPhase = state.renderPhase || state.phase;
      if (viewPhase === ClientPhase.PLAYING) {
        renderGame(state);
      } else {
        renderSpectatorView(state);
      }
      break;

    case ClientPhase.GAME_OVER:
      renderGameOver(state);
      break;
  }
}

function renderMainMenu(state: GameState): void {
  ctx.fillStyle = BG_MENU_COLOR;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
  drawVignette();

  const centerX = scale.windowWidth / 2;

  // Title
  drawText('SÕNA MÄNG', centerX, y(80), '#ffffff', fontSize(80), true);

  // Menu options
  const menuItems = ['CREATE GAME', 'JOIN GAME'];
  const menuY = [y(220), y(300)];
  const textSize = fontSize(40);
  const boxPaddingX = x(20);
  const boxPaddingY = y(8);

  for (let i = 0; i < menuItems.length; i++) {
    const highlightOpacity = state.menuHighlightOpacity[i] || 0;

    // Measure text width for box sizing (text already includes mobile boost via fontSize)
    ctx.font = `${textSize}px sans-serif`;
    const textWidth = ctx.measureText(menuItems[i]).width;
    const boxWidth = textWidth + boxPaddingX * 2;
    const boxHeight = textSize + boxPaddingY * 2;
    const boxX = centerX - boxWidth / 2;
    const boxY = menuY[i] - boxPaddingY;
    const pillRadius = Math.min(boxHeight / 2, 20 * scale.mobileBoost);

    // Border opacity: base 0.6, highlighted up to 1.0
    const borderOpacity = 0.6 + highlightOpacity * 0.4;
    const borderColor = `rgba(80, 50, 120, ${borderOpacity})`;

    // Draw rounded purple border (matching drawButton style)
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, pillRadius);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Button text (centered vertically like drawButton)
    ctx.font = `${textSize}px sans-serif`;
    ctx.fillStyle = '#b4b4b4';
    ctx.textBaseline = 'middle';
    const measuredWidth = ctx.measureText(menuItems[i]).width;
    ctx.fillText(menuItems[i], boxX + (boxWidth - measuredWidth) / 2, boxY + boxHeight / 2);
  }

  // Instructions
  drawText(
    'qqqqq2d',
    centerX,
    y(430),
    'rgba(120, 120, 120, 0.5)',
    fontSize(20),
    true
  );
}

function renderServerConnect(state: GameState): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
  drawVignette();

  const centerX = scale.windowWidth / 2;

  // Back button
  drawBackButton(state);

  const title = state.joiningGame ? 'JOIN GAME' : 'CREATE GAME';
  drawText(title, centerX, y(80), '#ffffff', fontSize(40), true);

  // Player name
  drawText('Your Name:', centerX, y(160), '#ffffff', fontSize(20), true);


  const nameDisplay = state.playerName + '|';
  drawText(nameDisplay, centerX, y(195), '#ffff00', fontSize(24), true);

  // Continue button
  const continueHighlight = state.buttonHighlightOpacity?.['continue'] || 0;
  drawButton('Continue', REFERENCE_WIDTH / 2 - 60, 260, 120, 40, continueHighlight);

}

function renderConnecting(state: GameState): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
  drawVignette();

  const centerX = scale.windowWidth / 2;

  drawText('CONNECTING...', centerX, y(200), '#ffffff', fontSize(40), true);
  drawText(state.serverAddress, centerX, y(260), '#b4b4b4', fontSize(24), true);
}

function renderLobbyCreate(state: GameState): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
  drawVignette();

  const centerX = scale.windowWidth / 2;

  // Back button
  drawBackButton(state);

  drawText('CREATE GAME', centerX, y(80), '#ffffff', fontSize(40), true);

  // Game name
  drawText('Game Name:', centerX, y(160), '#ffffff', fontSize(20), true);


  const nameDisplay = state.gameName + '|';
  drawText(nameDisplay, centerX, y(195), '#ffff00', fontSize(24), true);

  // Create button
  const createHighlight = state.buttonHighlightOpacity?.['create'] || 0;
  drawButton('Create', REFERENCE_WIDTH / 2 - 60, 260, 120, 40, createHighlight);

}

function renderLobbyJoin(state: GameState): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
  drawVignette();

  const centerX = scale.windowWidth / 2;

  // Back button
  drawBackButton(state);

  // Refresh button
  const refreshHighlight = state.buttonHighlightOpacity?.['refresh'] || 0;
  drawButton('Refresh', REFERENCE_WIDTH - 90, 10, 80, 35, refreshHighlight);

  drawText('JOIN GAME', centerX, y(80), '#ffffff', fontSize(40), true);

  // Games list
  const gamesList = state.gamesList;

  if (gamesList.length === 0) {
    drawText('No games available', centerX, y(200), '#b4b4b4', fontSize(24), true);
    drawText('Tap Refresh to update', centerX, y(240), '#787878', fontSize(18), true);
  } else {
    drawText('Select a game:', centerX, y(160), '#ffffff', fontSize(20), true);

    let yPos = y(190);
    gamesList.forEach((game: GameInfo, i: number) => {
      const isSelected = i === state.menuSelectedIndex;

      const color = isSelected ? '#ffff00' : '#b4b4b4';
      const gameText = `${game.name} (${game.playerCount}/${game.maxPlayers}) - ${game.hostName}`;
      drawText(gameText, centerX, yPos, color, fontSize(20), true);
      yPos += y(32);
    });
  }

}

function renderLobbyWaiting(state: GameState): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
  drawVignette();

  const centerX = scale.windowWidth / 2;

  // Back button
  drawBackButton(state);

  // Title
  if (state.isHost) {
    drawText('HOSTING GAME', centerX, y(30), '#ffffff', fontSize(36), true);
    drawText(`Game: ${state.gameName}`, centerX, y(70), '#b4b4b4', fontSize(18), true);
  } else {
    drawText('LOBBY', centerX, y(30), '#ffffff', fontSize(36), true);
  }

  // Player list
  const playerCount = `Players (${state.players.length}/${MAX_PLAYERS}):`;
  drawText(playerCount, x(40), y(100), '#ffffff', fontSize(22), false);

  let yPos = y(130);
  for (const player of state.players) {
    const status = player.state === PlayerState.READY ? '[READY]' : '[...]';
    const hostTag = player.isHost ? ' (HOST)' : '';
    const playerLine = `${player.name}${hostTag} ${status}`;

    const isLocal = player.id === state.playerId;
    const color = isLocal ? '#ffff00' : '#c8c8c8';

    drawText(playerLine, x(60), yPos, color, fontSize(20), false);
    yPos += y(28);
  }

  // Buttons - extra spacing on mobile
  const buttonSpacing = 10 + (scale.mobileBoost - 1) * 40;
  const readyText = (getLocalPlayer(state)?.state === PlayerState.READY) ? 'Not Ready' : 'Ready';
  const readyHighlight = state.buttonHighlightOpacity?.['ready'] || 0;
  drawButton(readyText, REFERENCE_WIDTH / 2 - 100 - buttonSpacing, 340, 100, 40, readyHighlight);

  // Start button (host only)
  if (state.isHost) {
    const startHighlight = state.buttonHighlightOpacity?.['start'] || 0;
    drawButton('Start', REFERENCE_WIDTH / 2 + buttonSpacing, 340, 100, 40, startHighlight);

    const readyCount = getReadyCount(state);
    if (readyCount < MIN_PLAYERS) {
      drawText(`Need ${MIN_PLAYERS}+ ready`, centerX, y(400), '#787878', fontSize(16), true);
    }
  } else {
    drawText('Waiting for host...', centerX, y(400), '#787878', fontSize(16), true);
  }
}

function renderGame(state: GameState): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
  drawVignette();

  const centerX = scale.windowWidth / 2;
  const localPlayer = getLocalPlayer(state);

  // Lives (top-left) - rightmost disappears first, leftmost is last life
  if (localPlayer && tintedHeartCanvas) {
    const heartSize = 20 * scale.scale;
    const heartSpacing = 5 * scale.scale;
    const startX = x(scale.mobileBoost > 1.05 ? 20 : 10);
    const startY = y(20);

    for (let i = 0; i < localPlayer.lives; i++) {
      const heartX = startX + i * (heartSize + heartSpacing);

      // Shadow
      if (ENABLE_TEXT_SHADOW) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(tintedHeartCanvas, heartX + TEXT_SHADOW_OFFSET, startY + TEXT_SHADOW_OFFSET, heartSize, heartSize);
        ctx.globalAlpha = 1.0;
      }

      ctx.drawImage(tintedHeartCanvas, heartX, startY, heartSize, heartSize);
    }
  }

  // Timer (bottom-right)
  if (SHOW_TIMER) {
    const timerInt = Math.ceil(state.turnTimer);
    const timerText = timerInt.toString();
    drawText(timerText, scale.windowWidth - x(40), scale.windowHeight - y(65), 'rgba(255, 255, 255, 0.4)', fontSize(30), true);
  }

  // Current combo (centered, large) - use displayCombo during transitions
  const comboScale = ENABLE_COMBO_PULSING ? 1.0 + 0.04 * Math.sin(state.animTime * 2.0) : 1.0;
  const combo = state.displayCombo || state.currentCombo;
  drawScaledText(combo, centerX, y(120), '#ffffff', fontSize(80), comboScale);

  // Circular sector timer between combo and input
  const timerRadius = 20 * scale.scale;
  const timerY = y(185);
  const timeRatio = Math.max(0, state.turnTimer / state.turnDuration);
  const startAngle = -Math.PI / 2; // Start from top
  const endAngle = startAngle + timeRatio * Math.PI * 2;

  // Opacity: 0 at 10s, 1 at 1s
  const timerOpacity = Math.max(0, Math.min(1, (10 - state.turnTimer) / 9));

  // Draw sector
  if (timerOpacity > 0) {
    ctx.beginPath();
    ctx.moveTo(centerX, timerY);
    ctx.arc(centerX, timerY, timerRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 255, 255, ${timerOpacity})`;
    ctx.fill();
  }

  // Player input
  if (isMyTurn(state)) {
    drawInputWithComboHighlight(state.localInput, state.currentCombo, centerX, y(220), fontSize(60));
  } else {
    const currentPlayer = getCurrentTurnPlayer(state);
    if (currentPlayer) {
      const turnText = `${currentPlayer.name}'s turn`;
      drawText(turnText, centerX, y(250), '#b4b4b4', fontSize(32), true);
    }
  }

  // Flash overlays
  if (state.wrongAnswerOpacity > 0) {
    drawFlashOverlay('rgba(255, 0, 0, 1)', state.wrongAnswerOpacity);
  }
  if (state.correctAnswerOpacity > 0) {
    drawFlashOverlay('rgba(255, 255, 255, 1)', state.correctAnswerOpacity);
  }
  if (state.timeoutOpacity > 0) {
    drawFlashOverlay('rgba(180, 0, 0, 1)', state.timeoutOpacity);
  }

  // View transition overlay
  drawViewTransition(state);
}

function renderSpectatorView(state: GameState): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);
  drawVignette();

  const centerX = scale.windowWidth / 2;
  const localPlayer = getLocalPlayer(state);

  // Combo at top (SDL3 uses shadow offset 4 for combo text) - use displayCombo during transitions
  const comboScale = ENABLE_COMBO_PULSING ? 1.0 + 0.04 * Math.sin(state.animTime * 2.0) : 1.0;
  const combo = state.displayCombo || state.currentCombo;
  drawScaledText(combo, centerX, y(100), '#ffffff', fontSize(80), comboScale, true, 4);

  // Timer at bottom
  if (SHOW_TIMER) {
    const timerInt = Math.ceil(state.turnTimer);
    drawText(timerInt.toString(), centerX, scale.windowHeight - 80, 'rgba(255, 255, 255, 0.4)', fontSize(30), true);
  }

  // Circular sector timer between combo and input
  const timerRadius = 20 * scale.scale;
  const timerY = y(185);
  const timeRatio = Math.max(0, state.turnTimer / state.turnDuration);
  const startAngle = -Math.PI / 2; // Start from top
  const endAngle = startAngle + timeRatio * Math.PI * 2;

  // Opacity: 0 at 10s, 1 at 1s
  const timerOpacity = Math.max(0, Math.min(1, (10 - state.turnTimer) / 9));

  // Draw sector
  if (timerOpacity > 0) {
    ctx.beginPath();
    ctx.moveTo(centerX, timerY);
    ctx.arc(centerX, timerY, timerRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 255, 255, ${timerOpacity})`;
    ctx.fill();
  }

  // Other players in arc
  const otherPlayers = state.players.filter(p => p.id !== state.playerId && p.state === PlayerState.ALIVE);

  if (otherPlayers.length === 0) {
    drawText('Waiting for players...', centerX, scale.windowHeight / 2, '#b4b4b4', fontSize(30), true);
  } else if (circleImage && activeCircleCanvas && grayCircleCanvas) {
    // Use uniform scale with mobile boost for circles
    const uniformScale = uiScale();
    const arcRadius = 150 * uniformScale;
    const arcCenterY = y(280);
    const arcStartAngle = -Math.PI * 0.4;
    const arcEndAngle = Math.PI * 0.4;

    const normalSize = 60 * uniformScale;
    const activeSize = 75 * uniformScale;

    otherPlayers.forEach((player, i) => {
      const isCurrentTurn = player.id === state.currentTurnPlayerId;

      // Position on arc
      const t = otherPlayers.length === 1 ? 0.5 : i / (otherPlayers.length - 1);
      const angle = arcStartAngle + t * (arcEndAngle - arcStartAngle);
      const circleX = centerX + arcRadius * Math.sin(angle);
      const circleY = arcCenterY + arcRadius * (1 - Math.cos(angle)) * 0.5;

      const baseSize = isCurrentTurn ? activeSize : normalSize;
      const pulseScale = 1.0 + 0.03 * Math.sin(state.animTime * 1.5);
      const size = baseSize * pulseScale;
      const radius = size / 2;

      // Circle shadow - SDL3 uses alpha 60/255 ≈ 0.24
      if (ENABLE_TEXT_SHADOW) {
        ctx.globalAlpha = 60 / 255;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(circleX + 4, circleY + 4, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // Circle with native anti-aliasing (no pixelation at small sizes)
      ctx.beginPath();
      ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
      if (isCurrentTurn) {
        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      } else {
        ctx.fillStyle = 'rgba(200, 200, 200, 0.78)'; // SDL3: (200, 200, 200) with alpha 200/255
      }
      ctx.fill();

      // Player name (pulse with circle) - SDL3: active (0,0,50), inactive (50,50,50)
      const nameColor = isCurrentTurn ? '#323232' : '#323232';
      const nameFontSize = isCurrentTurn ? fontSize(18) : fontSize(14);
      drawScaledText(player.name, circleX, circleY - nameFontSize / 2, nameColor, nameFontSize, pulseScale, true, 0);

      // Lives (hearts above circle) with pulsing - matching SDL3
      if (tintedHeartCanvas && player.lives > 0) {
        const baseHeartSize = isCurrentTurn ? 16 : 14;
        const heartSize = baseHeartSize;
        const heartSpacing = 2;
        const totalWidth = player.lives * heartSize + (player.lives - 1) * heartSpacing;
        const heartsX = circleX - totalWidth / 2;
        const heartsY = circleY - radius - heartSize - 5;

        for (let h = 0; h < player.lives; h++) {
          const heartX = heartsX + h * (heartSize + heartSpacing);

          // Shadow - SDL3 uses alpha 80/255 ≈ 0.31
          if (ENABLE_TEXT_SHADOW) {
            ctx.globalAlpha = 80 / 255;
            ctx.drawImage(tintedHeartCanvas, heartX + TEXT_SHADOW_OFFSET, heartsY + TEXT_SHADOW_OFFSET, heartSize, heartSize);
            ctx.globalAlpha = 1.0;
          }

          ctx.drawImage(tintedHeartCanvas, heartX, heartsY, heartSize, heartSize);
        }
      }

      // Current input below circle - matching SDL3
      if (isCurrentTurn && player.currentInput) {
        let inputDisplay = player.currentInput;
        if (inputDisplay.length > 15) {
          inputDisplay = inputDisplay.substring(0, 15) + '...';
        }
        drawInputWithComboHighlight(inputDisplay, state.currentCombo, circleX, circleY + radius + 10, fontSize(30));
      }
    });
  }

  // Local player lives (top-left) - rightmost disappears first, leftmost is last life
  if (localPlayer && tintedHeartCanvas) {
    const heartSize = 20 * scale.scale;
    const heartSpacing = 5 * scale.scale;
    const startX = x(scale.mobileBoost > 1.05 ? 20 : 10);
    const startY = y(20);

    for (let i = 0; i < localPlayer.lives; i++) {
      const heartX = startX + i * (heartSize + heartSpacing);

      // Shadow
      if (ENABLE_TEXT_SHADOW) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(tintedHeartCanvas, heartX + TEXT_SHADOW_OFFSET, startY + TEXT_SHADOW_OFFSET, heartSize, heartSize);
        ctx.globalAlpha = 1.0;
      }

      ctx.drawImage(tintedHeartCanvas, heartX, startY, heartSize, heartSize);
    }
  }

  // Flash overlays
  if (state.wrongAnswerOpacity > 0) {
    drawFlashOverlay('rgba(255, 0, 0, 1)', state.wrongAnswerOpacity);
  }
  if (state.correctAnswerOpacity > 0) {
    drawFlashOverlay('rgba(255, 255, 255, 1)', state.correctAnswerOpacity);
  }
  if (state.timeoutOpacity > 0) {
    drawFlashOverlay('rgba(180, 0, 0, 1)', state.timeoutOpacity);
  }

  // View transition overlay
  drawViewTransition(state);
}

function renderGameOver(state: GameState): void {
  ctx.fillStyle = BG_GAME_OVER;
  ctx.fillRect(0, 0, scale.windowWidth, scale.windowHeight);

  const centerX = scale.windowWidth / 2;

  if (state.showFailedCombos) {
    // Show failed combos view
    drawText('Failed Combos', centerX, y(50), '#ffffff', fontSize(35), true);

    if (state.failedCombos.length === 0) {
      drawText('No failed combos!', centerX, y(150), '#88ff88', fontSize(24), true);
    } else {
      let yPos = y(100);
      for (const fc of state.failedCombos) {
        // Combo name
        drawText(fc.combo, centerX, yPos, '#ff8888', fontSize(28), true);
        yPos += y(32);

        // Example words
        const wordsText = fc.exampleWords.join(', ');
        drawText(wordsText, centerX, yPos, '#aaaaaa', fontSize(18), true);
        yPos += y(40);
      }
    }

    // Back button
    const backHighlight = state.buttonHighlightOpacity?.['back'] || 0;
    drawButton('Back', REFERENCE_WIDTH / 2 - 60, 400, 120, 40, backHighlight);
    return;
  }

  // Title
  drawText('GAME OVER', centerX, y(60), '#ffffff', fontSize(50), true);

  // Find winner
  const winner = state.players.find(p => p.state === PlayerState.ALIVE);

  if (winner) {
    const winnerText = `${winner.name} WINS!`;
    drawText(winnerText, centerX, y(130), '#ffff00', fontSize(40), true);
  }

  let yPos = y(235);
  for (const player of state.players) {
    const scoreLine = `${player.name}: ${player.score} pts`;
    const color = winner && player.id === winner.id ? '#ffff00' : '#c8c8c8';
    drawText(scoreLine, centerX, yPos, color, fontSize(20), true);
    yPos += y(26);
  }

  // Continue button
  const buttonText = state.players.length > 1 ? 'Return to Lobby' : 'Main Menu';
  const continueHighlight = state.buttonHighlightOpacity?.['continue'] || 0;
  drawButton(buttonText, REFERENCE_WIDTH / 2 - 80, 360, 160, 45, continueHighlight);

  // View Failed Combos button (only if there are failed combos)
  if (state.failedCombos.length > 0) {
    const failedHighlight = state.buttonHighlightOpacity?.['failed'] || 0;
    drawButton('View Failed Combos', REFERENCE_WIDTH / 2 - 100, 420, 200, 40, failedHighlight);
  }
}

