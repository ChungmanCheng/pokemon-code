const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pokemonTypes, skillsForPokemon, chooseSkill, typeEffectiveness } = require('../dist/skills');
const { loadState, PokemonGame, experienceAtLevel } = require('../dist/game');
const pokedex = require('../dist/data/pokedex.json');
const user = (id, level) => ({ id, skills: skillsForPokemon(id, level), skillCooldowns: {} });

test('all 151 species have types and automatically receive up to four level-appropriate skills', () => {
    for (const pokemon of pokedex) {
        assert.ok(pokemonTypes(pokemon.id).length >= 1);
        for (const level of [1, 5, 12, 24, 100]) {
            const skills = skillsForPokemon(pokemon.id, level);
            assert.ok(skills.length >= 1 && skills.length <= 4);
            assert.ok(skills.every(skill => skill.unlockLevel <= level));
        }
    }
    assert.ok(skillsForPokemon(1, 5).some(skill => skill.name === 'Vine Whip'));
    assert.ok(skillsForPokemon(4, 5).some(skill => skill.name === 'Ember'));
    assert.ok(skillsForPokemon(7, 5).some(skill => skill.name === 'Water Gun'));
});

test('Pokemon chooses an effective skill and avoids a resisted move automatically', () => {
    const charmander = user(4, 5);
    assert.equal(chooseSkill(charmander, 1).name, 'Ember');
    assert.equal(chooseSkill(charmander, 7).name, 'Tackle');
    assert.equal(typeEffectiveness('electric', 130), 4); // Water/Flying Gyarados.
    assert.equal(typeEffectiveness('ground', 41), 0); // Flying Zubat.
});

test('Struggle prevents immune opponents or unavailable skills from stalling a battle', () => {
    assert.equal(chooseSkill(user(16, 1), 92).name, 'Struggle');
    const fighter = user(4, 5);
    fighter.skills.forEach(skill => { fighter.skillCooldowns[skill.id] = 2; });
    assert.equal(chooseSkill(fighter, 1).name, 'Struggle');
});

test('a Pokemon learns stronger skills on level-up with no user decision', () => {
    const state = loadState({ pokemon_boxes: [{ id: 4, experience: experienceAtLevel(12) - 5 }] }, pokedex);
    const game = new PokemonGame(state, pokedex);
    assert.equal(game.active.level, 11);
    assert.ok(!game.active.skills.some(skill => skill.name === 'Flame Burst'));
    game.recordActivity(100, 'auto');
    assert.equal(game.active.level, 12);
    assert.ok(game.active.skills.some(skill => skill.name === 'Flame Burst'));
    assert.ok(game.state.log.some(line => line.includes('learned') && line.includes('Flame Burst')));
});

test('automatic battles rotate skills during cooldowns and restore them when ready', () => {
    const state = loadState({ pokemon_boxes: [{ id: 4, experience: experienceAtLevel(24) }] }, pokedex);
    const game = new PokemonGame(state, [pokedex[0]], () => 0.4);
    game.recordActivity(1, 'battle');
    game.active.hp = game.active.maxHp = 10000;
    game.state.encounter.pokemon.hp = game.state.encounter.pokemon.maxHp = 10000;
    game.autoTurn();
    assert.equal(game.active.lastSkill, 'Flamethrower');
    game.autoTurn();
    assert.notEqual(game.active.lastSkill, 'Flamethrower');
    game.autoTurn();
    assert.notEqual(game.active.lastSkill, 'Flamethrower');
    game.autoTurn();
    assert.equal(game.active.lastSkill, 'Flamethrower');
});

test('the team automatically picks a partner suited to the opponent', () => {
    const state = loadState({ pokemon_boxes: [{ id: 1 }, { id: 4 }] }, pokedex);
    const game = new PokemonGame(state, [pokedex[0]], () => 0);
    game.recordActivity(1, 'auto');
    assert.equal(game.active.id, 4);
});

test('older saves acquire skills and active skill cooldowns survive reloading', () => {
    const legacy = loadState({ pokemon_boxes: [{ id: 25 }] }, pokedex);
    assert.ok(legacy.pokemon_boxes[0].skills.some(skill => skill.name === 'Thunder Shock'));
    const state = loadState({ pokemon_boxes: [{ id: 4, experience: experienceAtLevel(24) }] }, pokedex);
    const game = new PokemonGame(state, pokedex, () => 0);
    game.recordActivity(1, 'battle');
    const skill = game.active.skills.find(skill => skill.cooldown > 0);
    game.active.skillCooldowns[skill.id] = 2;
    game.active.lastSkill = skill.name;
    const restored = loadState(JSON.parse(JSON.stringify(game.state)), pokedex);
    assert.deepEqual(restored, game.state);
});
