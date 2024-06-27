const { settings, loadModule, characterStorage } = mod.getContext(import.meta);

export class PileOfPetsManager extends StatProvider {
    constructor() {
        super();
        this.petCount = new Map();
        this.validPets = game.pets.filter(this.petFilter);
        this.notificationToggle = settings.section('Pile of Pets').get('notificationToggle');
        this.initialRequired = settings.section('Pile of Pets').get('initialRequired');
        this.tierScaling = settings.section('Pile of Pets').get('tierScaling');
        this.maxTier = settings.section('Pile of Pets').get('maxTier');
        this.multiplierPerTier = settings.section('Pile of Pets').get('multiplierPerTier');
        this.updateExample();

        // Credits to Psycast (Equipment Presents) and Slash (Skill Boosts) for the following "CRCSave" system
        // https://mod.io/g/melvoridle/m/psy-equipment-presets
        // https://mod.io/g/melvoridle/m/skill-boosts
        // crc32
		this.crcTable = [];
		this.crcMap;
		this.SAVE_VERSION = 1;

		this.makeCRCTable();
		this.crcCreateMapID();
		this.load();

		delete this.crcMap.from;
        
        game.combat.registerStatProvider(this);
    }

    petFilter(pet) {
        let isSkill = game.skills.find(skill => skill.pets.includes(pet)) !== undefined;
        let isDungeon = game.dungeons.find(dungeon => dungeon.pet && dungeon.pet.pet === pet && dungeon.fixedPetClears === false && dungeon.pet.weight > 1) !== undefined
        let isAbyssDepth = game.abyssDepth && game.abyssDepths.find(abyssDepth => abyssDepth.pet && abyssDepth.pet.pet === pet && abyssDepth.fixedPetClears === false && abyssDepth.pet.weight > 1) !== undefined
        let isSlayerArea = game.slayerAreas.find(slayerArea => slayerArea.pet && slayerArea.pet.pet === pet && slayerArea.pet.weight > 1) !== undefined
        let isStronghold = game.strongholds && game.strongholds.find(stronghold => stronghold.pet && stronghold.pet.pet === pet && stronghold.pet.weight > 1) !== undefined
        return isSkill || isDungeon || isSlayerArea || isAbyssDepth || isStronghold;
    }

	makeCRCTable() {
		var c;
		for (var n = 0; n < 256; n++) {
			c = n;
			for (var k = 0; k < 8; k++) {
				c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
			}
			this.crcTable[n] = c;
		}
	}

	crc32(str) {
		var crc = 0 ^ (-1);
		for (var i = 0; i < str.length; i++) {
			crc = (crc >>> 8) ^ this.crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
		}
		return (crc ^ (-1)) >>> 0;
	}

	crcCreateMapID() {
		const crcStrings = [
			...game.pets.allObjects
		];
		let mappedIDs = crcStrings.map(item => item.id);
		const items = [...new Set(mappedIDs)]; // deduplicate
		const crcFrom = new Map(items.map(item => [this.crc32(item), item]));
		const crcTo = new Map(items.map(item => [item, this.crc32(item)]));

		if (items.length !== crcFrom.size || items.length !== crcTo.size) {
			console.warn(`[Pile of Pets] CRC Array length doesn't match Map sizes, possible duplicate!`);
		}
		this.crcMap = {
			from: crcFrom,
			to: crcTo
		};
	};

	readMapping(crc) {
		if (crc === 0x0)
			return null;

		const item = this.crcMap.from.get(crc);
		if (!item) {
			//console.warn(`[Skill Boosts] Decoded CRC had no matching item: 0x${crc.toString(16)}`);
			return null;
		}
		return item;
	};

    load() {
		const compressedData = characterStorage.getItem('saveData');
		if(compressedData) {
			this.decode(compressedData);
        }
        
        let pile = characterStorage.getItem('count');
        if(pile !== undefined) {
            for(let id in pile) {
                let pet = game.pets.getObjectByID(id);
                let count = pile[id];
                this.petCount.set(pet, count);
            }
            this.save();
            characterStorage.removeItem('count');
        }

        this.validPets.forEach(pet => {
            game.completion.renderQueue.pets.add(pet);
        });

        this.computeProvidedStats(false);
    }

    save() {
		const compressedData = this.encode();
		try {
			characterStorage.setItem('saveData', compressedData);
		} catch (e) {
			notifyPlayer(game.combat, `[Pile of Pets]: ${e}`, 'danger');
		}
    }

    updateExample() {
        let totalCountForTier = 0;
        let breakpoints = [];
        let sampleTiers = 5;
        if(this.maxTier > 0)
            sampleTiers = Math.min(sampleTiers, this.maxTier);
        for(let i = 0; i<sampleTiers; i++) {
            let countForTier = this.countForTier(i);
            let mult = this.multiplierFromTier(i+1);
            totalCountForTier += countForTier;
            breakpoints.push(`<span class="text-warning"><small>Tier ${i+1}: ${countForTier} (${totalCountForTier} Total) ${mult+1}x Multiplier</small></span>`);
        }
        settings.section('Pile of Pets').set('example', `${breakpoints.join('<br>')}`);
        this.validPets.forEach(pet => {
            game.completion.renderQueue.pets.add(pet);
        });
    }

    setNotificationToggle(value) {
        this.notificationToggle = value;
    }

    setInitialRequired(value) {
        if(Number.isSafeInteger(value) && value >= 1) {
            this.initialRequired = value;
            this.updateExample();
            this.computeProvidedStats();
            return true;
        } else {
            return false;
        }
    }

    setTierScaling(value) {
        if(value >= 1) {
            this.tierScaling = value;
            this.updateExample();
            this.computeProvidedStats();
            return true;
        } else {
            return false;
        }
    }

    setMaxTier(value) {
        if(Number.isSafeInteger(value) && value >= 0) {
            this.maxTier = value;
            this.updateExample();
            this.computeProvidedStats();
            return true;
        } else {
            return false;
        }
    }

    setMultiplierPerTier(value) {
        if(value > 0) {
            this.multiplierPerTier = value;
            this.updateExample();
            this.computeProvidedStats();
            return true;
        } else {
            return false;
        }
    }

    isValidPet(pet) {
        return this.validPets.includes(pet);
    }

    addPet(pet) {
        if(game.petManager.unlocked.has(pet) && this.isValidPet(pet)) {
            let count = this.getPetCount(pet) + 1;
            this.petCount.set(pet, count);
            this.save();
            this.computeProvidedStats();
            this.firePetUnlockModal(pet, count);
            game.completion.renderQueue.pets.add(pet);
        }
    }

    firePetUnlockModal(pet, count) {
        let tier = game.pileofpets.tierFromCount(count);
        let currentCount = game.pileofpets.currentTierCount(pet);
        let countForTier = game.pileofpets.countForTier(tier);
        let multiplier = game.pileofpets.multiplierFromTier(tier);

        if(tier > 0 && tier === game.pileofpets.maxTier)
            countForTier = '∞';

        if(this.notificationToggle) {
            game.combat.notifications.add({
                type: 'Player',
                args: [pet, `${pet.name} added to your collection.`, 'success', 1],
            })
        } else {
            addModalToQueue({
                title: "A Fine Addition To Your Collection",
                html: `<span class="text-success">${pet.name}</span><br><small class="text-info">${pet.description}</small><br><div class="row no-gutters"><div class="col-12 text-center"><small class="text-warning">Tier ${tier} Pile</small></div><div class="col-4 text-left"><small class="text-muted">${currentCount} / ${countForTier} to next</small></div><div class="col-4 text-center"><small class="text-muted">${multiplier + 1}x Multiplier</small></div><div class="col-4 text-right"><small class="text-muted">${count} Extras Found</small></div></div>`,
                imageUrl: pet.media,
                imageWidth: 128,
                imageHeight: 128,
                imageAlt: pet.name,
            });
        }
    }

    getPetCount(pet) {
        return this.petCount.get(pet) || 0;
    }

    tierFromCount(count) {
        let maxTier = this.maxTier === 0 ? Infinity : this.maxTier;
        let totalCountForTier = 0;
        for(let tier = 0; tier < maxTier; tier++) {
            totalCountForTier += this.countForTier(tier);
            if(count < totalCountForTier)
                return tier;
        }
        return maxTier;
    }

    currentTierCount(pet) {
        let maxTier = this.maxTier === 0 ? Infinity : this.maxTier;
        let count = this.getPetCount(pet);
        for(let tier = 0; tier < maxTier; tier++) {
            let tierCount = this.countForTier(tier);
            if(count < tierCount)
                return count;
            count -= tierCount;
        }
        return count;
    }

    countForTier(tier) {
        return Math.round(this.initialRequired * Math.pow(this.tierScaling, tier));
    }

    multiplierFromTier(tier) {
        return Math.round(tier * this.multiplierPerTier);
    }

    computeProvidedStats(updatePlayers=true) {
        this.reset();
        this.petCount.forEach((count, pet) => {
            let tier = this.tierFromCount(count);
            let mult = this.multiplierFromTier(tier);
            this.addStatObject(pet, pet.stats, mult, mult);
        });
        if(updatePlayers) {
            game.combat.computeAllStats();
        }
    }
	decode(saveString) {
		const reader = new SaveWriter('Read', 1);
		try {
			reader.setRawData(fflate.unzlibSync(fflate.strToU8(atob(saveString), true)).buffer);

			let MAGIC = reader.getString();
			if (MAGIC !== 'PLMV') {
				console.error("[Pile of Pets] Invalid Preset Config Magic:", MAGIC.substr(0, 4));
				return [];
			}

			let version = reader.getUint16();
			if (version > this.SAVE_VERSION)
				throw new Error('[Pile of Pets] Save version higher then script version.');

			let len = reader.getUint16();
			for (let i = 0; i < len; i++) {
				let petID = this.readMapping(reader.getUint32());
				let count = reader.getUint32();
				if (petID !== null && count !== null) {
                    let pet = game.pets.getObjectByID(petID);
					if(typeof pet !== 'string')
                        this.petCount.set(pet, count);
                }
			}
		} catch (_a) {
			console.error("[Pile of Pets] Config Reader Error", _a);
		}
	}

	encode() {
		let writer = new SaveWriter('Write', 128);
		const writeUint32 = (value) => writer.writeUint32(this.crcMap.to.get(value) || 0);

		writer.writeString('PLMV');
		writer.writeUint16(this.SAVE_VERSION);

		writer.writeUint16(this.petCount.size);
		this.petCount.forEach((count, pet) => {
			writeUint32(pet.id);
			writer.writeUint32(count);
		});

		const rawSaveData = writer.getRawData();
		const compressedData = fflate.strFromU8(fflate.zlibSync(new Uint8Array(rawSaveData)), true);
		const saveString = btoa(compressedData);
		return saveString;
	};
}