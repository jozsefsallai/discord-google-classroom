import config from '../config';

import * as fs from 'fs';
import * as path from 'path';

import { google, classroom_v1 as ClassroomAPI } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { IClassroom, IDriveFileData } from './IClassroom';

import inquirer from 'inquirer';

const TOKEN_PATH = path.join(__dirname, '../..', 'token.json');

const timestamp = (str: string): number => new Date(str).getTime();

class Classroom implements IClassroom {
  private client: OAuth2Client;
  private courses: ClassroomAPI.Schema$Course[];

  constructor() {
    const { google: { clientId, clientSecret, redirectURI } } = config;
    this.client = new google.auth.OAuth2(clientId, clientSecret, redirectURI);
    this.courses = [];
  }

  async createAuthToken(): Promise<Credentials> {
    const authUrl = this.client.generateAuthUrl({
      access_type: 'offline',
      scope: config.google.scopes
    });

    console.log(`Open this URL to authorize the application: ${authUrl}`);

    const { code } = await inquirer.prompt([
      {
        name: 'code',
        type: 'string',
        message: 'Enter your code:'
      }
    ]);

    const { tokens } = await this.client.getToken(code);

    if (fs.existsSync(TOKEN_PATH)) {
      if (!tokens.refresh_token) {
        const raw = fs.readFileSync(TOKEN_PATH, { encoding: 'utf8' });
        const json: Credentials = JSON.parse(raw);
        tokens.refresh_token = json.refresh_token;
      }
    }

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens), { encoding: 'utf8' });

    return tokens;
  }

  async getAuthToken(): Promise<Credentials> {
    if (!fs.existsSync(TOKEN_PATH)) {
      return this.createAuthToken();
    }

    const raw = fs.readFileSync(TOKEN_PATH, { encoding: 'utf8' });
    return JSON.parse(raw);
  }

  verifyAndUpdateToken(token: string | null | undefined) {
    const raw = fs.readFileSync(TOKEN_PATH, { encoding: 'utf8' });
    const json: Credentials = JSON.parse(raw);

    if (token !== json.access_token) {
      json.access_token = token;
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(json), { encoding: 'utf8' });
    }
  }

  async authorize() {
    const authToken = await this.getAuthToken();
    this.client.setCredentials(authToken);
    const { token } = await this.client.getAccessToken();
    this.verifyAndUpdateToken(token);
  }

  async setCourses() {
    const { linkIDs, enrollmentCodes } = config.google;

    const classroom = google.classroom({ version: 'v1', auth: this.client });

    const { data: { courses } } = await classroom.courses.list();

    if (courses?.length) {
      this.courses = courses.filter(course => {
        if (enrollmentCodes?.length && course.enrollmentCode && enrollmentCodes.includes(course.enrollmentCode)) {
          return true;
        }

        const linkID = course.alternateLink?.split('/').pop();

        if (linkIDs?.length && linkID && linkIDs.includes(linkID)) {
          return true;
        }

        return false;
      });
    }
  }

  async listAnnouncements(): Promise<ClassroomAPI.Schema$Announcement[]> {
    const classroom = google.classroom({ version: 'v1', auth: this.client });

    const allAnnouncements: ClassroomAPI.Schema$Announcement[] = [];

    for await (const c of this.courses) {
      const { data: { announcements } } = await classroom.courses.announcements.list({
        courseId: (c.id as string)
      });

      if (announcements) {
        allAnnouncements.push(...announcements);
      }
    }

    return allAnnouncements.sort((a, b) => timestamp(`${a.updateTime}`) - timestamp(`${b.updateTime}`));
  }

  async listCourseWork(): Promise<ClassroomAPI.Schema$CourseWork[]> {
    const classroom = google.classroom({ version: 'v1', auth: this.client });

    const allCourseWork: ClassroomAPI.Schema$CourseWork[] = [];

    for await (const c of this.courses) {
      const { data: { courseWork } } = await classroom.courses.courseWork.list({
        courseId: (c.id as string)
      });

      if (courseWork) {
        allCourseWork.push(...courseWork);
      }
    }

    return allCourseWork.sort((a, b) => timestamp(`${a.updateTime}`) - timestamp(`${b.updateTime}`));
  }

  getCourseById(id: string): ClassroomAPI.Schema$Course | undefined {
    return this.courses.find(c => c.id === id);
  }

  async getFile(fileId: string): Promise<IDriveFileData | null> {
    const drive = google.drive({ version: 'v2', auth: this.client });

    const file = await drive.files.get({ fileId });
    const { title, fileSize } = file.data;

    if (fileSize && parseInt(fileSize, 10) > 8e6) {
      return null;
    }

    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });

    return {
      title: `${title}`,
      buffer: Buffer.from(res.data)
    };
  }
}

export default Classroom;
