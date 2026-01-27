"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
// src/bot.ts
const telegraf_1 = require("telegraf");
const crypto_1 = require("crypto");
require("dotenv/config");
const config_1 = require("./config");
const xui_1 = require("./xui");
const prisma_1 = __importDefault(require("./prisma"));
// Убираем UserSubscription так как используем базу данных
const PLANS = [
    { code: '1m', title: '1 месяц', days: 30, priceText: '199 ₽ (заглушка)' },
    { code: '3m', title: '3 месяца', days: 90, priceText: '499 ₽ (заглушка)' },
    { code: '12m', title: '12 месяцев', days: 365, priceText: '1499 ₽ (заглушка)' }
];
class VPNBot {
    constructor() {
        this.bot = new telegraf_1.Telegraf(config_1.config.botToken);
        this.pendingPayments = new Map();
        this.setupHandlers();
        this.setupCleanupInterval();
    }
    setupCleanupInterval() {
        // Очищаем просроченные платежи каждые 5 минут
        setInterval(() => {
            const now = Date.now();
            for (const [paymentId, payment] of this.pendingPayments.entries()) {
                if (now - payment.createdAt > 30 * 60 * 1000) { // 30 минут
                    this.pendingPayments.delete(paymentId);
                }
            }
        }, 5 * 60 * 1000);
    }
    extractPriceFromText(priceText) {
        // Извлекаем число из текста "199 ₽ (заглушка)"
        const match = priceText.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }
    async initializeDatabase() {
        try {
            console.log('📊 Инициализация базы данных...');
            // Создаем планы в базе данных, если их нет
            for (const plan of PLANS) {
                const existingPlan = await prisma_1.default.plan.findFirst({
                    where: { name: plan.code }
                });
                if (!existingPlan) {
                    await prisma_1.default.plan.create({
                        data: {
                            name: plan.code,
                            price: this.extractPriceFromText(plan.priceText),
                            duration: plan.days
                        }
                    });
                    console.log(`✅ Создан план: ${plan.code}`);
                }
                else {
                    console.log(`ℹ️ План ${plan.code} уже существует`);
                }
            }
            console.log('✅ База данных инициализирована');
        }
        catch (error) {
            console.error('❌ Ошибка при инициализации базы данных:', error);
            // Если ошибка связана с подключением к базе
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('Unable to open the database file') ||
                errorMessage.includes('no such table')) {
                console.log('📋 Возможно, база данных не создана. Запустите миграции:');
                console.log('   npx prisma migrate dev --name init');
            }
        }
    }
    async getPlan(code) {
        return await prisma_1.default.plan.findFirst({
            where: { name: code }
        });
    }
    async getAllPlans() {
        return await prisma_1.default.plan.findMany();
    }
    findPlanData(code) {
        return PLANS.find(p => p.code === code);
    }
    buildSubLink(subId) {
        return `${config_1.config.publicSubUrl}/sub/${subId}`;
    }
    formatDate(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    async safeEditOrReply(ctx, text, extra) {
        try {
            if (ctx.updateType === 'callback_query') {
                return await ctx.editMessageText(text, extra);
            }
            return await ctx.reply(text, extra);
        }
        catch (error) {
            console.error('Error editing message:', error);
            return await ctx.reply(text, extra);
        }
    }
    async getOrCreateUser(tgId, username) {
        const telegramId = BigInt(tgId);
        let user = await prisma_1.default.user.findUnique({
            where: { telegramId }
        });
        if (!user) {
            user = await prisma_1.default.user.create({
                data: {
                    telegramId,
                    username: username || null
                }
            });
        }
        return user;
    }
    async hasActiveSubscription(tgId) {
        try {
            const user = await prisma_1.default.user.findUnique({
                where: { telegramId: BigInt(tgId) },
                include: {
                    subscriptions: {
                        where: {
                            status: 'active',
                            endAt: { gt: new Date() }
                        }
                    }
                }
            });
            return !!user?.subscriptions && user.subscriptions.length > 0;
        }
        catch (error) {
            console.error('Error checking active subscription:', error);
            return false;
        }
    }
    async getActiveSubscription(tgId) {
        try {
            const user = await prisma_1.default.user.findUnique({
                where: { telegramId: BigInt(tgId) },
                include: {
                    subscriptions: {
                        where: {
                            status: 'active',
                            endAt: { gt: new Date() }
                        },
                        include: {
                            plan: true
                        },
                        orderBy: {
                            endAt: 'desc'
                        },
                        take: 1
                    }
                }
            });
            return user?.subscriptions[0] || null;
        }
        catch (error) {
            console.error('Error getting active subscription:', error);
            return null;
        }
    }
    async mainMenuKeyboard(tgId) {
        const buttons = [];
        if (tgId) {
            const hasActive = await this.hasActiveSubscription(tgId);
            if (hasActive) {
                // Если есть активная подписка, показываем только "Моя подписка" и "Отменить подписку"
                buttons.push([telegraf_1.Markup.button.callback('Моя подписка', 'menu:mysub')]);
                buttons.push([telegraf_1.Markup.button.callback('❌ Отменить подписку', 'menu:cancelsub')]);
            }
            else {
                // Если нет активной подписки, показываем "Подписка"
                buttons.push([telegraf_1.Markup.button.callback('Подписка', 'menu:subscribe')]);
            }
        }
        else {
            buttons.push([telegraf_1.Markup.button.callback('Подписка', 'menu:subscribe')]);
        }
        return telegraf_1.Markup.inlineKeyboard(buttons);
    }
    async plansKeyboard() {
        try {
            const plans = await this.getAllPlans();
            const rows = plans.map(plan => {
                const planInfo = this.findPlanData(plan.name);
                const displayText = planInfo
                    ? `${planInfo.title} - ${planInfo.priceText}`
                    : `${plan.name} - ${plan.price} ₽`;
                return [telegraf_1.Markup.button.callback(displayText, `plan:${plan.name}`)];
            });
            rows.push([telegraf_1.Markup.button.callback('Назад', 'menu:back')]);
            return telegraf_1.Markup.inlineKeyboard(rows);
        }
        catch (error) {
            console.error('Error getting plans:', error);
            // Fallback to hardcoded plans if DB is not available
            const rows = PLANS.map(p => [
                telegraf_1.Markup.button.callback(`${p.title} - ${p.priceText}`, `plan:${p.code}`)
            ]);
            rows.push([telegraf_1.Markup.button.callback('Назад', 'menu:back')]);
            return telegraf_1.Markup.inlineKeyboard(rows);
        }
    }
    subscriptionInfoKeyboard() {
        return telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('❌ Отменить подписку', 'menu:cancelsub')],
            [telegraf_1.Markup.button.callback('Назад', 'menu:back')]
        ]);
    }
    async cancelSubscription(tgId, ctx) {
        const subscription = await this.getActiveSubscription(tgId);
        if (!subscription) {
            await ctx.reply('У тебя нет активной подписки.');
            return false;
        }
        try {
            // Удаляем клиента из X-UI
            if (subscription.xuiClientId) {
                const deleteResult = await xui_1.xuiClient.deleteClient(config_1.config.inboundId, subscription.xuiClientId, `user${tgId}@f17vpn.com`);
                if (!deleteResult.success) {
                    console.log('First delete method failed, trying alternative...');
                    const altResult = await xui_1.xuiClient.deleteClientAlternative(config_1.config.inboundId, subscription.xuiClientId);
                    if (!altResult.success) {
                        console.error('Failed to delete from X-UI:', altResult.msg);
                        // Продолжаем в любом случае, чтобы обновить статус в БД
                    }
                }
            }
            // Обновляем статус подписки в базе данных
            await prisma_1.default.subscription.update({
                where: { id: subscription.id },
                data: { status: 'cancelled' }
            });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error cancelling subscription:', errorMessage);
            await ctx.reply(`Произошла ошибка при отмене подписки: ${errorMessage}`);
            return false;
        }
    }
    setupHandlers() {
        // Start command
        this.bot.start(async (ctx) => {
            const name = ctx.from?.first_name || 'друг';
            const tgId = ctx.from?.id;
            if (tgId) {
                try {
                    await this.getOrCreateUser(tgId, ctx.from?.username);
                }
                catch (error) {
                    console.error('Error creating user:', error);
                }
            }
            await ctx.reply(`Привет, ${name}!\nЯ оформляю VPN-подписку и выдаю ссылку для подключения.\nНажми "Подписка", выбери план и заверши оплату (сейчас заглушка).`, await this.mainMenuKeyboard(tgId));
        });
        // Subscribe command
        this.bot.command('subscribe', async (ctx) => {
            const tgId = ctx.from?.id;
            if (tgId) {
                try {
                    const hasActive = await this.hasActiveSubscription(tgId);
                    if (hasActive) {
                        await ctx.reply('У тебя уже есть активная подписка. Сначала отмени текущую подписку.', await this.mainMenuKeyboard(tgId));
                        return;
                    }
                }
                catch (error) {
                    console.error('Error checking subscription:', error);
                }
            }
            await ctx.reply('Выбери план подписки:', await this.plansKeyboard());
        });
        // Back to menu
        this.bot.action('menu:back', async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            await this.safeEditOrReply(ctx, 'Главное меню', await this.mainMenuKeyboard(tgId));
        });
        // Subscribe menu
        this.bot.action('menu:subscribe', async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            if (tgId) {
                try {
                    const hasActive = await this.hasActiveSubscription(tgId);
                    if (hasActive) {
                        await this.safeEditOrReply(ctx, 'У тебя уже есть активная подписка. Сначала отмени текущую подписку.', await this.mainMenuKeyboard(tgId));
                        return;
                    }
                }
                catch (error) {
                    console.error('Error checking subscription:', error);
                }
            }
            await this.safeEditOrReply(ctx, 'Выбери план подписки:', await this.plansKeyboard());
        });
        // Cancel subscription
        this.bot.action('menu:cancelsub', async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            if (!tgId) {
                await ctx.reply('Ошибка: не удалось определить пользователя');
                return;
            }
            const subscription = await this.getActiveSubscription(tgId);
            if (!subscription) {
                await this.safeEditOrReply(ctx, 'У тебя нет активной подписки.', await this.mainMenuKeyboard(tgId));
                return;
            }
            // Подтверждение отмены
            await this.safeEditOrReply(ctx, '⚠️ Вы уверены, что хотите отменить подписку?\n\n' +
                'После отмены:\n' +
                '• Доступ к VPN будет прекращен немедленно\n' +
                '• Ссылка перестанет работать\n' +
                '• Возврат средств не предусмотрен', telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('✅ Да, отменить подписку', `confirmcancelsub:${tgId}`)],
                [telegraf_1.Markup.button.callback('❌ Нет, оставить', 'menu:back')]
            ]));
        });
        // Confirm cancel subscription
        this.bot.action(/^confirmcancelsub:(\d+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = Number(ctx.match[1]);
            if (!tgId) {
                await ctx.reply('Ошибка: не удалось определить пользователя');
                return;
            }
            await ctx.editMessageText('Отменяю подписку...');
            const cancelled = await this.cancelSubscription(tgId, ctx);
            if (cancelled) {
                await ctx.reply('✅ Подписка успешно отменена!\n\n' +
                    'Доступ к VPN был прекращен.\n' +
                    'Если хотите снова подключиться, оформите новую подписку.', await this.mainMenuKeyboard(tgId));
            }
        });
        // My subscription
        this.bot.action('menu:mysub', async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            if (!tgId) {
                await ctx.reply('Ошибка: не удалось определить пользователя');
                return;
            }
            const subscription = await this.getActiveSubscription(tgId);
            if (!subscription) {
                await this.safeEditOrReply(ctx, 'У тебя пока нет активной подписки. Нажми "Подписка" и оформи доступ.', await this.mainMenuKeyboard(tgId));
                return;
            }
            // Проверяем не истекла ли подписка
            if (Date.now() > subscription.endAt.getTime()) {
                // Обновляем статус истекшей подписки
                try {
                    await prisma_1.default.subscription.update({
                        where: { id: subscription.id },
                        data: { status: 'expired' }
                    });
                }
                catch (error) {
                    console.error('Error updating subscription status:', error);
                }
                await this.safeEditOrReply(ctx, '⚠️ Твоя подписка истекла.\n' +
                    `Дата окончания: ${this.formatDate(subscription.endAt)}\n\n` +
                    'Нажми "Подписка" для оформления новой подписки.', await this.mainMenuKeyboard(tgId));
                return;
            }
            const daysLeft = Math.ceil((subscription.endAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const subLink = this.buildSubLink(subscription.xuiClientId || '');
            const planData = this.findPlanData(subscription.plan.name);
            const planTitle = planData?.title || subscription.plan.name;
            await this.safeEditOrReply(ctx, `📋 Информация о подписке:\n\n` +
                `План: ${planTitle}\n` +
                `Действует до: ${this.formatDate(subscription.endAt)}\n` +
                `Осталось дней: ${daysLeft}\n\n` +
                `🔗 Ссылка для подключения:\n${subLink}\n\n` +
                `Сохрани эту ссылку - она больше не будет доступна после отмены подписки.`, this.subscriptionInfoKeyboard());
        });
        // Plan selection
        this.bot.action(/^plan:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            if (!tgId) {
                await ctx.reply('Ошибка: не удалось определить пользователя');
                return;
            }
            // Проверяем, есть ли активная подписка
            try {
                const hasActive = await this.hasActiveSubscription(tgId);
                if (hasActive) {
                    await this.safeEditOrReply(ctx, '⚠️ У тебя уже есть активная подписка!\n\n' +
                        'Сначала отмени текущую подписку, затем сможешь оформить новую.', await this.mainMenuKeyboard(tgId));
                    return;
                }
            }
            catch (error) {
                console.error('Error checking active subscription:', error);
            }
            const planCode = ctx.match[1];
            let plan, planData;
            try {
                plan = await this.getPlan(planCode);
                planData = this.findPlanData(planCode);
            }
            catch (error) {
                console.error('Error getting plan:', error);
            }
            if (!plan || !planData) {
                await ctx.reply('Неизвестный план. Попробуй снова.', await this.mainMenuKeyboard(tgId));
                return;
            }
            const paymentId = (0, crypto_1.randomUUID)();
            this.pendingPayments.set(paymentId, {
                paymentId,
                tgId,
                planCode,
                createdAt: Date.now()
            });
            const fakePayUrl = `${config_1.config.fakePayUrlBase}/${paymentId}`;
            await this.safeEditOrReply(ctx, `📝 Оформление подписки:\n\n` +
                `План: ${planData.title}\n` +
                `Срок: ${plan.duration} дней\n` +
                `Стоимость: ${planData.priceText}\n\n` +
                `ℹ️ Оплата сейчас заглушка.\n` +
                `Ссылка на оплату (не настоящая): ${fakePayUrl}\n\n` +
                `После "оплаты" нажми кнопку "Я оплатил".`, telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.url('Перейти к оплате (заглушка)', fakePayUrl)],
                [telegraf_1.Markup.button.callback('✅ Я оплатил', `stubpay:${paymentId}`)],
                [telegraf_1.Markup.button.callback('❌ Отмена', 'menu:back')]
            ]));
        });
        // Payment processing
        this.bot.action(/^stubpay:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            if (!tgId) {
                await ctx.reply('Ошибка: не удалось определить пользователя');
                return;
            }
            const paymentId = ctx.match[1];
            const pending = this.pendingPayments.get(paymentId);
            if (!pending) {
                await ctx.reply('Платёж не найден или устарел. Начни заново: Подписка -> выбор плана.', await this.mainMenuKeyboard(tgId));
                return;
            }
            if (pending.tgId !== tgId) {
                await ctx.reply('Этот платёж не принадлежит тебе. Начни заново: Подписка -> выбор плана.', await this.mainMenuKeyboard(tgId));
                return;
            }
            let plan, planData;
            try {
                plan = await this.getPlan(pending.planCode);
                planData = this.findPlanData(pending.planCode);
            }
            catch (error) {
                console.error('Error getting plan:', error);
            }
            if (!plan || !planData) {
                this.pendingPayments.delete(paymentId);
                await ctx.reply('Неизвестный план. Начни заново.', await this.mainMenuKeyboard(tgId));
                return;
            }
            await this.safeEditOrReply(ctx, '🔄 Проверяю оплату (заглушка) и выдаю доступ…');
            try {
                const user = await this.getOrCreateUser(tgId, ctx.from?.username);
                const now = new Date();
                const endAt = new Date(now.getTime() + plan.duration * 24 * 60 * 60 * 1000);
                const clientId = (0, crypto_1.randomUUID)();
                const subId = (0, crypto_1.randomUUID)().replace(/-/g, '');
                const email = `user${tgId}-${subId}@f17vpn.com`;
                const clientData = {
                    id: clientId,
                    flow: '',
                    email: email,
                    limitIp: 0,
                    totalGB: 0,
                    expiryTime: endAt.getTime(),
                    enable: true,
                    tgId: String(tgId),
                    subId: subId,
                    comment: `tg:${tgId} plan:${plan.name}`,
                    reset: 0
                };
                const result = await xui_1.xuiClient.createClient(config_1.config.inboundId, clientData);
                if (!result.success) {
                    this.pendingPayments.delete(paymentId);
                    await ctx.reply(`❌ Не удалось создать клиента в X-UI: ${result.msg || 'Неизвестная ошибка'}`, await this.mainMenuKeyboard(tgId));
                    return;
                }
                // Создаем подписку в базе данных
                try {
                    await prisma_1.default.subscription.create({
                        data: {
                            userId: user.id,
                            planId: plan.id,
                            status: 'active',
                            startAt: now,
                            endAt: endAt,
                            xuiClientId: clientId
                        }
                    });
                }
                catch (dbError) {
                    console.error('Error creating subscription in DB:', dbError);
                    // Продолжаем, так как клиент в X-UI уже создан
                }
                const subLink = this.buildSubLink(subId);
                this.pendingPayments.delete(paymentId);
                await ctx.reply(`✅ Подписка успешно оформлена!\n\n` +
                    `📋 Детали подписки:\n` +
                    `План: ${planData.title}\n` +
                    `Срок действия: ${this.formatDate(endAt)}\n` +
                    `Осталось дней: ${plan.duration}\n\n` +
                    `🔗 Ссылка для подключения:\n${subLink}\n\n` +
                    `Сохрани эту ссылку!\n` +
                    `Для управления подпиской используй кнопку "Моя подписка".`, await this.mainMenuKeyboard(tgId));
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error creating subscription:', errorMessage);
                this.pendingPayments.delete(paymentId);
                await ctx.reply(`❌ Произошла ошибка при выдаче доступа: ${errorMessage}`, await this.mainMenuKeyboard(tgId));
            }
        });
        // Error handling
        this.bot.catch((err, ctx) => {
            console.error(`Error for ${ctx.updateType}:`, err);
            const tgId = ctx.from?.id;
            ctx.reply('Произошла ошибка. Попробуйте еще раз.');
        });
    }
    async launch() {
        console.log('Бот запускается...');
        await this.bot.launch();
        console.log('Бот успешно запущен!');
    }
    stop(reason) {
        console.log('Бот останавливается...', reason || '');
        this.bot.stop(reason);
    }
}
// Создаем и запускаем бота
exports.bot = new VPNBot();
