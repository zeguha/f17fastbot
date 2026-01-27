// reset-db.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧹 Очистка базы данных...');

try {
  // Удаляем файл базы данных
  const dbPath = path.join(__dirname, 'prisma', 'dev.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('🗑️ Удален файл базы данных');
  }

  // Применяем миграции
  console.log('📦 Применяю миграции...');
  execSync('npx prisma migrate dev --name init', { stdio: 'inherit' });

  // Генерируем клиент
  console.log('🔧 Генерирую Prisma Client...');
  execSync('npx prisma generate', { stdio: 'inherit' });

  // Создаем начальные данные
  console.log('🌱 Создаю начальные данные...');
  execSync('npx ts-node scripts/seed.ts', { stdio: 'inherit' });

  console.log('✅ База данных пересоздана!');
} catch (error) {
  console.error('❌ Ошибка:', error.message);
}