"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
// LogLevel is used for default values in the config
const logger_1 = require("./logger");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function loadConfig(configPath) {
    var _a, _b, _c;
    const defaultConfigPath = path.join(process.cwd(), 'config.json');
    const configFilePath = configPath || defaultConfigPath;
    try {
        if (fs.existsSync(configFilePath)) {
            const configContent = fs.readFileSync(configFilePath, 'utf8');
            const config = JSON.parse(configContent);
            return {
                apiKey: config.apiKey,
                webhookSecretKey: config.webhookSecretKey,
                baseURL: config.baseURL || 'https://gate.lava.top',
                timeout: config.timeout || 10000,
                webhookPort: config.webhookPort || 3000,
                logging: {
                    level: ((_a = config.logging) === null || _a === void 0 ? void 0 : _a.level) || logger_1.LogLevel.WARN,
                    format: ((_b = config.logging) === null || _b === void 0 ? void 0 : _b.format) || 'text',
                    prefix: ((_c = config.logging) === null || _c === void 0 ? void 0 : _c.prefix) || '[LavaClient]',
                },
            };
        }
    }
    catch (error) {
        console.warn(`Failed to load config from ${configFilePath}:`, error);
    }
    // Если конфиг не найден или произошла ошибка, используем переменные окружения
    return {
        apiKey: process.env.LAVA_API_KEY || '',
        webhookSecretKey: process.env.LAVA_WEBHOOK_SECRET_KEY || '',
        baseURL: process.env.LAVA_API_URL || 'https://gate.lava.top',
        timeout: process.env.LAVA_API_TIMEOUT ? parseInt(process.env.LAVA_API_TIMEOUT, 10) : 10000,
        webhookPort: process.env.LAVA_WEBHOOK_PORT ? parseInt(process.env.LAVA_WEBHOOK_PORT, 10) : 3000,
        logging: {
            level: process.env.LAVA_LOG_LEVEL || logger_1.LogLevel.WARN,
            format: process.env.LAVA_LOG_FORMAT || 'text',
            prefix: process.env.LAVA_LOG_PREFIX || '[LavaClient]',
        },
    };
}
