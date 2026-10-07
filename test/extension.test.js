const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadState, PokemonGame, experienceAtLevel, levelForExperience } = require('../dist/game');
const pokedex = require('../dist/data/pokedex.json');

function game(random = () => 0) {
    return new PokemonGame(loadState(undefined, pokedex), pokedex, random);
}

test('migrates legacy catches, preserves supplies, and separates species EXP from earned XP', () => {
    const state = loadState({ items: [{ name: 'Pokeball', amount: 7 }], pokemon_boxes: [pokedex[24], pokedex[24]] }, pokedex);
    assert.equal(state.items[0].amount, 7);
    assert.equal(state.pokemon_boxes[0].name, 'Pikachu');
    assert.equal(state.pokemon_boxes[0].exp, pokedex[24].exp);
    assert.equal(state.pokemon_boxes[0].level, 5);
    assert.equal(state.pokemon_boxes[0].experience, experienceAtLevel(5));
    assert.notEqual(state.pokemon_boxes[0].uid, state.pokemon_boxes[1].uid);
    assert.equal(state.activePokemonId, state.pokemon_boxes[0].uid);
});

test('new journeys use the selected starter and malformed saves cannot produce invalid levels or negative items', () => {
    assert.equal(loadState(undefined, pokedex, 4).pokemon_boxes[0].name, 'Charmander');
    const state = loadState({ trainer: { experience: -20 }, items: [{ name: 'Pokeball', amount: -3 }], pokemon_boxes: [{ id: 9999 }] }, pokedex);
    assert.equal(state.trainer.level, 1);
    assert.equal(state.items[0].amount, 0);
    assert.equal(state.pokemon_boxes.length, 1);
});

test('level thresholds and the level cap are consistent', () => {
    assert.equal(levelForExperience(24), 1);
    assert.equal(levelForExperience(25), 2);
    assert.equal(levelForExperience(99), 2);
    assert.equal(levelForExperience(100), 3);
    assert.equal(levelForExperience(Number.MAX_SAFE_INTEGER), 100);
});

test('code batches award trainer and active Pokemon XP; code edits earn XP without manually advancing the background battle', () => {
    const journey = game();
    const startXp = journey.active.experience;
    journey.recordActivity(2, 'auto');
    assert.equal(journey.state.encounter, undefined);
    journey.recordActivity(2, 'auto');
    assert.ok(journey.state.encounter);
    const hp = journey.state.encounter.pokemon.hp;
    journey.recordActivity(2, 'auto');
    assert.equal(journey.state.encounter.pokemon.hp, hp);
    assert.equal(journey.active.experience, startXp + 30);
    assert.equal(journey.state.trainer.experience, 24);
    journey.recordActivity(2, 'auto');
    assert.equal(journey.state.trainer.level, 2);
});

test('automatic battle turns award XP, supplies, and recovery without further edits', () => {
    const journey = game();
    journey.recordActivity(1, 'battle');
    const wild = journey.state.encounter.pokemon;
    const startHp = wild.hp;
    journey.autoTurn();
    assert.ok(wild.hp < startHp);
    wild.hp = 1;
    const xp = journey.active.experience;
    const balls = journey.itemCount('Pokeball');
    journey.autoTurn();
    assert.equal(journey.state.encounter, undefined);
    assert.equal(journey.state.trainer.battlesWon, 1);
    assert.ok(journey.active.experience > xp);
    assert.ok(journey.itemCount('Pokeball') >= balls + 2);
    assert.equal(journey.active.hp, journey.active.maxHp);
});

test('losing a battle recovers the team and permits the next encounter', () => {
    const journey = game(() => 0.99);
    journey.recordActivity(1, 'battle');
    journey.active.hp = 1;
    journey.autoTurn();
    assert.equal(journey.state.encounter, undefined);
    assert.equal(journey.state.trainer.battlesWon, 0);
    assert.equal(journey.active.hp, journey.active.maxHp);
    journey.recordActivity(1, 'battle');
    assert.ok(journey.state.encounter);
});

test('failed catches consume one ball and one berry boost, never negative supplies', () => {
    const journey = game(() => 0.99);
    journey.recordActivity(1, 'catch');
    const berries = journey.itemCount('Razzberry');
    journey.feedBerry();
    journey.feedBerry();
    assert.equal(journey.itemCount('Razzberry'), berries - 1);
    assert.equal(journey.state.encounter.berry, true);
    const balls = journey.itemCount('Pokeball');
    journey.catch('Pokeball');
    assert.equal(journey.itemCount('Pokeball'), balls - 1);
    assert.equal(journey.state.encounter.berry, false);
    journey.state.items.find(item => item.name === 'Pokeball').amount = 0;
    journey.catch('Pokeball');
    assert.equal(journey.itemCount('Pokeball'), 0);
    assert.equal(journey.state.pokemon_boxes.length, 1);
});

test('weakening a wild Pokemon improves catch odds', () => {
    const healthy = game(() => 0.6);
    healthy.recordActivity(1, 'auto');
    healthy.catch('Pokeball');
    assert.ok(healthy.state.encounter);
    const weakened = game(() => 0.6);
    weakened.recordActivity(1, 'auto');
    weakened.state.encounter.pokemon.hp = 1;
    weakened.catch('Pokeball');
    assert.equal(weakened.state.encounter, undefined);
    assert.equal(weakened.state.pokemon_boxes.length, 2);
});

test('automatic capture works without prompts and catches retain their individual levels', () => {
    const journey = game();
    journey.recordActivity(1, 'catch');
    const wild = journey.state.encounter.pokemon;
    journey.autoTurn();
    assert.equal(journey.state.encounter, undefined);
    assert.equal(journey.state.pokemon_boxes[1].uid, wild.uid);
    assert.equal(journey.state.pokemon_boxes[1].level, wild.level);
    assert.equal(journey.state.trainer.pokemonCaught, 1);
    assert.ok(journey.state.pokemon_boxes.some(pokemon => pokemon.uid === wild.uid));
});

test('automatic capture falls back to battle when out of balls', () => {
    const journey = game();
    journey.state.items.forEach(item => { item.amount = 0; });
    journey.recordActivity(1, 'catch');
    const hp = journey.state.encounter.pokemon.hp;
    journey.autoTurn();
    assert.equal(journey.state.encounter.mode, 'battle');
    assert.ok(journey.state.encounter.pokemon.hp < hp);
});

test('serialized state resumes the same battle and active Pokemon', () => {
    const journey = game();
    journey.recordActivity(1, 'battle');
    journey.autoTurn();
    const restored = loadState(JSON.parse(JSON.stringify(journey.state)), pokedex);
    assert.deepEqual(restored, journey.state);
});

test('running clears encounter-only effects before another encounter', () => {
    const journey = game();
    journey.recordActivity(1, 'auto');
    journey.feedBerry();
    journey.run();
    journey.recordActivity(1, 'auto');
    assert.equal(journey.state.encounter.berry, false);
});
