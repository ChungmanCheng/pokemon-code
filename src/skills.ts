import data from './data/battle-data.json';

export type PokemonType = 'normal' | 'fighting' | 'flying' | 'poison' | 'ground' | 'rock' | 'bug' | 'ghost' | 'steel'
    | 'fire' | 'water' | 'grass' | 'electric' | 'psychic' | 'ice' | 'dragon' | 'dark' | 'fairy';

export interface Skill {
    id: string;
    name: string;
    type: PokemonType;
    power: number;
    unlockLevel: number;
    cooldown: number;
}

export interface SkillUser {
    id: number;
    skills: Skill[];
    skillCooldowns: Record<string, number>;
}

const typeMoves: Record<PokemonType, readonly string[]> = {
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
const tackle: Skill = { id: 'tackle', name: 'Tackle', type: 'normal', power: 30, unlockLevel: 1, cooldown: 0 };
const struggle: Skill = { id: 'struggle', name: 'Struggle', type: 'normal', power: 30, unlockLevel: 1, cooldown: 0 };

export function pokemonTypes(id: number): PokemonType[] {
    const species = data.speciesTypes as Record<string, PokemonType[]>;
    return [...(species[String(id)] || ['normal'])];
}

/** Simplified, automatic learnsets: up to four skills, with stronger skills at higher levels. */
export function skillsForPokemon(id: number, level: number): Skill[] {
    const tiers = [{ level: 5, power: 35, cooldown: 0 }, { level: 12, power: 50, cooldown: 1 }, { level: 24, power: 75, cooldown: 2 }];
    const learned = pokemonTypes(id).flatMap(type => typeMoves[type].flatMap((name, index) => {
        const tier = tiers[index];
        return level >= tier.level ? [{ id: name.toLowerCase().replace(/ /g, '-'), name, type, power: tier.power, unlockLevel: tier.level, cooldown: tier.cooldown }] : [];
    }));
    return [{ ...tackle }, ...learned.sort((a, b) => b.power - a.power).slice(0, 3)];
}

export function typeEffectiveness(attack: PokemonType, defenderId: number): number {
    const chart = data.effectiveness as Record<string, Record<string, number>>;
    return pokemonTypes(defenderId).reduce((multiplier, type) => multiplier * (chart[attack]?.[type] ?? 1), 1);
}

export function skillPower(skill: Skill, attackerId: number, defenderId: number): number {
    if (skill.id === 'struggle') { return skill.power; }
    return skill.power * typeEffectiveness(skill.type, defenderId) * (pokemonTypes(attackerId).includes(skill.type) ? 1.2 : 1);
}

export function chooseSkill(attacker: SkillUser, defenderId: number): Skill {
    const available = attacker.skills.filter(skill => !attacker.skillCooldowns[skill.id]);
    const best = available.sort((a, b) => skillPower(b, attacker.id, defenderId) - skillPower(a, attacker.id, defenderId))[0];
    // Typeless Struggle prevents immunity or cooldown combinations from stalling a battle.
    return best && skillPower(best, attacker.id, defenderId) > 0 ? best : { ...struggle };
}
