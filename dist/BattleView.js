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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BattleProvider = void 0;
const vscode = __importStar(require("vscode"));
const game_1 = require("./game");
class BattleProvider {
    constructor(game, extensionUri, editsPerEncounter) {
        this.game = game;
        this.extensionUri = extensionUri;
        this.editsPerEncounter = editsPerEncounter;
        this.emitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.emitter.event;
    }
    getTreeItem(element) { return element; }
    row(label, description, command) {
        const row = new vscode.TreeItem(label);
        row.description = description;
        if (command) {
            row.command = { command, title: label };
        }
        return row;
    }
    getChildren() {
        const { state, active } = this.game;
        const trainer = state.trainer;
        const team = this.row(`${active.name} · Lv. ${active.level}`, `HP ${active.hp}/${active.maxHp}`, 'pokemonCode.selectPokemon');
        team.iconPath = vscode.Uri.joinPath(this.extensionUri, 'imgs', 'sprites', `${active.id}.png`);
        team.tooltip = (0, game_1.xpProgress)(active.level, active.experience);
        const rows = [
            this.row(`Trainer · Lv. ${trainer.level}`, (0, game_1.xpProgress)(trainer.level, trainer.experience)),
            team,
            this.row('Journey', `${trainer.editBatches} edit batches · ${trainer.battlesWon} wins · ${trainer.pokemonCaught} catches`)
        ];
        const encounter = state.encounter;
        if (encounter) {
            const wild = encounter.pokemon;
            const row = this.row(`Wild ${wild.name} · Lv. ${wild.level}`, `HP ${wild.hp}/${wild.maxHp}`);
            row.iconPath = vscode.Uri.joinPath(this.extensionUri, 'imgs', 'sprites', `${wild.id}.png`);
            rows.push(row, this.row('Next code edit', encounter.mode === 'manual' ? 'Waiting for your choice' : encounter.mode === 'catch' ? 'Throw a ball' : 'Battle turn'), this.row('Battle / Attack', 'Attack now; keep coding to continue', 'pokemonCode.battle'), this.row('Catch', 'Choose a ball', 'pokemonCode.catch'));
            if (!encounter.berry && this.game.itemCount('Razzberry') > 0) {
                rows.push(this.row('Feed Razzberry', 'Improve catch odds', 'pokemonCode.feedBerry'));
            }
            rows.push(this.row('Run', 'Leave this encounter', 'pokemonCode.run'));
        }
        else {
            rows.push(this.row('Exploring', `${Math.min(state.encounterProgress, this.editsPerEncounter())}/${this.editsPerEncounter()} edit batches to next encounter`));
        }
        state.log.slice(-5).reverse().forEach(message => {
            const row = this.row(message);
            row.tooltip = message;
            rows.push(row);
        });
        return rows;
    }
    refresh() { this.emitter.fire(); }
    dispose() { this.emitter.dispose(); }
}
exports.BattleProvider = BattleProvider;
//# sourceMappingURL=BattleView.js.map