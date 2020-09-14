const startBot = require('./bot');
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();

const config = require('./config');
const Classroom = require('./lib/classroom');

const PORT = config.server.port;

app.get('/authorize', (req, res) => res.json({ ok: true, code: req.query.code }));

let server;

const startServer = () => {
  return new Promise(resolve => {
    server = app.listen(PORT, async () => {
      console.log(`Tokens not found, started Express server on port ${PORT}`);
      return resolve();
    });
  });
};

const run = async () => {
  const foundToken = fs.existsSync(path.join(__dirname, 'token.json'));

  if (!foundToken) {
    await startServer();
  }

  const classroom = new Classroom();

  await classroom.authorize();
  await classroom.setCoursesByEnrollmentCode();
  await startBot(classroom);

  if (!foundToken && server) {
    server.close();
    console.log('Server stopped.');
  }
};

run();
