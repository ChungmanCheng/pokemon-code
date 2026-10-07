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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const ActivityTracker_1 = require("./ActivityTracker");
const AutomaticEncounters_1 = require("./AutomaticEncounters");
const InventoryView_1 = require("./InventoryView");
const PokedexView_1 = require("./PokedexView");
const BattleView_1 = require("./BattleView");
const game_1 = require("./game");
const pokedex_json_1 = __importDefault(require("./data/pokedex.json"));
const storageKey = 'pokemonCode.game.v1';
let tracker;
let encounters;
let pendingSave = Promise.resolve();
function configuration() {
    return vscode.workspace.getConfiguration('pokemonCode');
}
function trackingOptions() {
    const config = configuration();
    return {
        enabled: config.get('enabled', true),
        trackExternalChanges: config.get('trackExternalChanges', true),
        activityCooldownMs: config.get('activityCooldownMs', 3000),
        excludedDirectories: config.get('excludedDirectories', [])
    };
}
async function legacySave(context) {
    try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'dist', 'data', 'savefile.json'));
        return JSON.parse(Buffer.from(bytes).toString('utf8'));
    }
    catch {
        return undefined;
    }
}
async function activate(context) {
    const starter = { Bulbasaur: 1, Charmander: 4, Squirtle: 7 }[configuration().get('starter', 'Bulbasaur')];
    const saved = context.globalState.get(storageKey);
    const game = new game_1.PokemonGame((0, game_1.loadState)(saved ?? await legacySave(context), pokedex_json_1.default, starter), pokedex_json_1.default);
    const output = vscode.window.createOutputChannel('Pokémon Code');
    const editsPerEncounter = () => Math.max(1, configuration().get('editsPerEncounter', 8));
    const inventoryProvider = new InventoryView_1.NodeInventoryProvider(() => game.state);
    const pokedexProvider = new PokedexView_1.NodePokedexProvider(() => game.state, context.extensionUri);
    const battleProvider = new BattleView_1.BattleProvider(game, context.extensionUri, editsPerEncounter);
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    status.command = 'pokemonCode.showBattle';
    let saveErrorReported = false;
    const refresh = () => {
        inventoryProvider.refresh();
        pokedexProvider.refresh();
        battleProvider.refresh();
        const wild = game.state.encounter?.pokemon;
        status.text = `$(zap) ${game.active.name} Lv.${game.active.level}${wild ? ` · ${wild.name} ${wild.hp}/${wild.maxHp} HP` : ` · Trainer Lv.${game.state.trainer.level}`}`;
        status.tooltip = `${(0, game_1.xpProgress)(game.active.level, game.active.experience)}\nYour Pokémon handles battles and captures automatically.${trackingOptions().enabled ? '' : '\nThe journey is paused in settings.'}`;
    };
    const save = () => {
        const snapshot = JSON.parse(JSON.stringify(game.state));
        pendingSave = pendingSave.then(async () => {
            try {
                await context.globalState.update(storageKey, snapshot);
                saveErrorReported = false;
            }
            catch (error) {
                output.appendLine(`Save failed: ${String(error)}`);
                if (!saveErrorReported) {
                    saveErrorReported = true;
                    void vscode.window.showWarningMessage('Pokémon Code could not save your progress. See the Pokémon Code output for details.');
                }
            }
        });
        refresh();
        encounters?.sync();
    };
    const apply = (result) => {
        save();
        result.messages.forEach(message => output.appendLine(message));
        if (configuration().get('notifications', false) && result.messages.length) {
            void vscode.window.showInformationMessage(result.messages.join(' '));
        }
    };
    encounters = new AutomaticEncounters_1.AutomaticEncounters(() => trackingOptions().enabled && !!game.state.encounter, () => configuration().get('turnIntervalMs', 2000), () => apply(game.autoTurn()));
    tracker = new ActivityTracker_1.ActivityTracker(trackingOptions, batch => {
        output.appendLine(`Code activity: ${batch.files} file(s), ${batch.sources.join(' + ')}.`);
        const configured = configuration().get('encounterMode', 'auto');
        const mode = configured === 'catch' || configured === 'battle' ? configured : 'auto';
        apply(game.recordActivity(editsPerEncounter(), mode));
    });
    context.subscriptions.push(encounters, tracker, output, status, inventoryProvider, pokedexProvider, battleProvider, vscode.window.registerTreeDataProvider('package-inventory', inventoryProvider), vscode.window.registerTreeDataProvider('package-pokedex', pokedexProvider), vscode.window.registerTreeDataProvider('package-battle', battleProvider), vscode.commands.registerCommand('extension.showPokemon', () => vscode.commands.executeCommand('package-pokedex.focus')), vscode.commands.registerCommand('extension.showInventory', () => vscode.commands.executeCommand('package-inventory.focus')), vscode.commands.registerCommand('pokemonCode.showBattle', () => vscode.commands.executeCommand('package-battle.focus')), vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('pokemonCode')) {
            refresh();
            encounters?.sync();
        }
    }));
    save();
    status.show();
    output.appendLine('Journey ready. Keep coding; your Pokémon handles encounters automatically.');
    return { getState: () => JSON.parse(JSON.stringify(game.state)) };
}
exports.activate = activate;
function deactivate() {
    encounters?.dispose();
    encounters = undefined;
    tracker?.dispose();
    tracker = undefined;
    return pendingSave;
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map