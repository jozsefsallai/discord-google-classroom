import config from '../config';

import differenceBy from 'lodash.differenceby';

import * as fs from 'fs';
import * as path from 'path';

import truncate from './truncate';
import buildDate from './buildDate';
import formatDate from './formatDate';

import {
  Client,
  EmbedField,
  MessageAttachment,
  MessageEmbed,
  TextChannel
} from 'discord.js';

import { IClassroom } from './IClassroom';
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

interface IDatabase {
  announcements: ClassroomAPI.Schema$Announcement[];
  courseWork: ClassroomAPI.Schema$CourseWork[];
}

interface IGenericEntry extends ClassroomAPI.Schema$Announcement, ClassroomAPI.Schema$CourseWork {}

const buildEmbed = <Entry extends IGenericEntry>(classroom: IClassroom, entry: Entry, isCourseWork: boolean = false): IEmbedData => {
  const course = classroom.getCourseById(`${entry.courseId}`);

  const title = course
    ? `New ${isCourseWork ? 'classwork' : 'post'} in "${course.name}"`
    : `New ${isCourseWork ? 'classwork' : 'post'} in classroom`;

  const description = isCourseWork
    ? entry.description ? truncate(entry.description, 2048) : '[classwork has no instructions]'
    : entry.text ? truncate(entry.text, 2048) : '[post has no text]';

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
    value: formatDate(new Date(`${entry.creationTime}`)),
    inline: false
    // why is inline a required parameter, it's almost never mentioned in the
    // examples
  });

  if (entry.dueDate && entry.dueTime) {
    const { year, month, day } = entry.dueDate;
    const { hours, minutes } = entry.dueTime;
    const dueDate = buildDate({ year, month, day, hours, minutes });

    fields.push({
      name: 'Assignment due date:',
      value: formatDate(dueDate),
      inline: true
    });
  }

  if (entry.workType) {
    fields.push({
      name: 'Classwork type:',
      value: entry.workType,
      inline: true
    });
  }

  if (entry.maxPoints) {
    fields.push({
      name: 'Max points:',
      value: `${entry.maxPoints}`,
      inline: true
    });
  }

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

const updateDB = (announcements: ClassroomAPI.Schema$Announcement[], courseWork: ClassroomAPI.Schema$CourseWork[]) => {
  fs.writeFileSync(DB_PATH, JSON.stringify({ announcements, courseWork }), { encoding: 'utf8' });
};

const sendAttachments = async (classroom: IClassroom, channel: TextChannel, { files, youtube, links, forms }: IEmbedData) => {
  if (files.length && config.google.scopes.includes('https://www.googleapis.com/auth/drive.readonly')) {
    for (const file of files) {
      const fileData = await classroom.getFile(file.id);

      if (fileData) {
        await channel.send(new MessageAttachment(fileData.buffer, fileData.title));
      }
    }
  }

  if (youtube.length) {
    for (const video of youtube) {
      await channel.send(video.url);
    }
  }

  if (links.length) {
    for (const link of links) {
      await channel.send(link.url);
    }
  }

  if (forms.length) {
    for (const form of forms) {
      await channel.send(form.url);
    }
  }
};

const sendUpdate = async (
  bot: Client,
  classroom: IClassroom,
  announcements: ClassroomAPI.Schema$Announcement[],
  courseWorks: ClassroomAPI.Schema$CourseWork[]
) => {
  if (!announcements.length && !courseWorks.length) {
    return;
  }

  const channel = bot.channels.cache.get(config.bot.channel) as TextChannel;

  for (const entry of announcements) {
    const { embed, files, youtube, links, forms } = buildEmbed<ClassroomAPI.Schema$Announcement>(classroom, entry);

    if (channel) {
      await channel.send({
        content: `${config.bot.pingEveryone ? '@everyone ' : ''} **New update in your classes on Google Classroom!**`,
        embed
      });

      await sendAttachments(classroom, channel, { embed, files, youtube, links, forms });
    }
  }

  for (const entry of courseWorks) {
    const { embed, files, youtube, links, forms } = buildEmbed<ClassroomAPI.Schema$CourseWork>(classroom, entry, true);

    if (channel) {
      await channel.send({
        content: `${config.bot.pingEveryone ? '@everyone ' : ''} **New classwork on Google Classroom!**`,
        embed
      });

      await sendAttachments(classroom, channel, { embed, files, youtube, links, forms });
    }
  }
};

const check = async (bot: Client, classroom: IClassroom) => {
  const announcements = await classroom.listAnnouncements();
  let courseWork: ClassroomAPI.Schema$CourseWork[] = [];

  if (config.google.scopes.includes('https://www.googleapis.com/auth/classroom.coursework.me.readonly')) {
    courseWork = await classroom.listCourseWork();
  }

  if (!fs.existsSync(DB_PATH)) {
    sendUpdate(bot, classroom, announcements, courseWork);
    updateDB(announcements, courseWork);
    return;
  }

  const raw = fs.readFileSync(DB_PATH, { encoding: 'utf8' });
  const json: IDatabase = JSON.parse(raw);

  const newAnnouncements = differenceBy(announcements, json.announcements, 'id');
  const newCourseWork = differenceBy(courseWork, json.courseWork, 'id');

  if (newAnnouncements.length || newCourseWork.length) {
    sendUpdate(bot, classroom, newAnnouncements, newCourseWork);
    updateDB(announcements, courseWork);
  }
};

export default check;
