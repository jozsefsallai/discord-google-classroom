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

interface IMaterial {
  displayText: string;
}

interface IGoogleDriveMaterial extends IMaterial {
  id: string;
}

interface IGenericMaterial extends IMaterial {
  url: string;
}

interface IEmbedData {
  embed: MessageEmbed;
  files: IGoogleDriveMaterial[];
  youtube: IGenericMaterial[];
  links: IGenericMaterial[];
  forms: IGenericMaterial[];
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

  const files: IGoogleDriveMaterial[] = [];
  const youtube: IGenericMaterial[] = [];
  const links: IGenericMaterial[] = [];
  const forms: IGenericMaterial[] = [];

  if (entry.materials) {
    entry.materials.forEach(material => {
      if (material.driveFile) {
        const { driveFile: { driveFile } } = material;
        driveFile && files.push({
          id: `${driveFile.id}`,
          displayText: `[${driveFile.title}](${driveFile.alternateLink})`
        });
      }

      if (material.youtubeVideo) {
        const { youtubeVideo } = material;
        youtubeVideo && youtube.push({
          url: `${youtubeVideo.alternateLink}`,
          displayText: `[${youtubeVideo.title}](${youtubeVideo.alternateLink})`
        });
      }

      if (material.link) {
        const { link } = material;
        link && links.push({
          url: `${link.url}`,
          displayText: `[${link.title}](${link.url})`
        });
      }

      if (material.form) {
        const { form } = material;
        form && forms.push({
          url: `${form.formUrl}`,
          displayText: `[${form.title}](${form.formUrl})`
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

  if (files.length) {
    fields.push({
      name: 'Attached Google Drive documents:',
      value: files.map(m => m.displayText).join(', '),
      inline: true
    });
  }

  if (youtube.length) {
    fields.push({
      name: 'Attached YouTube videos:',
      value: youtube.map(y => y.displayText).join(', '),
      inline: true
    });
  }

  if (links.length) {
    fields.push({
      name: 'Attached links:',
      value: links.map(l => l.displayText).join(', '),
      inline: true
    });
  }

  if (forms.length) {
    fields.push({
      name: 'Attached forms:',
      value: forms.map(f => f.displayText).join(', '),
      inline: true
    });
  }

  const embed = new MessageEmbed();
  embed.setTitle(title);
  embed.setDescription(description);
  embed.setURL(url);
  embed.addFields(fields);

  return {
    embed,
    files,
    youtube,
    links,
    forms
  };
};

const updateDB = (data: ClassroomAPI.Schema$Announcement[]) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data), { encoding: 'utf8' });
};

const sendUpdate = async (bot: Client, classroom: Classroom, data: ClassroomAPI.Schema$Announcement[]) => {
  if (!data.length) {
    return;
  }

  for (const entry of data) {
    const { embed, files, youtube, links, forms } = buildEmbed(classroom, entry);
    const channel = bot.channels.cache.get(config.bot.channel);

    if (channel) {
      await (channel as TextChannel).send({
        content: `${config.bot.pingEveryone ? '@everyone ' : ''} **New update in your classes on Google Classroom!**`,
        embed
      });
    }

    if (files.length && config.google.scopes.includes('https://www.googleapis.com/auth/drive.readonly')) {
      for (const file of files) {
        const fileData = await classroom.getFile(file.id);

        if (fileData) {
          await (channel as TextChannel).send(new MessageAttachment(fileData.buffer, fileData.title));
        }
      }
    }

    if (youtube.length) {
      for (const video of youtube) {
        await (channel as TextChannel).send(video.url);
      }
    }

    if (links.length) {
      for (const link of links) {
        await (channel as TextChannel).send(link.url);
      }
    }

    if (forms.length) {
      for (const form of forms) {
        await (channel as TextChannel).send(form.url);
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
