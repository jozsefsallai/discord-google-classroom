const { Client } = require('discord.js');
const config = require('./config.json');
const check = require('./lib/check');

const bot = new Client();

const startBot = async classroom => {
  bot.on('ready', async () => {
    setInterval(async () => check(bot, classroom), config.bot.checkInterval * 1000 * 60);
  });

  bot.on('message', async (message) => {
    if (process.env.NODE_ENV !== 'production' && message.content === 'cr.debug') {
      await check(bot, classroom);
    }
  });

  await bot.login(config.bot.token);
  console.log('Bot started.');
};

module.exports = startBot;
