"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/setup.ts
require("dotenv/config");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
console.log('🔧 Настройка проекта VPN бота...');
// 2. Создаем папку prisma если ее нет
if (!(0, fs_1.existsSync)('prisma')) {
    (0, fs_1.mkdirSync)('prisma', { recursive: true });
}
// 3. Проверяем schema.prisma
if (!(0, fs_1.existsSync)('prisma/schema.prisma')) {
    console.log('📋 Создаю schema.prisma...');
    const schema = `
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id          Int      @id @default(autoincrement())
  telegramId  BigInt   @unique
  username    String?
  subscriptions Subscription[]
  createdAt   DateTime @default(now())

  @@index([telegramId])
}

model Plan {
  id       Int    @id @default(autoincrement())
  name     String @unique
  price    Int
  duration Int // days

  subscriptions Subscription[]
}

model Subscription {
  id          Int      @id @default(autoincrement())
  userId      Int
  planId      Int
  status      String   @default("active")
  startAt     DateTime @default(now())
  endAt       DateTime
  xuiClientId String?

  user User @relation(fields: [userId], references: [id])
  plan Plan @relation(fields: [planId], references: [id])

  @@index([userId, status])
}
`;
    (0, fs_1.writeFileSync)('prisma/schema.prisma', schema);
}
// 4. Генерируем Prisma Client
console.log('🔧 Генерирую Prisma Client...');
try {
    (0, child_process_1.execSync)('npx prisma generate', { stdio: 'inherit' });
}
catch (error) {
    console.error('❌ Ошибка при генерации Prisma Client:', error);
    process.exit(1);
}
// 5. Применяем миграции
console.log('📊 Применяю миграции...');
try {
    (0, child_process_1.execSync)('npx prisma migrate dev --name init', { stdio: 'inherit' });
}
catch (error) {
    console.error('❌ Ошибка при применении миграций:', error);
    // Пробуем альтернативный способ
    console.log('🔄 Пробую альтернативный способ...');
    try {
        (0, child_process_1.execSync)('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    }
    catch (pushError) {
        console.error('❌ Ошибка при push базы данных:', pushError);
        process.exit(1);
    }
}
// 6. Заполняем начальными данными
console.log('🌱 Заполняю начальными данными...');
const seedScript = `
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Начинаю заполнение базы данных...');
  
  // Создаем планы
  const plans = [
    { name: '1m', price: 199, duration: 30 },
    { name: '3m', price: 549, duration: 90 },
    { name: '12m', price: 2199, duration: 365 },
  ];

  for (const plan of plans) {
    const existing = await prisma.plan.findUnique({
      where: { name: plan.name }
    });
    
    if (!existing) {
      await prisma.plan.create({
        data: plan
      });
      console.log(\`Создан план: \${plan.name}\`);
    } else {
      console.log(\`План \${plan.name} уже существует\`);
    }
  }
  
  console.log('✅ База данных успешно заполнена!');
}

main()
  .catch((error) => {
    console.error('Ошибка:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.\$disconnect();
  });
`;
(0, fs_1.writeFileSync)('scripts/seed.ts', seedScript);
try {
    (0, child_process_1.execSync)('npx ts-node scripts/seed.ts', { stdio: 'inherit' });
}
catch (error) {
    console.error('❌ Ошибка при заполнении базы данных:', error);
}
console.log('🎉 Настройка завершена!');
console.log('📝 Не забудьте отредактировать файл .env');
console.log('🚀 Запустите бота: pnpm run dev');
