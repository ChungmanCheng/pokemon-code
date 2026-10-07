"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chooseSkill = exports.skillPower = exports.typeEffectiveness = exports.skillsForPokemon = exports.pokemonTypes = void 0;
const battle_data_json_1 = __importDefault(require("./data/battle-data.json"));
const typeMoves = {
    normal: ['Quick Attack', 'Headbutt', 'Body Slam'],
    fighting: ['Karate Chop', 'Low Sweep', 'Brick Break'],
    flying: ['Gust', 'Wing Attack', 'Air Slash'],
    poison: ['Poison Sting', 'Acid', 'Sludge Bomb'],
    ground: ['Mud Slap', 'Bulldoze', 'Earthquake'],
    rock: ['Rock Throw', 'Rock Tomb', 'Rock Slide'],
    bug: ['Struggle Bug', 'Bug Bite', 'Bug Buzz'],
    ghost: ['Lick', 'Shadow Sneak', 'Shadow Ball'],
    steel: ['Metal Claw', 'Mirror Shot', 'Flash Cannon'],
    fire: ['Ember', 'Flame Burst', 'Flamethrower'],
    water: ['Water Gun', 'Bubble Beam', 'Hydro Pump'],
    grass: ['Vine Whip', 'Razor Leaf', 'Solar Beam'],
    electric: ['Thunder Shock', 'Spark', 'Thunderbolt'],
    psychic: ['Confusion', 'Psybeam', 'Psychic'],
    ice: ['Powder Snow', 'Ice Shard', 'Ice Beam'],
    dragon: ['Twister', 'Dragon Breath', 'Dragon Pulse'],
    dark: ['Bite', 'Assurance', 'Dark Pulse'],
    fairy: ['Fairy Wind', 'Disarming Voice', 'Moonblast']
};
const tackle = { id: 'tackle', name: 'Tackle', type: 'normal', power: 30, unlockLevel: 1, cooldown: 0 };
const struggle = { id: 'struggle', name: 'Struggle', type: 'normal', power: 30, unlockLevel: 1, cooldown: 0 };
function pokemonTypes(id) {
    const species = battle_data_json_1.default.speciesTypes;
    return [...(species[String(id)] || ['normal'])];
}
exports.pokemonTypes = pokemonTypes;
/** Simplified, automatic learnsets: up to four skills, with stronger skills at higher levels. */
function skillsForPokemon(id, level) {
    const tiers = [{ level: 5, power: 35, cooldown: 0 }, { level: 12, power: 50, cooldown: 1 }, { level: 24, power: 75, cooldown: 2 }];
    const learned = pokemonTypes(id).flatMap(type => typeMoves[type].flatMap((name, index) => {
        const tier = tiers[index];
        return level >= tier.level ? [{ id: name.toLowerCase().replace(/ /g, '-'), name, type, power: tier.power, unlockLevel: tier.level, cooldown: tier.cooldown }] : [];
    }));
    return [{ ...tackle }, ...learned.sort((a, b) => b.power - a.power).slice(0, 3)];
}
exports.skillsForPokemon = skillsForPokemon;
function typeEffectiveness(attack, defenderId) {
    const chart = battle_data_json_1.default.effectiveness;
    return pokemonTypes(defenderId).reduce((multiplier, type) => multiplier * (chart[attack]?.[type] ?? 1), 1);
}
exports.typeEffectiveness = typeEffectiveness;
function skillPower(skill, attackerId, defenderId) {
    if (skill.id === 'struggle') {
        return skill.power;
    }
    return skill.power * typeEffectiveness(skill.type, defenderId) * (pokemonTypes(attackerId).includes(skill.type) ? 1.2 : 1);
}
exports.skillPower = skillPower;
function chooseSkill(attacker, defenderId) {
    const available = attacker.skills.filter(skill => !attacker.skillCooldowns[skill.id]);
    const best = available.sort((a, b) => skillPower(b, attacker.id, defenderId) - skillPower(a, attacker.id, defenderId))[0];
    // Typeless Struggle prevents immunity or cooldown combinations from stalling a battle.
    return best && skillPower(best, attacker.id, defenderId) > 0 ? best : { ...struggle };
}
exports.chooseSkill = chooseSkill;
//# sourceMappingURL=skills.js.map