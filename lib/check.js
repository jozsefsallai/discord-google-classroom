const config = require('../config.json');

const differenceBy = require('lodash.differenceby');
const { format } = require('date-fns');
const fs = require('fs');
const path = require('path');
const truncate = require('./truncate');

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
        materials.push(driveFile.title);
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
      value: materials.join(', ')
    });
  }

  return {
    title,
    description,
    url,
    fields
  };
};

const updateDB = data => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data), { encoding: 'utf8' });
};

const sendUpdate = (bot, classroom, data) => {
  data.forEach(entry => {
    const embed = buildEmbed(classroom, entry);
    const channel = bot.channels.cache.get(config.bot.channel);

    if (channel) {
      channel.send({
        content: '**New updates in your classes on Google Classroom!**',
        embed
      });
    }
  });
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
