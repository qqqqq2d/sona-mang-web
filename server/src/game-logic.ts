import * as fs from 'fs';
import * as path from 'path';
import { TurnResult } from '../../shared/protocol';

let wordSet: Set<string> = new Set();
let comboList: string[] = [];

export function loadWordList(filename: string): boolean {
  try {
    // Go up from src to server, then into data
    const filePath = path.resolve(__dirname, '..', 'data', filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    const words = content.split('\n').filter(w => w.trim().length > 0);
    wordSet = new Set(words.map(w => w.trim().toUpperCase()));
    console.log(`Loaded ${wordSet.size} words from ${filename}`);
    return true;
  } catch (e) {
    console.error(`Failed to load word list: ${filename}`, e);
    return false;
  }
}

export function loadComboList(filename: string): boolean {
  try {
    const filePath = path.resolve(__dirname, '..', 'data', filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    comboList = content.split('\n').filter(c => c.trim().length > 0).map(c => c.trim().toUpperCase());
    console.log(`Loaded ${comboList.length} combos from ${filename}`);
    return true;
  } catch (e) {
    console.error(`Failed to load combo list: ${filename}`, e);
    return false;
  }
}

export function generateNewCombo(): string {
  if (comboList.length === 0) {
    return '???';
  }
  const index = Math.floor(Math.random() * comboList.length);
  return comboList[index];
}

export function validateWord(
  word: string,
  currentCombo: string,
  usedWords: Set<string>
): TurnResult {
  if (!word || word.length === 0) {
    return TurnResult.WRONG;
  }

  const upperWord = word.toUpperCase();

  // Check if word was already used
  if (usedWords.has(upperWord)) {
    return TurnResult.ALREADY_USED;
  }

  // Check if word contains the combo
  if (!upperWord.includes(currentCombo.toUpperCase())) {
    return TurnResult.WRONG;
  }

  // Check if word exists in dictionary
  if (!wordSet.has(upperWord)) {
    return TurnResult.WRONG;
  }

  return TurnResult.CORRECT;
}

export function wordExists(word: string): boolean {
  return wordSet.has(word.toUpperCase());
}

export function getValidWordsForCombo(combo: string, usedWords: Set<string>): string[] {
  const validWords: string[] = [];
  const upperCombo = combo.toUpperCase();

  for (const word of wordSet) {
    if (word.includes(upperCombo) && !usedWords.has(word)) {
      validWords.push(word);
    }
  }

  return validWords;
}

export function getRandomWordsForCombo(combo: string, count: number = 3): string[] {
  const upperCombo = combo.toUpperCase();
  const matchingWords: string[] = [];

  for (const word of wordSet) {
    if (word.includes(upperCombo)) {
      matchingWords.push(word);
    }
  }

  // Shuffle and take first 'count' words
  const shuffled = matchingWords.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
