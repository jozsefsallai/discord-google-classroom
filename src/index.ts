import * as fs from 'fs';
import * as path from 'path';

import express from 'express';

import config from './config';
import Classroom from './lib/Classroom';
import startBot from './bot';

import { Server } from 'http';

const PORT = config.server.port;

const app = express();
app.get('/authorize', (req, res) => res.json({ ok: true, code: req.query.code }));

let server: Server | null = null;

const startServer = () => {
  return new Promise(resolve => {
    server = app.listen(PORT, async () => {
      console.log(`Tokens not found, started Express server on port ${PORT}.`);
      return resolve();
    });
  });
};

const run = async () => {
  const foundToken = fs.existsSync(path.join(__dirname, '..', 'token.json'));

  if (!foundToken) {
    await startServer();
  }

  const classroom = new Classroom();

  await classroom.authorize();
  await classroom.setCourses();
  await startBot(classroom);

  if (!foundToken && server) {
    server.close();
    console.log('Server stopped.');
  }
};

run();
