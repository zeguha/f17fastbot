"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/main.ts
require("dotenv/config");
const bot_1 = require("./bot");
async function startBot() {
    console.log('🚀 Запуск бота...');
    try {
        // Пробуем инициализировать базу данных
        try {
            await bot_1.bot.initializeDatabase();
        }
        catch (error) {
            console.error('❌ Ошибка при инициализации базы данных:', error);
            console.log('⚠️ Продолжаю без базы данных...');
        }
        // Запускаем бота
        await bot_1.bot.launch();
        console.log('✅ Бот успешно запущен!');
    }
    catch (error) {
        console.error('❌ Ошибка при запуске бота:', error);
        process.exit(1);
    }
}
// Обработка завершения
process.once('SIGINT', () => {
    console.log('🛑 Получен SIGINT, останавливаю бота...');
    bot_1.bot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, останавливаю бота...');
    bot_1.bot.stop('SIGTERM');
    process.exit(0);
});
// Запуск бота
startBot();
