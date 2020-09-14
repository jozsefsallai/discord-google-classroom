const { Client } = require('discord.js');
const config = require('./config.json');
const check = require('./lib/check');

const bot = new Client();

const startBot = async classroom => {
  bot.on('ready', async () => {
    setInterval(() => check(bot, classroom), config.bot.checkInterval * 1000 * 60);
  });

  await bot.login(config.bot.token);
  console.log('Bot started.');
};

module.exports = startBot;
