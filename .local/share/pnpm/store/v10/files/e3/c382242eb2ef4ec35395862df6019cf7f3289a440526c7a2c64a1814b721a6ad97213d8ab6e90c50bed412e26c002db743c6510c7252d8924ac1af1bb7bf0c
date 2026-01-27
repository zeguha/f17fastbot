import { LavaClientConfig } from './index';
import { LoggerConfig } from './logger';
export interface ConfigFile {
    apiKey: string;
    webhookSecretKey: string;
    baseURL?: string;
    timeout?: number;
    webhookPort?: number;
    logging?: LoggerConfig;
}
export declare function loadConfig(configPath?: string): LavaClientConfig;
