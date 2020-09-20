import * as fs from 'fs';
import * as path from 'path';

const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');

interface IServerConfig {
  port: number;
}

interface IBotConfig {
  token: string;
  channel: string;
  checkInterval: number;
  pingEveryone?: boolean;
  timezone?: string;
}

interface IGoogleConfig {
  clientId: string;
  clientSecret: string;
  authURI: string;
  tokenURI: string;
  redirectURI: string;
  scopes: string[];
  enrollmentCodes?: string[];
  linkIDs?: string[];
}

export interface IConfig {
  server: IServerConfig;
  bot: IBotConfig;
  google: IGoogleConfig;
}

const rawConfig = fs.readFileSync(CONFIG_PATH, { encoding: 'utf8' });
const config: IConfig = JSON.parse(rawConfig);

export default config;
