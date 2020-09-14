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

  createAuthToken() {
    const authUrl = this.client.generateAuthUrl({
      access_type: 'offline',
      scope: config.google.scopes
    });

    console.log(`Open this URL to authorize the application: ${authUrl}`);

    return new Promise((resolve, reject) => {
      return inquirer.prompt([
        {
          name: 'code',
          type: 'string',
          message: 'Enter your code:'
        }
      ])
        .then(({ code }) => this.client.getToken(code))
        .then(({ tokens }) => {
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens), { encoding: 'utf8' });
          return resolve(tokens);
        })
        .catch(reject);
    });
  }

  getAuthToken() {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(TOKEN_PATH)) {
        return this.createAuthToken()
          .then(resolve)
          .catch(reject);
      }

      const raw = fs.readFileSync(TOKEN_PATH, { encoding: 'utf-8' });
      return resolve(JSON.parse(raw));
    });
  }

  verifyAndUpdateToken({ token }) {
    const raw = fs.readFileSync(TOKEN_PATH, { encoding: 'utf8' });
    const json = JSON.parse(raw);

    if (token !== json.access_token) {
      json.access_token = token;
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(json), { encoding: 'utf8' });
    }
  }

  authorize() {
    return this.getAuthToken()
      .then(token => this.client.setCredentials(token))
      .then(() => this.client.getAccessToken())
      .then(this.verifyAndUpdateToken)
      .catch(err => {
        throw err;
      });
  }

  setCoursesByEnrollmentCode() {
    return new Promise((resolve, reject) => {
      const { enrollmentCodes } = config.google;
      const classroom = google.classroom({ version: 'v1', auth: this.client });
      return classroom.courses.list()
        .then(res => {
          const { courses } = res.data;
          this.courses = courses.filter(course => enrollmentCodes.includes(course.enrollmentCode));
          return resolve();
        })
        .catch(reject);
    });
  }

  getAnnoucementsPerCourse() {
    const classroom = google.classroom({ version: 'v1', auth: this.client });
    return Promise.all(this.courses.map(c => {
      return new Promise((resolve, reject) => {
        return classroom.courses.announcements.list({
          courseId: c.id
        })
          .then(res => {
            return resolve(res.data.announcements);
          })
          .catch(reject);
      });
    }));
  }

  list() {
    return new Promise((resolve, reject) => {
      return this.getAnnoucementsPerCourse()
        .then(result => flatten(result))
        .then(announcements => announcements.sort((a, b) => timestamp(a.updateTime) - timestamp(b.updateTime)))
        .then(resolve)
        .catch(reject);
    });
  }

  getCourseById(id) {
    return this.courses.find(c => c.id === id);
  }
};

module.exports = Classroom;
