"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadWordList = loadWordList;
exports.loadComboList = loadComboList;
exports.generateNewCombo = generateNewCombo;
exports.validateWord = validateWord;
exports.wordExists = wordExists;
exports.getValidWordsForCombo = getValidWordsForCombo;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const protocol_1 = require("../../shared/protocol");
let wordSet = new Set();
let comboList = [];
function loadWordList(filename) {
    try {
        // Go up to project root where word files are located
        const filePath = path.resolve(__dirname, '..', '..', '..', filename);
        const content = fs.readFileSync(filePath, 'utf-8');
        const words = content.split('\n').filter(w => w.trim().length > 0);
        wordSet = new Set(words.map(w => w.trim().toUpperCase()));
        console.log(`Loaded ${wordSet.size} words from ${filename}`);
        return true;
    }
    catch (e) {
        console.error(`Failed to load word list: ${filename}`, e);
        return false;
    }
}
function loadComboList(filename) {
    try {
        const filePath = path.resolve(__dirname, '..', '..', '..', filename);
        const content = fs.readFileSync(filePath, 'utf-8');
        comboList = content.split('\n').filter(c => c.trim().length > 0).map(c => c.trim().toUpperCase());
        console.log(`Loaded ${comboList.length} combos from ${filename}`);
        return true;
    }
    catch (e) {
        console.error(`Failed to load combo list: ${filename}`, e);
        return false;
    }
}
function generateNewCombo() {
    if (comboList.length === 0) {
        return '???';
    }
    const index = Math.floor(Math.random() * comboList.length);
    return comboList[index];
}
function validateWord(word, currentCombo, usedWords) {
    if (!word || word.length === 0) {
        return protocol_1.TurnResult.WRONG;
    }
    const upperWord = word.toUpperCase();
    // Check if word was already used
    if (usedWords.has(upperWord)) {
        return protocol_1.TurnResult.ALREADY_USED;
    }
    // Check if word contains the combo
    if (!upperWord.includes(currentCombo.toUpperCase())) {
        return protocol_1.TurnResult.WRONG;
    }
    // Check if word exists in dictionary
    if (!wordSet.has(upperWord)) {
        return protocol_1.TurnResult.WRONG;
    }
    return protocol_1.TurnResult.CORRECT;
}
function wordExists(word) {
    return wordSet.has(word.toUpperCase());
}
function getValidWordsForCombo(combo, usedWords) {
    const validWords = [];
    const upperCombo = combo.toUpperCase();
    for (const word of wordSet) {
        if (word.includes(upperCombo) && !usedWords.has(word)) {
            validWords.push(word);
        }
    }
    return validWords;
}
//# sourceMappingURL=game-logic.js.map