import { TurnResult } from '../../shared/protocol';
export declare function loadWordList(filename: string): boolean;
export declare function loadComboList(filename: string): boolean;
export declare function generateNewCombo(): string;
export declare function validateWord(word: string, currentCombo: string, usedWords: Set<string>): TurnResult;
export declare function wordExists(word: string): boolean;
export declare function getValidWordsForCombo(combo: string, usedWords: Set<string>): string[];
export declare function getRandomWordsForCombo(combo: string, count?: number): string[];
//# sourceMappingURL=game-logic.d.ts.map