"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("./db/prisma");
const telegraf_1 = require("telegraf");
const bot = new telegraf_1.Telegraf(process.env.BOT_TOKEN);
async function checkSubscriptions() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const subscriptions = await prisma_1.prisma.subscription.findMany({
        where: { status: 'active' },
        include: { user: true, plan: true },
    });
    for (const sub of subscriptions) {
        const endDate = new Date(sub.endAt);
        endDate.setHours(0, 0, 0, 0);
        if (endDate <= today) {
            try {
                await bot.telegram.sendMessage(sub.user.telegramId.toString(), `Ваша подписка "${sub.plan.name}" закончилась или заканчивается сегодня.`, telegraf_1.Markup.inlineKeyboard([
                    telegraf_1.Markup.button.callback('Продлить', `renew_${sub.id}`),
                    telegraf_1.Markup.button.callback('Отменить', `cancel_${sub.id}`),
                ]));
            }
            catch (err) {
                console.error('Ошибка при уведомлении:', err);
            }
        }
    }
}
// Обработка кнопок Продлить / Отменить
bot.on('callback_query', async (ctx) => {
    const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
    if (!data)
        return;
    const subId = parseInt(data.split('_')[1]);
    const sub = await prisma_1.prisma.subscription.findUnique({
        where: { id: subId },
        include: { plan: true, user: true },
    });
    if (!sub)
        return ctx.answerCbQuery('Подписка не найдена');
    if (data.startsWith('renew_')) {
        const newEnd = new Date(sub.endAt);
        newEnd.setDate(newEnd.getDate() + sub.plan.duration);
        await prisma_1.prisma.subscription.update({
            where: { id: sub.id },
            data: { endAt: newEnd, status: 'active' },
        });
        await ctx.editMessageText(`Подписка "${sub.plan.name}" продлена на ${sub.plan.duration} дней.\n` +
            `Срок действия до: ${newEnd.toLocaleDateString()}`);
    }
    if (data.startsWith('cancel_')) {
        await prisma_1.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'cancelled' },
        });
        await ctx.editMessageText(`Подписка "${sub.plan.name}" отменена.`);
    }
    await ctx.answerCbQuery();
});
async function startWatcher() {
    await checkSubscriptions(); // сразу
    setInterval(checkSubscriptions, 24 * 60 * 60 * 1000); // каждый день
}
startWatcher().catch(console.error);
