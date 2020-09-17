const config = require('../config.json');

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const inquirer = require('inquirer');
const flatten = require('lodash.flatten');

const TOKEN_PATH = path.join(__dirname, '..', 'token.json');

const timestamp = str => (new Date(str).getTime());

class Classroom {
  constructor() {
    const { google: { clientId, clientSecret, redirectURI } } = config;
    this.client = new google.auth.OAuth2(clientId, clientSecret, redirectURI);
    this.courses = [];
  }

  async createAuthToken() {
    const authUrl = this.client.generateAuthUrl({
      access_type: 'offline',
      scope: config.google.scopes
    });

    console.log(`Open this URL to authorize the application: ${authUrl}`);

    try {
      const { code } = await inquirer.prompt([
        {
          name: 'code',
          type: 'string',
          message: 'Enter your code:'
        }
      ]);

      const { tokens } = await this.client.getToken(code);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens), { encoding: 'utf8' });
      return tokens;
    } catch (err) {
      throw err;
    }
  }

  async getAuthToken() {
    if (!fs.existsSync(TOKEN_PATH)) {
      try {
        return this.createAuthToken();
      } catch (err) {
        throw err;
      }
    }

    const raw = fs.readFileSync(TOKEN_PATH, { encoding: 'utf-8' });
    return JSON.parse(raw);
  }

  verifyAndUpdateToken({ token }) {
    const raw = fs.readFileSync(TOKEN_PATH, { encoding: 'utf8' });
    const json = JSON.parse(raw);

    if (token !== json.access_token) {
      json.access_token = token;
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(json), { encoding: 'utf8' });
    }
  }

  async authorize() {
    try {
      const token = await this.getAuthToken();
      this.client.setCredentials(token);
      const accessToken = await this.client.getAccessToken();
      this.verifyAndUpdateToken(accessToken);
    } catch (err) {
      throw err;
    }
  }

  async setCoursesByEnrollmentCode() {
    const { enrollmentCodes } = config.google;
    const classroom = google.classroom({ version: 'v1', auth: this.client });

    try {
      const { data: { courses } } = await classroom.courses.list();
      this.courses = courses.filter(course => enrollmentCodes.includes(course.enrollmentCode));
    } catch (err) {
      throw err;
    }
  }

  async getAnnoucementsPerCourse() {
    const classroom = google.classroom({ version: 'v1', auth: this.client });

    return Promise.all(this.courses.map(async c => {
      const { data: { announcements } } = await classroom.courses.announcements.list({
        courseId: c.id
      });

      return announcements;
    }))
  }

  async list() {
    try {
      const announcements = flatten(await this.getAnnoucementsPerCourse());
      return announcements.sort((a, b) => timestamp(a.updateTime) - timestamp(b.updateTime));
    } catch (err) {
      throw err;
    }
  }

  getCourseById(id) {
    return this.courses.find(c => c.id === id);
  }

  async getFile(fileId) {
    const drive = google.drive({ version: 'v2', auth: this.client });
    const data = {};

    try {
      const file = await drive.files.get({ fileId });
      const { title, fileSize } = file.data;

      data.title = title;

      if (fileSize && parseInt(fileSize, 10) > 8e6) {
        return null;
      }

      const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
      data.buffer = Buffer.from(res.data);

      return data;
    } catch (err) {
      throw err;
    }
  }
};

module.exports = Classroom;
