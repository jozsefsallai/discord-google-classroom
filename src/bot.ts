import { Client } from 'discord.js';
import config from './config';
import check from './lib/check';
import { IClassroom } from './lib/IClassroom';

const bot = new Client();

const startBot = async (classroom: IClassroom) => {
  bot.on('ready', async () => {
    setInterval(async () => check(bot, classroom), config.bot.checkInterval * 1000 * 60);
  });

  bot.on('message', async message => {
    if (process.env.NODE_ENV !== 'production' && message.content === 'cr.debug') {
      await check(bot, classroom);
    }
  });

  await bot.login(config.bot.token);
  console.log('Bot started.');
};

export default startBot;
