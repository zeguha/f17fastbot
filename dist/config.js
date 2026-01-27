"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
// config.ts
exports.config = {
    botToken: process.env.BOT_TOKEN,
    inboundId: Number(process.env.INBOUND_ID || 1),
    publicSubUrl: (process.env.PUBLIC_SUB_URL || '').replace(/\/$/, ''),
    fakePayUrlBase: (process.env.FAKE_PAY_URL_BASE || 'https://example.com/pay').replace(/\/$/, ''),
    xui: {
        url: process.env.XUI_URL.replace(/\/$/, ''),
        login: process.env.XUI_LOGIN,
        password: process.env.XUI_PASSWORD
    }
};
// Проверка обязательных переменных
const required = [
    'BOT_TOKEN',
    'PUBLIC_SUB_URL',
    'XUI_URL',
    'XUI_LOGIN',
    'XUI_PASSWORD'
];
for (const env of required) {
    if (!process.env[env]) {
        throw new Error(`Missing required environment variable: ${env}`);
    }
}
