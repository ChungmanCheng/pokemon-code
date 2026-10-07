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
exports.NodePokedexProvider = void 0;
const vscode = __importStar(require("vscode"));
const game_1 = require("./game");
const skills_1 = require("./skills");
class NodePokedexProvider {
    constructor(state, extensionUri) {
        this.state = state;
        this.extensionUri = extensionUri;
        this.emitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.emitter.event;
    }
    getTreeItem(element) { return element; }
    getChildren() {
        const state = this.state();
        return state.pokemon_boxes.map(pokemon => {
            const row = new vscode.TreeItem(pokemon.name);
            const active = pokemon.uid === state.activePokemonId;
            row.id = pokemon.uid;
            row.description = `Lv. ${pokemon.level}${active ? ' · Active' : ''}`;
            row.tooltip = `${pokemon.name} · ${(0, skills_1.pokemonTypes)(pokemon.id).join(' / ')}\nLevel ${pokemon.level} · ${(0, game_1.xpProgress)(pokemon.level, pokemon.experience)}\nHP ${pokemon.hp}/${pokemon.maxHp}\nSkills: ${pokemon.skills.map(skill => skill.name).join(', ')}\nBattle partners and skills are chosen automatically.`;
            row.iconPath = vscode.Uri.joinPath(this.extensionUri, 'imgs', 'sprites', `${pokemon.id}.png`);
            return row;
        });
    }
    refresh() { this.emitter.fire(); }
    dispose() { this.emitter.dispose(); }
}
exports.NodePokedexProvider = NodePokedexProvider;
//# sourceMappingURL=PokedexView.js.map