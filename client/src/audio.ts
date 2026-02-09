interface SoundEffect {
  buffer: AudioBuffer | null;
  loaded: boolean;
}

export type SoundName = 'correct' | 'wrong' | 'selection' | 'selected' | 'timer_tick' | 'turn_over';

export interface SoundSettings {
  correct: boolean;
  wrong: boolean;
  selection: boolean;
  selected: boolean;
  timer_tick: boolean;
  turn_over: boolean;
}

const MASTER_VOLUME = 3.0;

let audioContext: AudioContext | null = null;
const sounds: Map<string, SoundEffect> = new Map();
const soundEnabled: SoundSettings = {
  correct: true,
  wrong: true,
  selection: false,
  selected: true,
  timer_tick: true,
  turn_over: true,
};

export async function initAudio(): Promise<boolean> {
  try {
    audioContext = new AudioContext();
    return true;
  } catch (e) {
    console.error('Failed to initialize audio:', e);
    return false;
  }
}

export async function loadSound(name: string, path: string): Promise<boolean> {
  if (!audioContext) return false;

  try {
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    sounds.set(name, {
      buffer: audioBuffer,
      loaded: true,
    });

    console.log(`Loaded sound: ${name}`);
    return true;
  } catch (e) {
    console.error(`Failed to load sound ${name}:`, e);
    sounds.set(name, { buffer: null, loaded: false });
    return false;
  }
}

export function playSound(name: SoundName, volume: number = 1.0): void {
  if (!audioContext) return;
  if (!soundEnabled[name]) return;

  const sound = sounds.get(name);
  if (!sound || !sound.buffer) return;

  // Resume context if suspended (needed for autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();

  source.buffer = sound.buffer;
  gainNode.gain.value = volume * MASTER_VOLUME;

  source.connect(gainNode);
  gainNode.connect(audioContext.destination);

  source.start(0);
}

export async function loadAllSounds(): Promise<void> {
  await Promise.all([
    loadSound('correct', '/assets/sounds/correct.wav'),
    loadSound('wrong', '/assets/sounds/wrong.wav'),
    loadSound('selection', '/assets/sounds/selection.wav'),
    loadSound('selected', '/assets/sounds/selected.wav'),
    loadSound('timer_tick', '/assets/sounds/timer_tick.wav'),
    loadSound('turn_over', '/assets/sounds/turn_over.wav'),
  ]);
}

export function setSoundEnabled(name: SoundName, enabled: boolean): void {
  soundEnabled[name] = enabled;
}

export function isSoundEnabled(name: SoundName): boolean {
  return soundEnabled[name];
}

export function getSoundSettings(): Readonly<SoundSettings> {
  return { ...soundEnabled };
}

export function setAllSoundsEnabled(enabled: boolean): void {
  soundEnabled.correct = enabled;
  soundEnabled.wrong = enabled;
  soundEnabled.selection = enabled;
  soundEnabled.selected = enabled;
  soundEnabled.timer_tick = enabled;
  soundEnabled.turn_over = enabled;
}
