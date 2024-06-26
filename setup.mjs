export async function setup({ loadModule, onCharacterLoaded, patch, settings }) {
    const { PileOfPetsManager } = await loadModule('src/pile-of-pets.mjs');

    settings.type('dynamic-label', {
        render: function(name, onChange, config) {
            const label = createElement('div', {
                id: name,
                children: [config.label]
            });
            return label;
        },
        get: function(root) {},
        set: function(root, data) {
            if(data !== undefined)
                root.innerHTML = data;
        }
    });

    settings.section('Pile of Pets').add([{
        name: 'example',
        type: 'dynamic-label',
        label: 'placeholder'
      }, {
        type: 'number',
        name: 'initialRequired',
        label: 'Initial Count Required',
        min: 1,
        default: 4,
        onChange: function(value, previousValue) {
            return game.pileofpets.setInitialRequired(value);
        }
    }, {
        type: 'number',
        name: 'tierScaling',
        label: 'Scaling for Count per Tier',
        min: 1,
        default: 2,
        onChange: function(value, previousValue) {
            return game.pileofpets.setTierScaling(value);
        }
    }, {
        type: 'number',
        name: 'maxTier',
        label: 'Maximum Tier',
        hint: '0 for infinite',
        min: 0,
        default: 10,
        onChange: function(value, previousValue) {
            return game.pileofpets.setMaxTier(value);
        }
    }, {
        type: 'number',
        name: 'multiplierPerTier',
        label: 'Multiplier per Tier',
        min: 0,
        default: 1,
        onChange: function(value, previousValue) {
            return game.pileofpets.setMultiplierPerTier(value);
        }
    }]);

    patch(PetManager, 'rollForPet').before(function(chance) {
        if(this.unlocked.has(chance.pet)) {
            if(rollPercentage(100 / chance.weight))
                game.pileofpets.addPet(chance.pet);
        }
    });

    patch(PetManager, 'rollForSkillPet').before(function(pet, actionInterval, forceSkill) {
        if(this.unlocked.has(pet)) {
            if(forceSkill === undefined)
                forceSkill = pet.skill;
            if(forceSkill === undefined)
                return;
            const virtualLevel = forceSkill.virtualLevel;
            let chanceForPet = 0;
            if(pet.id !== "melvorD:LarryTheLonelyLizard")
                chanceForPet = ((actionInterval / 1000) * virtualLevel) / 250000;
            else
                chanceForPet = ((actionInterval * virtualLevel) / 25000000) * (1 + this.game.modifiers.skillPetLocationChance / 100);
            if(rollPercentage(chanceForPet))
                game.pileofpets.addPet(pet);
        }
    });

    onCharacterLoaded(async () => {
        game.pileofpets = new PileOfPetsManager();

        patch(PetCompletionElement, 'getPetTooltipHTML').after(function(tooltip, pet, unlocked) {
            if(game.pileofpets.isValidPet(pet) && unlocked) {
                let count = game.pileofpets.getPetCount(pet);
                let tier = game.pileofpets.tierFromCount(count);
                let currentCount = game.pileofpets.currentTierCount(pet);
                let countForTier = game.pileofpets.countForTier(tier);
                let multiplier = game.pileofpets.multiplierFromTier(tier);

                if(tier > 0 && tier === game.pileofpets.maxTier)
                    countForTier = '∞';
                tooltip += `<div class="row no-gutters"><div class="col-12 text-center"><small class="text-warning">Tier ${tier} Pile</small></div><div class="col-4 text-left"><small class="text-muted">${currentCount} / ${countForTier} to next</small></div><div class="col-4 text-center"><small class="text-muted">${multiplier + 1}x Multiplier</small></div><div class="col-4 text-right"><small class="text-muted">${count} Extras Found</small></div></div>`;
            }
            return tooltip;
        });
    });
}