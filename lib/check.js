const config = require('../config.json');

const differenceBy = require('lodash.differenceby');
const { format } = require('date-fns');
const fs = require('fs');
const path = require('path');
const truncate = require('./truncate');
const { MessageAttachment } = require('discord.js');

const DB_PATH = path.join(__dirname, '..', 'db.json');

const buildEmbed = (classroom, entry) => {
  const course = classroom.getCourseById(entry.courseId);

  const title = course
    ? `New post in "${course.name}"`
    : 'New post in classroom';

  const description = entry.text
    ? truncate(entry.text, 2048)
    : '[post has no text]';

  const url = entry.alternateLink;

  const materials = [];
  if (entry.materials) {
    entry.materials.forEach(material => {
      if (material.driveFile) {
        const { driveFile: { driveFile } } = material;
        materials.push({
          id: driveFile.id,
          displayText: `[${driveFile.title}](${driveFile.alternateLink})`
        });
      }
    });
  }

  const fields = [];

  fields.push({
    name: 'Created at:',
    value: format(new Date(entry.creationTime), 'MMMM dd, yyyy h:mm a')
  });

  if (materials.length) {
    fields.push({
      name: 'Attached Google Drive documents:',
      value: materials.map(m => m.displayText).join(', ')
    });
  }

  return {
    embed: {
      title,
      description,
      url,
      fields
    },
    materials
  };
};

const updateDB = data => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data), { encoding: 'utf8' });
};

const sendUpdate = async (bot, classroom, data) => {
  if (!data.length) {
    return;
  }

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];

    const { embed, materials } = buildEmbed(classroom, entry);
    const channel = bot.channels.cache.get(config.bot.channel);

    if (channel) {
      await channel.send({
        content: `${config.bot.pingEveryone ? '@everyone ' : ''} **New update in your classes on Google Classroom!**`,
        embed
      });

      if (materials.length && config.google.scopes.includes('https://www.googleapis.com/auth/drive.readonly')) {
        for (let j = 0; j < materials.length; j++) {
          const material = materials[j];
          const file = await classroom.getFile(material.id);
          await channel.send(new MessageAttachment(file.buffer, file.title));
        }
      }
    }
  }
};

const check = async (bot, classroom) => {
  const announcements = await classroom.list();

  if (!fs.existsSync(DB_PATH)) {
    sendUpdate(bot, classroom, announcements);
    updateDB(announcements);
    return;
  }

  const raw = fs.readFileSync(DB_PATH);
  const json = JSON.parse(raw);

  const newItems = differenceBy(announcements, json, 'id');

  if (newItems.length) {
    sendUpdate(bot, classroom, newItems);
    updateDB(announcements);
  }
};

module.exports = check;
