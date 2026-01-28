"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/main.ts
require("dotenv/config");
const bot_1 = require("./bot");
async function startBot() {
    console.log('🚀 Запуск VPN бота...');
    try {
        await bot_1.bot.launch();
        console.log('✅ Бот успешно запущен!');
        console.log('\n📊 Информация:');
        console.log('• Проверка платежей: каждые 30 секунд');
        console.log('• База данных: SQLite');
        console.log('• Платежная система: Lava.Top');
        console.log('• Для подписки используйте /subscribe');
    }
    catch (error) {
        console.error('❌ Ошибка запуска бота:', error.message);
        console.log('\n🔧 Проверьте:');
        console.log('1. Файл .env с правильными настройками');
        console.log('2. Базу данных: npx prisma migrate dev');
        console.log('3. Токен бота в @BotFather');
        process.exit(1);
    }
}
// Обработка завершения
process.once('SIGINT', () => {
    console.log('\n🛑 Остановка бота...');
    bot_1.bot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    console.log('\n🛑 Остановка бота...');
    bot_1.bot.stop('SIGTERM');
    process.exit(0);
});
// Запуск бота
startBot();
