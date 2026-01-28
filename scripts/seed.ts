
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
      console.log(`Создан план: ${plan.name}`);
    } else {
      console.log(`План ${plan.name} уже существует`);
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
    await prisma.$disconnect();
  });
