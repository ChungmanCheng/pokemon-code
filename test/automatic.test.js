const assert = require('node:assert/strict');
const { test } = require('node:test');
const { AutomaticEncounters } = require('../dist/AutomaticEncounters');
const { loadState, PokemonGame } = require('../dist/game');
const pokedex = require('../dist/data/pokedex.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('automatic encounters keep turning when coding stops; frequent refreshes do not reset the timer', async () => {
    let turns = 0;
    const runner = new AutomaticEncounters(() => turns < 2, () => 500, () => { turns++; });
    runner.sync();
    const refresh = setInterval(() => runner.sync(), 50);
    try {
        await delay(1150);
        assert.equal(turns, 2);
    } finally {
        clearInterval(refresh);
        runner.dispose();
    }
});

test('paused and disposed encounter timers cannot advance a battle', async () => {
    let enabled = true;
    let turns = 0;
    const runner = new AutomaticEncounters(() => enabled, () => 500, () => { turns++; });
    runner.sync();
    enabled = false;
    runner.sync();
    await delay(550);
    assert.equal(turns, 0);
    enabled = true;
    runner.sync();
    runner.dispose();
    runner.sync();
    await delay(550);
    assert.equal(turns, 0);
});

test('Pokemon automatically weaken and collect a new species without gameplay choices', () => {
    const game = new PokemonGame(loadState(undefined, pokedex), pokedex, () => 0.15);
    game.recordActivity(1, 'auto');
    const wild = game.state.encounter.pokemon;
    for (let turn = 0; turn < 12 && game.state.encounter; turn++) { game.autoTurn(); }
    assert.equal(game.state.encounter, undefined);
    assert.equal(game.state.trainer.editBatches, 1);
    assert.ok(game.state.pokemon_boxes.some(pokemon => pokemon.uid === wild.uid));
    assert.equal(game.state.trainer.pokemonCaught, 1);
    assert.equal(game.itemCount('Pokeball'), 52); // One used, then three earned from the trainer level-up.
});

test('older manual encounters migrate to automatic play', () => {
    const game = new PokemonGame(loadState(undefined, pokedex), pokedex);
    game.recordActivity(1, 'battle');
    const oldSave = JSON.parse(JSON.stringify(game.state));
    oldSave.encounter.mode = 'manual';
    assert.equal(loadState(oldSave, pokedex).encounter.mode, 'auto');
});
