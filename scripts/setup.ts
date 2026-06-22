import 'dotenv/config';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

console.log('🔧 Настройка проекта VPN бота...');

if (!existsSync('prisma')) {
  mkdirSync('prisma', { recursive: true });
}

console.log('🔧 Генерирую Prisma Client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Ошибка при генерации Prisma Client:', error);
  process.exit(1);
}

console.log('📊 Применяю миграции...');
try {
  execSync('npx prisma migrate dev --name init', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Ошибка при применении миграций:', error);
  
  console.log('🔄 Пробую альтернативный способ...');
  try {
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
  } catch (pushError) {
    console.error('❌ Ошибка при push базы данных:', pushError);
    process.exit(1);
  }
}

console.log('🌱 Заполняю начальными данными...');
try {
  execSync('npx ts-node scripts/seed.ts', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Ошибка при заполнении базы данных:', error);
}

console.log('🎉 Настройка завершена!');
console.log('📝 Не забудьте отредактировать файл .env');
console.log('🚀 Запустите бота: pnpm run dev');
