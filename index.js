require('dotenv').config();
const { promisify } = require('util');
const setTimeoutPromise = promisify(setTimeout);
const mysql = require('mysql2')

const { Client, GatewayIntentBits, Guild } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    port: 3306,
    database: 'rpg'
})
let questParticipants = []
const ALLOWED_SERVER_IDS = ["644156936824160256", "893589424204546119", "1075502284647186492", "1009083557999812699", "517607822440136704"];

client.on('messageCreate', async function (message) {
    try {
        // Vérifier si l'auteur du message est un bot
        if (message.author.bot) return;

        // Vérifier si le serveur est autorisé
        if (!ALLOWED_SERVER_IDS.includes(message.guild.id)) {
            message.reply("Le serveur n'est pas autorisé, contactez Fanatsy#8480");
            return;
        }
        if (message.content === '!register') {
            const [existingUser, _] = await connection
                .promise()
                .query('SELECT * FROM charactère WHERE name = ?', [
                    message.author.username
                ])
            if (existingUser && existingUser.length > 0) {
                message.reply('Utilisateur déjà enregistré')
            } else {
                const [insertRows, insertFields] = await connection
                    .promise()
                    .query(`INSERT INTO charactère (name, str, hp, hpMax, dex, pa, paMax, xp, level, ini, dmgMin, dmgMax, def, type) VALUES (?, 1, 50, 50, 1, 20, 20, 0, 1, 1, 1, 6, 1, 'player')`, [
                        message.author.username
                    ])
                message.reply(`${message.author.username} entre dans l'aventure`)
            }
        }
        if (message.content === '!stats') {
            const playerStats = await getPlayerStats(message.author.username, message);
            if (playerStats) {
                const stats = `**Vie** : ${playerStats.hp}   (Max : ${playerStats.hpMax})\n**Défense** : ${playerStats.def}\n**Force** : ${playerStats.str}\n**Dextérité**: ${playerStats.dex}\n**Point d'Action**: ${playerStats.pa}   (Max: ${playerStats.paMax})\n**Point d'expériences** : ${playerStats.xp}\n**Niveau** : ${playerStats.level}\n**Initiative** : ${playerStats.ini}\n**Gold** : ${playerStats.gold}`;
                message.reply(`${message.author.username} a les statistiques suivantes:\n${stats}`);
            }
        }
        if (message.content === '!equip' || message.content === '!equipment') {
            const playerStats = await getPlayerStats(message.author.username, message);
             showEquip(playerStats, message)
        }
        if (message.content.startsWith('!stats ')) {
            const pseudo = message.content.slice(7);
            const playerStats = await getPlayerStats(pseudo, message);
            if (playerStats) {
                const stats = `**Vie** : ${playerStats.hp}   (Max : ${playerStats.hpMax})\n**Défense** : ${playerStats.def}\n**Force** : ${playerStats.str}\n**Dextérité**: ${playerStats.dex}\n**Point d'Action**: ${playerStats.pa}   (Max: ${playerStats.paMax})\n**Point d'expériences** : ${playerStats.xp}\n**Niveau** : ${playerStats.level}\n**Initiative** : ${playerStats.ini}\n**Gold** : ${playerStats.gold}`;
                message.reply(`${pseudo} a les statistiques suivantes:\n${stats}`);
            }
        }
        if (message.content === '!quest') {
            const index = questParticipants.indexOf(message.author.username);
            if (questParticipants.includes(message.author.username)) {
                message.reply("Vous êtes déjà en quête.");
                return;
            }
            let playerStats = await getPlayerStats(message.author.username, message);
            if (!playerStats) {
                message.reply("Impossible de récupérer les statistiques du joueur.");
                return;
            }
            if (playerStats.pa < 4) {
                isquestrunning = false
                message.reply("Partir en quête nécessite au moin **4** points d'action")
                return
            }
            await connection.promise().query('UPDATE charactère SET pa = ? WHERE id = ?', [playerStats.pa - 4, playerStats.id]);
            questParticipants.push(message.author.username);
            let monster = await getRandomMonster(playerStats.level)

            let fighter = [playerStats, monster];
            // Trier les joueurs par initiative décroissante
            fighter.sort((a, b) => b.ini - a.ini);

            let round = 1;
            let combatDetails = `Vous tombez face à un ${monster.name}\n\n`;
            let questMessage = await message.reply({
                content: combatDetails,
                embeds: [
                    {
                        image: {
                            url: monster.image
                        }
                    }
                ]
            });
            questMessage
            async function combatRound() {
                let attacker = fighter[(round - 1) % 2]; // Alterner les attaquants chaque tour
                let defender = fighter[round % 2];
                const damage = await calculateDamage(attacker, defender, message, monster, combatDetails, questMessage);
                defender.hp -= damage;
                let attackMessages = [];
                if (damage == 0) {
                    attackMessages = [
                        { message: `${attacker.name} tente une attaque mais ${defender.name} a esquivé\n`, rate: 1 },
                        { message: `${attacker.name} attaque mais ${defender.name} esquive de justesse \n`, rate: 1 },
                        { message: `${attacker.name} frappe ${defender.name} mais ${defender.name} esquive rapidement \n`, rate: 1 },
                        { message: `${attacker.name} porte un coup ${defender.name} mais ${defender.name} le pare \n`, rate: 1 },
                    ];
                } else {
                    attackMessages = [
                        { message: `${attacker.name} attaque et inflige **${damage}** points de dégat à ${defender.name}\n`, rate: 1 },
                        { message: `${attacker.name} se rue sur ${defender.name} et lui occasionne **${damage}** points de dégat \n`, rate: 1 },
                        { message: `${attacker.name} frappe ${defender.name} et lui inflige **${damage}** points de dégat \n`, rate: 1 },
                        { message: `${attacker.name} bondit et blesse ${defender.name} de **${damage}** points de dégat \n`, rate: 1 },
                        { message: `${attacker.name} assène un coup infligeant **${damage}** points de dégat à ${defender.name}\n`, rate: 1 },
                    ];
                }
                // Sélectionner aléatoirement un message en fonction des taux
                let selectedMessage = selectMessageWithRate(attackMessages);

                // Ajouter le message d'attaque à la variable combatDetails
                combatDetails += selectedMessage.message;

                // mettre à jour le message avec les nouvelles informations
                questMessage = await questMessage.edit({
                    content: combatDetails,
                    embeds: [
                        {
                            image: {
                                url: monster.image
                            }
                        }
                    ]
                });
                // Vérifier si l'un des joueurs a atteint 0 points de vie
                if (defender.hp <= 0) {
                    defender.hp = 0
                    
                    if (defender.type === "player") {
                        const victoryMessage = `${attacker.name} remporte le combat !`;
                        const finalMessage = `${defender.name} tombe à 0 HP`;
                        await connection.promise().query('UPDATE charactère SET hp = ? WHERE id = ?', [defender.hp, defender.id]);
                        let endMessage = await message.reply({ content: `${victoryMessage}\n${finalMessage}\n\n` });
                        endMessage

                    } else {
                        const winXp = Math.floor(Math.random() * (defender.xpMax - defender.xpMin + 1)) + defender.xpMin;
                        const victoryMessage = `${attacker.name} remporte le combat !`;
                        const finalMessage = `${attacker.name} fini le combat avec ${attacker.hp} HP et obtient ${winXp} points d'expériences.`;
                        let combatEnd = `${victoryMessage}\n${finalMessage}\n\n`
                        let endMessage = await message.reply({ content: combatEnd });
                        endMessage
                        await connection.promise().query('UPDATE charactère SET hp = ?, xp = ? WHERE id = ?', [attacker.hp, attacker.xp + winXp, attacker.id]);
                        let loot = await lootEquipement(attacker.level)
                        if (!loot) {
                            combatEnd += "No pain no gain\n";
                            endMessage = await endMessage.edit({ content: combatEnd });
                        } else {
                            combatEnd += "Vous obtenez :\n";
                            for (const equipment of loot) {
                                combatEnd += `**${equipment.name}**\n`;
                                endMessage = await endMessage.edit({ content: combatEnd });
                                let itemCurrent = await compareItem(equipment, attacker)
                                newGold = attacker.gold + equipment.gold
                                if (itemCurrent[0].id === equipment.id) {
                                    await connection.promise().query('UPDATE charactère SET gold = ? WHERE id = ?', [newGold, attacker.id]);
                                    combatEnd += `Vous possédez déjà cette équipements, il a été vendu pour ${equipment.gold} Gold\n`;
                                    endMessage = await endMessage.edit({ content: combatEnd });
                                } else {
                                    let response
                                    combatEnd += `Equipement actuel     =>     Equipement trouvé\n${itemCurrent[0].name}     =>     ${equipment.name}\nForce : ${itemCurrent[0].str}     =>     ${equipment.str}\nDégat Min : ${itemCurrent[0].dmgMin}     =>     ${equipment.dmgMin}\nDégat Max : ${itemCurrent[0].dmgMax}     =>     ${equipment.dmgMax}\nDextérité : ${itemCurrent[0].dex}     =>     ${equipment.dex}\nDéfense : ${itemCurrent[0].def}     =>     ${equipment.def}\nDéfense Min : ${itemCurrent[0].defMin}     =>     ${equipment.defMin}\nDéfense Max : ${itemCurrent[0].defMax}     =>     ${equipment.defMax}\nPoint d'action : ${itemCurrent[0].pa}     =>     ${equipment.pa}\n`
                                    combatEnd += `Voulez équipez le nouvel équipement ${equipment.name} ? ("Oui" pour l'équiper, "Non" pour le vendre)\n`;
                                    endMessage = await endMessage.edit({ content: combatEnd });
                                    const filterColl = (m) => m.author.id === message.author.id;
                                    const collector = message.channel.createMessageCollector({ filter: filterColl, time: 60000 });
                                    collector.on('collect', (m) => {
                                        const userMessage = m.content.toLowerCase();

                                        if (['oui', 'o', 'yes', 'y'].includes(userMessage)) {
                                            response = 'oui';

                                            collector.stop();
                                        } else if (['non', 'n', 'no'].includes(userMessage)) {
                                            response = 'non';

                                            collector.stop();
                                        }
                                    });
                                    collector.on('end', async (collected, reason) => {
                                        if (response === 'oui') {
                                            // Traitez le cas où l'équipement est équipé
                                            await changeEquipment(equipment, itemCurrent[0], attacker)
                                            await connection.promise().query('UPDATE charactère SET gold = gold + ? WHERE id = ?', [newGold, attacker.id]);
                                            combatEnd += `Vous avez vendu ${itemCurrent[0].name} pour ${itemCurrent[0].gold} Gold`;
                                            endMessage = await endMessage.edit({ content: combatEnd });
                                        } else {
                                            // Traitez le cas où l'équipement est vendu

                                            await connection.promise().query('UPDATE charactère SET gold = ? WHERE id = ?', [newGold, attacker.id]);
                                            combatEnd += `Vous avez vendu ${equipment.name} pour ${equipment.gold} Gold`;
                                            endMessage = await endMessage.edit({ content: combatEnd });

                                        }
                                    });

                                }
                            };
                        }
                    }
                    isquestrunning = false
                    questParticipants.splice(index, 1);
                    return; // Sortir de la boucle récursive
                }
                round++;
                // Appeler la fonction combatRound() avec un délai de 2 secondes entre chaque tour
                await setTimeoutPromise(2000);
                combatRound();
            }
            // Lancer le premier tour de combat
            combatRound();
        }

    } catch (err) {
        console.log(err);
    }
});

client.login(process.env.DISCORD_TOKEN_RPG);
console.log('Bot RPG est en ligne');

async function updatePA() {
    try {

        // Récupérer tous les personnages
        const [characters, _] = await connection.promise().query('SELECT * FROM charactère');

        // Mettre à jour les PA de chaque personnage
        for (const character of characters) {
            const updatedPA = character.pa + 1;
            if (updatedPA <= character.paMax) {
                // Exécuter la requête de mise à jour
                await connection.promise().query('UPDATE charactère SET pa = ? WHERE id = ?', [updatedPA, character.id]);
                console.log(`PA mis à jour pour le personnage ${character.name}. Nouveau PA : ${updatedPA}`);
            }
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour des PA :', error);
    }
}

async function updateHP() {
    try {

        // Récupérer tous les personnages
        const [characters, _] = await connection.promise().query('SELECT * FROM charactère');

        // Mettre à jour les PA de chaque personnage
        for (const character of characters) {
            const updatedHP = character.hp + 1;
            if (updatedHP <= character.hpMax) {
                // Exécuter la requête de mise à jour
                await connection.promise().query('UPDATE charactère SET hp = ? WHERE id = ?', [updatedHP, character.id]);
                console.log(`HP mis à jour pour le personnage ${character.name}. Nouveau HP : ${updatedHP}`);
            }
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour des HP :', error);
    }
}

async function getPlayerStats(user, message) {
    // Logique pour récupérer les statistiques du joueur
    try {
        // Requête pour récupérer les statistiques du joueur depuis la table "charactère"
        const [results, _] = await connection.promise().query('SELECT * FROM charactère WHERE name = ?', [user]);
        if (results.length > 0) {
            return results[0];
        } else {
            message.reply(`${user} n'est pas dans l'aventure, !register pour la rejoindre.`);
        }
        // Retourner les statistiques du joueur

    } catch (error) {
        console.error('Erreur lors de la récupération des statistiques du joueur :', error);
        return null;
    }
}

async function getRandomMonster(playerLevel) {
    // Exemple de logique pour sélectionner un monstre aléatoire avec le niveau du joueur
    const [results, _] = await connection.promise().query('SELECT * FROM monster WHERE level = ?', [playerLevel]);

    // Générez un index aléatoire pour choisir un monstre de manière aléatoire
    // const randomIndex = Math.floor(Math.random() * results.length);
    // Calculez la somme totale des taux de probabilité
    let totalRate = results.reduce((sum, monster) => sum + monster.rate, 0);

    // Générez un nombre aléatoire entre 0 et la somme totale des taux de probabilité
    let randomValue = Math.random() * totalRate;

    // Parcourez les monstres et sélectionnez le monstre en fonction du taux de probabilité
    let chosenMonster = null;
    for (const monster of results) {
        randomValue -= monster.rate;
        if (randomValue <= 0) {
            chosenMonster = monster;
            break;
        }
    }

    // Retournez le monstre choisi
    return chosenMonster;
}

async function calculateDamage(attacker, defender, message, monster, combatDetails, questMessage) {
    let dodge = ((defender.dex - defender.level) - (attacker.dex - attacker.level))
    if (dodge < 5) {
        dodge = 5
    } else if (dodge > 25) {
        dodge = 25
    }
    // Générer un nombre aléatoire entre 0 et 100 pour déterminer si l'esquive réussit
    const dodgeRoll = Math.random() * 100;
    if (dodgeRoll <= dodge) {

        return 0; // Aucun dégât
    } else {
        const damage = Math.floor(Math.random() * (attacker.dmgMax - attacker.dmgMin + 1)) + Math.floor(attacker.str / 3) + attacker.dmgMin - attacker.level;
        const defense = Math.floor(Math.random() * (defender.defMax - defender.defMin + 1)) + Math.floor(defender.def / 3) + defender.defMin - defender.level;
        let damageF = (damage - defense);
        if (damageF < 1) {
            damageF = 1
        }
        return damageF;
    }
}

// Fonction pour sélectionner aléatoirement un message en fonction des taux
function selectMessageWithRate(messages) {
    let totalRate = 0;
    messages.forEach((message) => {
        totalRate += message.rate;
    });

    let randomRate = Math.random() * totalRate;
    let cumulativeRate = 0;

    for (let i = 0; i < messages.length; i++) {
        cumulativeRate += messages[i].rate;
        if (randomRate <= cumulativeRate) {
            return messages[i];
        }
    }

    // Si aucun message n'est sélectionné, retourner le premier message du tableau
    return messages[0];
}

async function changeEquipment(newEquip, oldEquip, player) {
    // Mettre à jour la valeur du champ correspondant dans la table "charactère"
    await connection
        .promise()
        .query('UPDATE charactère SET ?? = ? WHERE id = ?', [newEquip.type, newEquip.id, player.id]);

    // Soustraire les statistiques de l'ancien équipement des statistiques du joueur
    await connection
        .promise()
        .query(
            'UPDATE charactère SET str = str - ?, dex = dex - ?, hp = hp - ?, hpMax = hpMax - ?, pa = pa - ?, paMax = paMax - ?, def = def - ?, dmgMin = dmgMin - ?, dmgMax = dmgMax - ?, defMin = defMin - ?, defMax = defMax - ? WHERE id = ?',
            [oldEquip.str, oldEquip.dex, oldEquip.hp, oldEquip.hp, oldEquip.pa, oldEquip.pa, oldEquip.def, oldEquip.dmgMin, oldEquip.dmgMax, oldEquip.defMin, oldEquip.defMax, player.id]
        );

    // Ajouter les statistiques du nouvel équipement aux statistiques du joueur
    await connection
        .promise()
        .query(
            'UPDATE charactère SET str = str + ?, dex = dex + ?, hp = hp + ?, pa = pa + ?, def = def + ?, dmgMin = dmgMin + ?, dmgMax = dmgMax + ? WHERE id = ?',
            [newEquip.str, newEquip.dex, newEquip.hp, newEquip.pa, newEquip.def, newEquip.dmgMin, newEquip.dmgMax, player.id]
        );
}



async function compareItem(newItem, player) {
    const [playerEquipmentLoot, _] = await connection
        .promise()
        .query('SELECT ?? FROM charactère WHERE id = ?', [newItem.type, player.id]);

    const playerEquipmentId = playerEquipmentLoot[0][newItem.type];
    const [itemCurrent, itemCurr] = await connection
        .promise()
        .query('SELECT * FROM equipement WHERE id = ?', [playerEquipmentId]);
    return itemCurrent;

}

async function lootEquipement(playerLevel) {
    // Exemple de logique pour sélectionner un monstre aléatoire avec le niveau du joueur
    const [results, _] = await connection.promise().query('SELECT * FROM equipement WHERE level = ?', [playerLevel]);

    // Tableau pour stocker les équipements lootés
    const lootedEquipments = [];

    // Tirer un nombre aléatoire sur 100 pour chaque équipement éligible
    for (const equipment of results) {
        const randomValue = Math.floor(Math.random() * 100) + 1;
        if (randomValue <= equipment.rate) {
            lootedEquipments.push(equipment);
        }
    }
    // Vérifier s'il y a des équipements lootés
    if (lootedEquipments.length === 0) {
        console.log("Aucun équipement looté pour le niveau du joueur.");
        return;
    }

    // Retournez les équipements lootés
    return lootedEquipments;
}

async function showEquip(player, message) {
    const equipmentIds = [player.arme, player.bouclier, player.casque, player.armure, player.gants, player.pieds];
  
    const [equipmentRows, _] = await connection
      .promise()
      .query('SELECT name FROM equipement WHERE id IN (?)', [equipmentIds]);
  
    const equipmentNames = equipmentRows.map(row => row.name);

    // Remplacer les valeurs undefined par "Rien"
    for (let i = 0; i < equipmentIds.length; i++) {
        if (equipmentNames[i] === undefined) {
          equipmentNames[i] = "Rien";
        }
      }
    const equipmentMessage = `Arme : ${equipmentNames[0]}\nArmure : ${equipmentNames[3]}\nBouclier : ${equipmentNames[1]}\nCasque : ${equipmentNames[2]}\nGants : ${equipmentNames[4]}\nChausses : ${equipmentNames[5]}`;
  
    message.reply(equipmentMessage);
  }

// Planifier la tâche de mise à jour toutes les heures
setInterval(updatePA, 60 * 60 * 1000);
setInterval(updateHP, 5 * 60 * 1000);