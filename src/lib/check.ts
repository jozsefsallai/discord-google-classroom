import config from '../config';

import differenceBy from 'lodash.differenceby';
import { format } from 'date-fns';

import * as fs from 'fs';
import * as path from 'path';

import truncate from './truncate';

import {
  Client,
  EmbedField,
  MessageAttachment,
  MessageEmbed,
  TextChannel
} from 'discord.js';

import Classroom from './Classroom';
import { classroom_v1 as ClassroomAPI } from 'googleapis';

const DB_PATH = path.join(__dirname, '../..', 'db.json');

export interface IGoogleDriveMaterial {
  id: string;
  displayText: string;
}

interface IEmbedData {
  embed: MessageEmbed;
  materials: IGoogleDriveMaterial[]
}

const buildEmbed = (classroom: Classroom, entry: ClassroomAPI.Schema$Announcement): IEmbedData => {
  const course = classroom.getCourseById(`${entry.courseId}`);

  const title = course
    ? `New post in "${course.name}"`
    : 'New post in classroom';

  const description = entry.text
    ? truncate(entry.text, 2048)
    : '[post has no text]';

  const url = `${entry.alternateLink}`;

  const materials: IGoogleDriveMaterial[] = [];
  if (entry.materials) {
    entry.materials.forEach(material => {
      if (material.driveFile) {
        const { driveFile: { driveFile } } = material;
        driveFile && materials.push({
          id: `${driveFile.id}`,
          displayText: `[${driveFile.title}](${driveFile.alternateLink})`
        });
      }
    });
  }

  const fields: EmbedField[] = [];

  fields.push({
    name: 'Created at:',
    value: format(new Date(`${entry.creationTime}`), 'MMMM dd, yyyy h:mm a'),
    inline: false
    // why is inline a required parameter, it's almost never mentioned in the
    // examples
  });

  if (materials.length) {
    fields.push({
      name: 'Attached Google Drive documents:',
      value: materials.map(m => m.displayText).join(', '),
      inline: false
    });
  }

  const embed = new MessageEmbed();
  embed.setTitle(title);
  embed.setDescription(description);
  embed.setURL(url);
  embed.addFields(fields);

  return {
    embed,
    materials
  };
};

const updateDB = (data: ClassroomAPI.Schema$Announcement[]) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data), { encoding: 'utf8' });
};

const sendUpdate = async (bot: Client, classroom: Classroom, data: ClassroomAPI.Schema$Announcement[]) => {
  if (!data.length) {
    return;
  }

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];

    const { embed, materials } = buildEmbed(classroom, entry);
    const channel = bot.channels.cache.get(config.bot.channel);

    if (channel) {
      await (channel as TextChannel).send({
        content: `${config.bot.pingEveryone ? '@everyone ' : ''} **New update in your classes on Google Classroom!**`,
        embed
      });
    }

    if (materials.length && config.google.scopes.includes('https://www.googleapis.com/auth/drive.readonly')) {
      for (let j = 0; j < materials.length; j++) {
        const material = materials[j];
        const file = await classroom.getFile(material.id);

        if (file) {
          await (channel as TextChannel).send(new MessageAttachment(file.buffer, file.title));
        }
      }
    }
  }
};

const check = async (bot: Client, classroom: Classroom) => {
  const announcements = await classroom.list();

  if (!fs.existsSync(DB_PATH)) {
    sendUpdate(bot, classroom, announcements);
    updateDB(announcements);
    return;
  }

  const raw = fs.readFileSync(DB_PATH, { encoding: 'utf8' });
  const json: ClassroomAPI.Schema$Announcement[] = JSON.parse(raw);

  const newItems = differenceBy(announcements, json, 'id');

  if (newItems.length) {
    sendUpdate(bot, classroom, newItems);
    updateDB(announcements);
  }
};

export default check;
