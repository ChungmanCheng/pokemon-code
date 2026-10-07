const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadState, PokemonGame, experienceAtLevel, maxHp } = require('../dist/game');
const { nextEvolution } = require('../dist/evolution');
const { pokemonTypes, skillsForPokemon } = require('../dist/skills');
const pokedex = require('../dist/data/pokedex.json');
const rules = require('../dist/data/evolution-data.json');

function journey(id, experience, uid = 'evolution-test') {
    return new PokemonGame(loadState({ trainer: { pokemonCaught: 0 }, pokemon_boxes: [{ id, experience, uid }] }, pokedex), pokedex, () => 0);
}

test('coding XP evolves each starter at the threshold and keeps its identity and progress', () => {
    for (const [id, target] of [[1, 2], [4, 5], [7, 8]]) {
        const game = journey(id, experienceAtLevel(16) - 5);
        assert.equal(game.active.id, id);
        const uid = game.active.uid;
        const xp = game.active.experience;
        const result = game.recordActivity(100, 'auto');
        assert.equal(game.active.id, target);
        assert.equal(game.active.uid, uid);
        assert.equal(game.state.activePokemonId, uid);
        assert.equal(game.active.experience, xp + 10);
        assert.equal(game.active.level, 16);
        assert.equal(game.active.exp, pokedex[target - 1].exp);
        assert.equal(game.active.maxHp, maxHp(pokedex[target - 1], 16));
        assert.deepEqual(game.active.skills, skillsForPokemon(target, 16));
        assert.ok(result.messages.some(line => line.includes('evolved into')));
        assert.equal(game.state.pokemon_boxes.length, 1);
        assert.equal(game.state.trainer.pokemonCaught, 0);
    }
});

test('battle and capture rewards can evolve the partner without extra coding or decisions', () => {
    for (const mode of ['battle', 'catch']) {
        const game = journey(1, experienceAtLevel(16) - 20);
        game.recordActivity(1, mode);
        assert.equal(game.active.id, 1);
        game.state.encounter.pokemon.hp = 1;
        game.autoTurn();
        assert.equal(game.active.id, 2);
        assert.equal(game.state.encounter, undefined);
        assert.ok(game.state.log.some(line => line === 'Bulbasaur evolved into Ivysaur!'));
    }
});

test('saved collections catch up multiple evolution stages and remain unchanged on reload', () => {
    const game = journey(1, experienceAtLevel(40) + 123);
    assert.equal(game.active.id, 3);
    assert.equal(game.active.experience, experienceAtLevel(40) + 123);
    assert.equal(game.active.level, 40);
    assert.ok(game.state.log.includes('Bulbasaur evolved into Ivysaur!'));
    assert.ok(game.state.log.includes('Ivysaur evolved into Venusaur!'));
    const saved = JSON.parse(JSON.stringify(game.state));
    const restored = new PokemonGame(loadState(saved, pokedex), pokedex);
    assert.deepEqual(restored.state, saved);
});

test('evolution during an encounter retains damage and valid cooldowns while refreshing types and skills', () => {
    const state = loadState({ pokemon_boxes: [{ id: 129, experience: experienceAtLevel(20) - 15 }] }, pokedex);
    const game = new PokemonGame(state, pokedex, () => 0);
    game.recordActivity(1, 'battle');
    // Crossing the threshold in a battle must not heal existing damage.
    const damage = 13;
    game.active.hp = game.active.maxHp - damage;
    game.active.skillCooldowns = { 'bubble-beam': 2, 'unknown-old-move': 2 };
    game.active.lastSkill = 'Bubble Beam';
    game.recordActivity(100, 'auto');
    assert.equal(game.active.id, 130);
    assert.equal(game.active.maxHp - game.active.hp, damage);
    assert.deepEqual(pokemonTypes(game.active.id), ['water', 'flying']);
    assert.deepEqual(game.active.skills, skillsForPokemon(130, game.active.level));
    assert.equal(game.active.skillCooldowns['unknown-old-move'], undefined);
    assert.equal(game.active.skillCooldowns['bubble-beam'], 2);
    assert.equal(game.active.lastSkill, 'Bubble Beam');
    assert.ok(game.state.encounter);
    game.autoTurn();
    assert.ok(game.state.log.some(line => line.startsWith('Gyarados used ')));
});

test('evolution removes moves that no longer fit the automatic learnset', () => {
    const game = journey(5, experienceAtLevel(36) - 15);
    game.recordActivity(1, 'battle');
    game.active.skillCooldowns = { ember: 1, flamethrower: 2 };
    game.active.lastSkill = 'Ember';
    game.recordActivity(100, 'auto');
    assert.equal(game.active.id, 6);
    assert.equal(game.active.skillCooldowns.ember, undefined);
    assert.equal(game.active.skillCooldowns.flamethrower, 2);
    assert.equal(game.active.lastSkill, undefined);
    assert.ok(game.active.skills.some(skill => skill.name === 'Air Slash'));
});

test('stone and trade paths happen at level 36 and Eevee branches are stable and varied', () => {
    for (const [id, target] of [[25, 26], [64, 65], [67, 68], [75, 76], [93, 94]]) {
        assert.equal(journey(id, experienceAtLevel(36) - 5).active.id, id);
        const game = journey(id, experienceAtLevel(36) - 5);
        game.recordActivity(100, 'auto');
        assert.equal(game.active.id, target);
    }
    const branches = new Set();
    for (const uid of ['eevee-a', 'eevee-b', 'eevee-c']) {
        const game = journey(133, experienceAtLevel(36), uid);
        branches.add(game.active.id);
        assert.equal(journey(133, experienceAtLevel(36), uid).active.id, game.active.id);
        assert.ok([134, 135, 136].includes(game.active.id));
        assert.equal(game.active.uid, uid);
    }
    assert.equal(branches.size, 3);
});

test('eligible new catches evolve only after capture, including inactive team members', () => {
    const game = journey(3, experienceAtLevel(40));
    game.recordActivity(1, 'catch');
    const wild = game.state.encounter.pokemon;
    assert.equal(wild.id, 1);
    const uid = wild.uid;
    const xp = wild.experience;
    game.autoTurn();
    const caught = game.state.pokemon_boxes.find(pokemon => pokemon.uid === uid);
    assert.equal(caught.id, 3);
    assert.equal(caught.experience, xp);
    assert.notEqual(caught.uid, game.state.activePokemonId);
    assert.equal(game.state.trainer.pokemonCaught, 1);
    assert.ok(game.state.log.some(line => line.startsWith('Caught Bulbasaur')));
});

test('all bundled paths have valid species, stop at final forms, and respect their thresholds', () => {
    assert.equal(rules.length, 72);
    for (const rule of rules) {
        const targets = rule.from === 133 ? [134, 135, 136] : [rule.to];
        assert.ok(pokedex.some(species => species.id === rule.from));
        assert.ok(pokedex.some(species => species.id === rule.to));
        assert.equal(nextEvolution(rule.from, rule.level - 1, 'test', pokedex), undefined);
        assert.ok(targets.includes(nextEvolution(rule.from, rule.level, 'test', pokedex)));
        const game = journey(rule.from, experienceAtLevel(100));
        assert.equal(nextEvolution(game.active.id, 100, game.active.uid, pokedex), undefined);
    }
    assert.equal(journey(150, experienceAtLevel(100)).active.id, 150);
    assert.equal(journey(83, experienceAtLevel(100)).active.id, 83);
    assert.equal(nextEvolution(1, 100, 'test', [pokedex[0]]), undefined);
});

test('catching up a fainted saved partner does not revive it or mutate the wild species', () => {
    const state = loadState({
        pokemon_boxes: [{ id: 1, experience: experienceAtLevel(40), hp: 0 }],
        encounter: { pokemon: { id: 1, experience: experienceAtLevel(40) }, mode: 'battle' }
    }, pokedex);
    const game = new PokemonGame(state, pokedex);
    assert.equal(game.active.id, 3);
    assert.equal(game.active.hp, 0);
    assert.equal(game.state.encounter.pokemon.id, 1);
});
