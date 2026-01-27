// scripts/check-prisma.ts
import { PrismaClient } from '@prisma/client';

async function checkPrisma() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Проверка подключения к базе данных...');
    
    // Проверяем, можем ли мы получить данные
    const plans = await prisma.plan.findMany();
    console.log(`Найдено планов: ${plans.length}`);
    
    const payments = await prisma.payment.findMany();
    console.log(`Найдено платежей: ${payments.length}`);
    
    const users = await prisma.user.findMany();
    console.log(`Найдено пользователей: ${users.length}`);
    
    console.log('✅ Prisma работает корректно!');
    
  } catch (error: any) {
    console.error('❌ Ошибка Prisma:', error.message);
    
    if (error.message.includes('no such table')) {
      console.log('\n🔧 Решение:');
      console.log('1. Удалите файл базы данных: rm -f prisma/dev.db');
      console.log('2. Примените миграции: npx prisma migrate dev --name init');
      console.log('3. Перегенерируйте клиент: npx prisma generate');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkPrisma();