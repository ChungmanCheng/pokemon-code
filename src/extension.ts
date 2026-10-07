import * as vscode from 'vscode';
import { ActivityTracker, TrackingOptions } from './ActivityTracker';
import { NodeInventoryProvider } from './InventoryView';
import { NodePokedexProvider } from './PokedexView';
import { BattleProvider } from './BattleView';
import { Ball, EncounterMode, GameResult, GameState, loadState, PokemonGame, xpProgress } from './game';
import pokedex from './data/pokedex.json';

const storageKey = 'pokemonCode.game.v1';
let tracker: ActivityTracker | undefined;
let pendingSave: Promise<void> = Promise.resolve();

function configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('pokemonCode');
}

function trackingOptions(): TrackingOptions {
    const config = configuration();
    return {
        enabled: config.get('enabled', true),
        trackExternalChanges: config.get('trackExternalChanges', true),
        activityCooldownMs: config.get('activityCooldownMs', 3000),
        excludedDirectories: config.get('excludedDirectories', [])
    };
}

async function legacySave(context: vscode.ExtensionContext): Promise<unknown> {
    try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'dist', 'data', 'savefile.json'));
        return JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
        return undefined;
    }
}

export async function activate(context: vscode.ExtensionContext): Promise<{ getState(): GameState }> {
    const starter = { Bulbasaur: 1, Charmander: 4, Squirtle: 7 }[configuration().get<'Bulbasaur' | 'Charmander' | 'Squirtle'>('starter', 'Bulbasaur')];
    const saved = context.globalState.get<unknown>(storageKey);
    const game = new PokemonGame(loadState(saved ?? await legacySave(context), pokedex, starter), pokedex);
    const output = vscode.window.createOutputChannel('Pokémon Code');
    const editsPerEncounter = () => Math.max(1, configuration().get('editsPerEncounter', 8));
    const inventoryProvider = new NodeInventoryProvider(() => game.state);
    const pokedexProvider = new NodePokedexProvider(() => game.state, context.extensionUri);
    const battleProvider = new BattleProvider(game, context.extensionUri, editsPerEncounter);
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    status.command = 'pokemonCode.showBattle';
    let saveErrorReported = false;

    const refresh = () => {
        inventoryProvider.refresh();
        pokedexProvider.refresh();
        battleProvider.refresh();
        const wild = game.state.encounter?.pokemon;
        status.text = `$(zap) ${game.active.name} Lv.${game.active.level}${wild ? ` · ${wild.name} ${wild.hp}/${wild.maxHp} HP` : ` · Trainer Lv.${game.state.trainer.level}`}`;
        status.tooltip = `${xpProgress(game.active.level, game.active.experience)}\nClick to open Pokémon Code battles.${trackingOptions().enabled ? '' : '\nCode rewards are paused in settings.'}`;
    };

    const save = () => {
        const snapshot = JSON.parse(JSON.stringify(game.state));
        pendingSave = pendingSave.then(async () => {
            try {
                await context.globalState.update(storageKey, snapshot);
                saveErrorReported = false;
            } catch (error) {
                output.appendLine(`Save failed: ${String(error)}`);
                if (!saveErrorReported) {
                    saveErrorReported = true;
                    void vscode.window.showWarningMessage('Pokémon Code could not save your progress. See the Pokémon Code output for details.');
                }
            }
        });
        refresh();
    };

    const apply = (result: GameResult) => {
        save();
        result.messages.forEach(message => output.appendLine(message));
        if (!configuration().get('notifications', false)) { return; }
        if (result.spawned) {
            const encounterId = result.spawned;
            const wild = game.state.encounter?.pokemon;
            if (!wild) { return; }
            void vscode.window.showInformationMessage(`A wild ${wild.name} (Lv. ${wild.level}) appeared!`, 'Catch', 'Battle', 'Run').then(choice => {
                if (game.state.encounter?.pokemon.uid !== encounterId) { return; }
                if (choice === 'Catch') { void vscode.commands.executeCommand('pokemonCode.catch'); }
                if (choice === 'Battle') { apply(game.attack()); }
                if (choice === 'Run') { apply(game.run()); }
            });
        } else if (result.messages.length) {
            void vscode.window.showInformationMessage(result.messages.join(' '));
        }
    };

    const requiresEncounter = (): boolean => {
        if (game.state.encounter) { return true; }
        void vscode.window.showInformationMessage('Keep editing code to find a wild Pokémon.');
        return false;
    };

    const selectPokemon = async (uid?: string) => {
        if (!uid) {
            const choice = await vscode.window.showQuickPick(game.state.pokemon_boxes.map(pokemon => ({
                label: `${pokemon.name} · Lv. ${pokemon.level}`,
                description: `HP ${pokemon.hp}/${pokemon.maxHp} · ${xpProgress(pokemon.level, pokemon.experience)}${pokemon.uid === game.state.activePokemonId ? ' · Active' : ''}`,
                uid: pokemon.uid
            })), { placeHolder: 'Choose your active Pokémon' });
            uid = choice?.uid;
        }
        if (uid && game.selectPokemon(uid)) { save(); }
    };

    const catchPokemon = async (ball?: Ball) => {
        if (!requiresEncounter()) { return; }
        const encounterId = game.state.encounter?.pokemon.uid;
        if (!ball) {
            const available = (['Pokeball', 'Greatball', 'Ultraball'] as Ball[]).filter(name => game.itemCount(name) > 0);
            if (!available.length) {
                void vscode.window.showInformationMessage('No balls left. Win battles or keep coding to earn more.');
                return;
            }
            const choice = await vscode.window.showQuickPick(available.map(name => ({ label: name, description: `× ${game.itemCount(name)}`, ball: name })), { placeHolder: 'Choose a ball; weaken the wild Pokémon for better odds' });
            if (!choice) { return; }
            ball = choice.ball;
        }
        if (!['Pokeball', 'Greatball', 'Ultraball'].includes(ball) || game.state.encounter?.pokemon.uid !== encounterId) { return; }
        apply(game.catch(ball));
    };

    tracker = new ActivityTracker(trackingOptions, batch => {
        output.appendLine(`Code activity: ${batch.files} file(s), ${batch.sources.join(' + ')}.`);
        const mode = configuration().get<EncounterMode>('encounterMode', 'battle');
        apply(game.recordActivity(editsPerEncounter(), mode));
    });

    context.subscriptions.push(
        output, status, inventoryProvider, pokedexProvider, battleProvider, tracker,
        vscode.window.registerTreeDataProvider('package-inventory', inventoryProvider),
        vscode.window.registerTreeDataProvider('package-pokedex', pokedexProvider),
        vscode.window.registerTreeDataProvider('package-battle', battleProvider),
        vscode.commands.registerCommand('extension.showPokemon', () => selectPokemon()),
        vscode.commands.registerCommand('extension.showInventory', () => vscode.commands.executeCommand('package-inventory.focus')),
        vscode.commands.registerCommand('pokemonCode.showBattle', () => vscode.commands.executeCommand('package-battle.focus')),
        vscode.commands.registerCommand('pokemonCode.selectPokemon', selectPokemon),
        vscode.commands.registerCommand('pokemonCode.battle', () => { if (requiresEncounter()) { apply(game.attack()); } }),
        vscode.commands.registerCommand('pokemonCode.catch', catchPokemon),
        vscode.commands.registerCommand('pokemonCode.feedBerry', () => { if (requiresEncounter()) { apply(game.feedBerry()); } }),
        vscode.commands.registerCommand('pokemonCode.run', () => apply(game.run())),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('pokemonCode')) { refresh(); }
        })
    );
    save();
    status.show();
    output.appendLine('Journey ready. Editor edits and workspace file changes earn XP.');
    return { getState: () => JSON.parse(JSON.stringify(game.state)) as GameState };
}

export function deactivate(): Promise<void> {
    tracker?.dispose();
    tracker = undefined;
    return pendingSave;
}
