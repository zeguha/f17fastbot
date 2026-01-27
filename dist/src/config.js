"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
// src/config.ts
exports.config = {
    // Telegram Bot
    botToken: process.env.BOT_TOKEN,
    // X-UI Panel
    inboundId: Number(process.env.INBOUND_ID || 1),
    xui: {
        url: process.env.XUI_URL,
        login: process.env.XUI_LOGIN,
        password: process.env.XUI_PASSWORD
    },
    // Subscription URL
    publicSubUrl: process.env.PUBLIC_SUB_URL,
    // Lava.Top API (Public API via gate.lava.top)
    lava: {
        apiKey: process.env.LAVA_API_KEY,
        // offerId берутся из кабинета Lava (UUID). По одному offerId на каждый тариф.
        offerIds: {
            '1m': process.env.LAVA_OFFER_1M,
            '3m': process.env.LAVA_OFFER_3M,
            '12m': process.env.LAVA_OFFER_12M,
        },
        currency: (process.env.LAVA_CURRENCY || 'RUB'),
        // опционально: секрет для проверки вебхуков (если будешь принимать вебхуки)
        webhookSecretKey: process.env.LAVA_WEBHOOK_SECRET_KEY || '',
        // опционально: baseURL для SDK (по умолчанию gate.lava.top)
        baseURL: process.env.LAVA_PUBLIC_BASE_URL || 'https://gate.lava.top',
    },
};
// Проверка обязательных переменных
const required = [
    'BOT_TOKEN',
    'XUI_URL',
    'XUI_LOGIN',
    'XUI_PASSWORD',
    'PUBLIC_SUB_URL',
    'LAVA_API_KEY',
    'LAVA_OFFER_1M',
    'LAVA_OFFER_3M',
    'LAVA_OFFER_12M'
];
for (const env of required) {
    if (!process.env[env]) {
        throw new Error(`Отсутствует обязательная переменная: ${env}`);
    }
}
// Дополнительная валидация формата
if (!Number.isFinite(exports.config.inboundId) || exports.config.inboundId <= 0) {
    throw new Error('INBOUND_ID должен быть положительным числом');
}
try {
    // eslint-disable-next-line no-new
    new URL(exports.config.publicSubUrl);
}
catch {
    throw new Error('PUBLIC_SUB_URL должен быть валидным URL, например: https://example.com');
}
if (!['RUB', 'USD', 'EUR'].includes(exports.config.lava.currency)) {
    throw new Error('LAVA_CURRENCY должен быть RUB, USD или EUR');
}
// offerId должны быть UUID
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
for (const [planCode, offerId] of Object.entries(exports.config.lava.offerIds)) {
    if (!uuidRe.test(offerId)) {
        throw new Error(`LAVA_OFFER для тарифа ${planCode} должен быть UUID (offerId из Lava)`);
    }
}
try {
    // eslint-disable-next-line no-new
    new URL(exports.config.lava.baseURL);
}
catch {
    throw new Error('LAVA_PUBLIC_BASE_URL должен быть валидным URL, например: https://gate.lava.top');
}
