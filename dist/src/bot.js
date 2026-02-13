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
const lava_1 = require("./lava");
// Prisma singleton (важно для dev hot-reload и для единообразия по проекту)
const prisma_1 = __importDefault(require("./prisma"));
const PLANS = [
    { code: '1m', title: '1 месяц', days: 30, price: 199, priceText: '199 ₽' },
    { code: '3m', title: '3 месяца', days: 90, price: 549, priceText: '549 ₽' },
    { code: '12m', title: '12 месяцев', days: 365, price: 2199, priceText: '2199 ₽' }
];
class VPNBot {
    constructor() {
        // Простое состояние для режима "обращение в поддержку"
        this.supportMode = new Set();
        if (!config_1.config.botToken) {
            throw new Error('BOT_TOKEN не указан');
        }
        this.bot = new telegraf_1.Telegraf(config_1.config.botToken);
        this.setupHandlers();
        this.startPaymentChecker();
    }
    async initializeDatabase() {
        try {
            console.log('Инициализация базы данных...');
            // Создаем планы в базе данных, если их нет
            for (const plan of PLANS) {
                const existingPlan = await prisma_1.default.plan.findFirst({
                    where: { name: plan.code }
                });
                if (!existingPlan) {
                    await prisma_1.default.plan.create({
                        data: {
                            name: plan.code,
                            price: plan.price,
                            duration: plan.days
                        }
                    });
                    console.log(`Создан план: ${plan.code}`);
                }
            }
            console.log('База данных инициализирована');
        }
        catch (error) {
            console.error('Ошибка инициализации базы данных:', error);
        }
    }
    startPaymentChecker() {
        // Проверяем платежи каждые 30 секунд
        this.paymentCheckInterval = setInterval(async () => {
            await this.checkPendingPayments();
        }, 30000);
    }
    async checkPendingPayments() {
        try {
            const pendingPayments = await prisma_1.default.payment.findMany({
                where: {
                    status: 'pending',
                    createdAt: {
                        gt: new Date(Date.now() - 24 * 60 * 60 * 1000) // последние 24 часа
                    }
                },
                include: {
                    user: true,
                    plan: true
                }
            });
            for (const payment of pendingPayments) {
                try {
                    const status = await lava_1.lavaClient.getInvoiceStatus(payment.invoiceId);
                    if (status.status === 'success') {
                        await this.processSuccessfulPayment(payment);
                    }
                    else if (status.status === 'failed') {
                        await prisma_1.default.payment.update({
                            where: { id: payment.id },
                            data: { status: 'failed' }
                        });
                    }
                }
                catch (error) {
                    console.error(`Ошибка проверки платежа ${payment.invoiceId}:`, error);
                }
            }
        }
        catch (error) {
            console.error('Ошибка проверки платежей:', error);
        }
    }
    async processSuccessfulPayment(payment) {
        try {
            const user = payment.user;
            const plan = payment.plan;
            // Обновляем статус платежа
            await prisma_1.default.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'success',
                    payTime: new Date()
                }
            });
            // Создаем новую подписку
            const now = new Date();
            const endAt = new Date(now.getTime() + plan.duration * 24 * 60 * 60 * 1000);
            const clientId = (0, crypto_1.randomUUID)();
            const subId = (0, crypto_1.randomUUID)().replace(/-/g, '');
            const email = `user${user.telegramId}-${subId}@f17.com`;
            // Создаем клиента в X-UI
            const clientData = {
                id: clientId,
                flow: 'xtls-rprx-vision',
                email: email,
                limitIp: 0,
                totalGB: 0,
                expiryTime: endAt.getTime(),
                enable: true,
                tgId: String(user.telegramId),
                subId: subId,
                comment: `tg:${user.telegramId} plan:${plan.name}`,
                reset: 0
            };
            const result = await xui_1.xuiClient.createClient(config_1.config.inboundId, clientData);
            if (!result.success) {
                throw new Error(`Ошибка X-UI: ${result.msg}`);
            }
            // Сохраняем подписку в базе
            await prisma_1.default.subscription.create({
                data: {
                    userId: user.id,
                    planId: plan.id,
                    status: 'active',
                    startAt: now,
                    endAt: endAt,
                    xuiClientId: clientId,
                    subId,
                    xuiEmail: email,
                }
            });
            // Отправляем сообщение пользователю
            const subLink = `${config_1.config.publicSubUrl}/sub/${subId}`;
            await this.bot.telegram.sendMessage(Number(user.telegramId), `✅ Оплата успешно получена!\n\n` +
                `📋 Подписка активирована:\n` +
                `План: ${this.getPlanTitle(plan.name)}\n` +
                `Срок действия: ${this.formatDate(endAt)}\n` +
                `Дней: ${plan.duration}\n\n` +
                `🔗 Ссылка для подключения:\n<code>${subLink}</code>\n\n` +
                `Для управления подпиской используйте команду /mysub`, { parse_mode: 'HTML' });
        }
        catch (error) {
            console.error(`Ошибка обработки платежа ${payment.id}:`, error);
            await prisma_1.default.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'error',
                    description: error.message?.substring(0, 255) || 'Неизвестная ошибка'
                }
            });
        }
    }
    getPlanTitle(planCode) {
        const plan = PLANS.find(p => p.code === planCode);
        return plan ? plan.title : planCode;
    }
    formatDate(date) {
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
    }
    async safeEditOrReply(ctx, text, extra) {
        try {
            if (ctx.updateType === 'callback_query') {
                await ctx.editMessageText(text, extra);
            }
            else {
                await ctx.reply(text, extra);
            }
        }
        catch (error) {
            try {
                await ctx.reply(text, extra);
            }
            catch (e) {
                console.error('Ошибка отправки сообщения:', e);
            }
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
    async getPlan(planCode) {
        return await prisma_1.default.plan.findFirst({
            where: { name: planCode }
        });
    }
    isAdmin(tgId) {
        // Безопасность: тестовые команды должны быть доступны только админам.
        // Формат: ADMIN_TG_IDS=123,456
        const raw = process.env.ADMIN_TG_IDS;
        if (raw && raw.trim().length > 0) {
            const set = new Set(raw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean));
            return set.has(String(tgId));
        }
        // Для локальной разработки можно временно включить без списка админов
        // ALLOW_TESTSUB=1
        if (process.env.ALLOW_TESTSUB === '1')
            return true;
        return false;
    }
    async hasActiveSubscription(tgId) {
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
        return !!(user?.subscriptions && user.subscriptions.length > 0);
    }
    async getActiveSubscription(tgId) {
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
    async getActiveSubscriptions(tgId) {
        const user = await prisma_1.default.user.findUnique({
            where: { telegramId: BigInt(tgId) },
            include: {
                subscriptions: {
                    where: {
                        status: 'active',
                        endAt: { gt: new Date() },
                    },
                    include: {
                        plan: true,
                    },
                    orderBy: {
                        endAt: 'desc',
                    },
                },
            },
        });
        return user?.subscriptions || [];
    }
    subscriptionsListKeyboard(subs) {
        const rows = subs.map((s) => {
            const planTitle = this.getPlanTitle(s.plan?.name || '');
            const until = s.endAt ? this.formatDate(new Date(s.endAt)) : '—';
            return [telegraf_1.Markup.button.callback(`📱 ${planTitle} до ${until}`, `sub:open:${s.id}`)];
        });
        rows.push([telegraf_1.Markup.button.callback('« В главное меню', 'menu:back')]);
        return telegraf_1.Markup.inlineKeyboard(rows);
    }
    mainMenuKeyboard(tgId) {
        const buttons = [];
        buttons.push([telegraf_1.Markup.button.callback('💳 Купить подписку', 'menu:subscribe')]);
        if (tgId) {
            buttons.push([telegraf_1.Markup.button.callback('📋 Мои подписки', 'menu:mysub')]);
        }
        // Поддержка доступна всем
        buttons.push([telegraf_1.Markup.button.callback('🆘 Поддержка', 'menu:support')]);
        return telegraf_1.Markup.inlineKeyboard(buttons);
    }
    plansKeyboard() {
        const rows = PLANS.map(plan => [
            telegraf_1.Markup.button.callback(`${plan.title} - ${plan.priceText}`, `plan:${plan.code}`)
        ]);
        rows.push([telegraf_1.Markup.button.callback('« Назад', 'menu:back')]);
        return telegraf_1.Markup.inlineKeyboard(rows);
    }
    subscriptionInfoKeyboard(subscriptionId) {
        return telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('❌ Отменить подписку', `sub:cancelsub:${subscriptionId}`)],
            [telegraf_1.Markup.button.callback('« К списку подписок', 'menu:mysub')],
            [telegraf_1.Markup.button.callback('« В главное меню', 'menu:back')],
        ]);
    }
    setupHandlers() {
        // Команда /start
        this.bot.start(async (ctx) => {
            const name = ctx.from?.first_name || 'друг';
            const tgId = ctx.from?.id;
            if (tgId) {
                await this.getOrCreateUser(tgId, ctx.from?.username);
            }
            await ctx.reply(`Привет, ${name}! 👋\n\n` +
                `Я помогу тебе настроить доступ к ускорителю интернета.\n` +
                `Выбери подписку и оплати картой РФ.`, this.mainMenuKeyboard(tgId));
        });
        // Команда /subscribe
        this.bot.command('subscribe', async (ctx) => {
            const tgId = ctx.from?.id;
            await ctx.reply('Выбери план подписки:', this.plansKeyboard());
        });
        // Команда /cancel — выход из режима обращения
        this.bot.command('cancel', async (ctx) => {
            const tgId = ctx.from?.id;
            if (!tgId)
                return;
            if (!this.supportMode.has(tgId)) {
                await ctx.reply('Нечего отменять.', this.mainMenuKeyboard(tgId));
                return;
            }
            this.supportMode.delete(tgId);
            await ctx.reply('❌ Обращение отменено. Возвращаю в главное меню.', this.mainMenuKeyboard(tgId));
        });
        // Админ-команда: выдать себе тестовую подписку без оплаты
        // Использование: /testsub [1m|3m|12m]
        this.bot.command('testsub', async (ctx) => {
            const tgId = ctx.from?.id;
            if (!tgId) {
                await ctx.reply('Ошибка: не удалось определить пользователя');
                return;
            }
            if (!this.isAdmin(tgId)) {
                await ctx.reply('⛔️ Команда доступна только администратору.');
                return;
            }
            const text = ctx.message?.text;
            const arg = text?.split(/\s+/).slice(1)[0]?.trim();
            const planCode = (arg && ['1m', '3m', '12m'].includes(arg) ? arg : '1m');
            const plan = await this.getPlan(planCode);
            if (!plan) {
                await ctx.reply('План не найден в базе данных.');
                return;
            }
            const user = await this.getOrCreateUser(tgId, ctx.from?.username);
            const now = new Date();
            const endAt = new Date(now.getTime() + plan.duration * 24 * 60 * 60 * 1000);
            const clientId = (0, crypto_1.randomUUID)();
            const subId = (0, crypto_1.randomUUID)().replace(/-/g, '');
            const email = `user${user.telegramId}-${subId}@f17.com`;
            // Создаем клиента в X-UI
            const clientData = {
                id: clientId,
                flow: 'xtls-rprx-vision',
                email,
                limitIp: 0,
                totalGB: 0,
                expiryTime: endAt.getTime(),
                enable: true,
                tgId: String(user.telegramId),
                subId,
                comment: `TEST tg:${user.telegramId} plan:${plan.name}`,
                reset: 0,
            };
            const result = await xui_1.xuiClient.createClient(config_1.config.inboundId, clientData);
            if (!result.success) {
                await ctx.reply(`❌ Не удалось создать клиента в X-UI: ${result.msg}`);
                return;
            }
            const createdSub = await prisma_1.default.subscription.create({
                data: {
                    userId: user.id,
                    planId: plan.id,
                    status: 'active',
                    startAt: now,
                    endAt,
                    xuiClientId: clientId,
                    subId,
                    xuiEmail: email,
                },
            });
            const subLink = `${config_1.config.publicSubUrl}/sub/${subId}`;
            await ctx.reply(`🧪 Тестовая подписка выдана (без оплаты)\n\n` +
                `План: ${this.getPlanTitle(plan.name)}\n` +
                `Действует до: ${this.formatDate(endAt)}\n\n` +
                `🔗 Ссылка для подключения:\n<code>${subLink}</code>\n\n` +
                `Чтобы протестировать удаление: /mysub → «Отменить подписку»`, {
                parse_mode: 'HTML',
                ...this.subscriptionInfoKeyboard(createdSub.id),
            });
        });
        // Команда /mysub
        this.bot.command('mysub', async (ctx) => {
            const tgId = ctx.from?.id;
            if (!tgId) {
                await ctx.reply('Ошибка: не удалось определить пользователя');
                return;
            }
            const subs = await this.getActiveSubscriptions(tgId);
            if (!subs.length) {
                await ctx.reply('У тебя нет активной подписки.', this.mainMenuKeyboard(tgId));
                return;
            }
            if (subs.length > 1) {
                await ctx.reply(`📋 Твои активные подписки: ${subs.length}\n\nВыбери подписку, чтобы посмотреть ссылку или отменить:`, this.subscriptionsListKeyboard(subs));
                return;
            }
            const subscription = subs[0];
            const daysLeft = Math.ceil((subscription.endAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const subLink = subscription.subId
                ? `${config_1.config.publicSubUrl}/sub/${subscription.subId}`
                : null;
            const planTitle = this.getPlanTitle(subscription.plan.name);
            await ctx.reply(`📋 Твоя подписка:\n\n` +
                `План: ${planTitle}\n` +
                `Действует до: ${this.formatDate(subscription.endAt)}\n` +
                `Осталось дней: ${daysLeft}\n\n` +
                (subLink
                    ? `🔗 Ссылка для подключения:\n<code>${subLink}</code>\n\n`
                    : `🔗 Ссылка для подключения: недоступна (обратитесь в поддержку)\n\n`) +
                `Сохрани эту ссылку!`, {
                parse_mode: 'HTML',
                ...this.subscriptionInfoKeyboard(subscription.id)
            });
        });
        // Кнопка "Купить подписку"
        this.bot.action('menu:subscribe', async (ctx) => {
            await ctx.answerCbQuery();
            await this.safeEditOrReply(ctx, 'Выбери план подписки:', this.plansKeyboard());
        });
        // Кнопка "Моя подписка"
        this.bot.action('menu:mysub', async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            if (!tgId) {
                await ctx.reply('Ошибка: не удалось определить пользователя');
                return;
            }
            const subs = await this.getActiveSubscriptions(tgId);
            if (!subs.length) {
                await this.safeEditOrReply(ctx, 'У тебя нет активной подписки.', this.mainMenuKeyboard(tgId));
                return;
            }
            if (subs.length > 1) {
                await this.safeEditOrReply(ctx, `📋 Твои активные подписки: ${subs.length}\n\nВыбери подписку, чтобы посмотреть ссылку или отменить:`, this.subscriptionsListKeyboard(subs));
                return;
            }
            const subscription = subs[0];
            const daysLeft = Math.ceil((subscription.endAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const subLink = subscription.subId
                ? `${config_1.config.publicSubUrl}/sub/${subscription.subId}`
                : null;
            const planTitle = this.getPlanTitle(subscription.plan.name);
            await this.safeEditOrReply(ctx, `📋 Твоя подписка:\n\n` +
                `План: ${planTitle}\n` +
                `Действует до: ${this.formatDate(subscription.endAt)}\n` +
                `Осталось дней: ${daysLeft}\n\n` +
                (subLink
                    ? `🔗 Ссылка для подключения:\n<code>${subLink}</code>\n\n`
                    : `🔗 Ссылка для подключения: недоступна (обратитесь в поддержку)\n\n`) +
                `Сохрани эту ссылку!`, {
                parse_mode: 'HTML',
                ...this.subscriptionInfoKeyboard(subscription.id)
            });
        });
        // Открыть конкретную подписку из списка
        this.bot.action(/^sub:open:(\d+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            const subId = Number(ctx.match[1]);
            if (!tgId)
                return;
            const subscription = await prisma_1.default.subscription.findFirst({
                where: {
                    id: subId,
                    status: 'active',
                    endAt: { gt: new Date() },
                    user: { telegramId: BigInt(tgId) },
                },
                include: { plan: true },
            });
            if (!subscription) {
                await this.safeEditOrReply(ctx, 'Подписка не найдена или уже неактивна.', this.mainMenuKeyboard(tgId));
                return;
            }
            const daysLeft = Math.ceil((subscription.endAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const subLink = subscription.subId ? `${config_1.config.publicSubUrl}/sub/${subscription.subId}` : null;
            const planTitle = this.getPlanTitle(subscription.plan.name);
            await this.safeEditOrReply(ctx, `📋 Подписка #${subscription.id}:\n\n` +
                `План: ${planTitle}\n` +
                `Действует до: ${this.formatDate(subscription.endAt)}\n` +
                `Осталось дней: ${daysLeft}\n\n` +
                (subLink
                    ? `🔗 Ссылка для подключения:\n<code>${subLink}</code>\n\n`
                    : `🔗 Ссылка для подключения: недоступна (обратитесь в поддержку)\n\n`) +
                `Сохрани эту ссылку!`, {
                parse_mode: 'HTML',
                ...this.subscriptionInfoKeyboard(subscription.id),
            });
        });
        // Запрос отмены конкретной подписки
        this.bot.action(/^sub:cancelsub:(\d+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            const subId = Number(ctx.match[1]);
            if (!tgId)
                return;
            const subscription = await prisma_1.default.subscription.findFirst({
                where: {
                    id: subId,
                    status: 'active',
                    endAt: { gt: new Date() },
                    user: { telegramId: BigInt(tgId) },
                },
                include: { plan: true },
            });
            if (!subscription) {
                await this.safeEditOrReply(ctx, 'Подписка не найдена или уже неактивна.', this.mainMenuKeyboard(tgId));
                return;
            }
            await this.safeEditOrReply(ctx, `⚠️ Вы уверены, что хотите отменить подписку #${subscription.id} (${this.getPlanTitle(subscription.plan.name)})?\n\n` +
                'После отмены:\n' +
                '• Доступ к ускорителю по этой ссылке будет прекращен\n' +
                '• Остальные подписки (если есть) останутся активными', telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('✅ Да, отменить', `sub:confirmcancel:${subscription.id}`)],
                [telegraf_1.Markup.button.callback('« Назад к подписке', `sub:open:${subscription.id}`)],
                [telegraf_1.Markup.button.callback('« К списку подписок', 'menu:mysub')],
            ]));
        });
        // Подтверждение отмены конкретной подписки
        this.bot.action(/^sub:confirmcancel:(\d+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            const subId = Number(ctx.match[1]);
            if (!tgId)
                return;
            await this.safeEditOrReply(ctx, 'Отменяю подписку...');
            try {
                const subscription = await prisma_1.default.subscription.findFirst({
                    where: {
                        id: subId,
                        status: 'active',
                        user: { telegramId: BigInt(tgId) },
                    },
                });
                if (!subscription) {
                    await ctx.reply('Подписка не найдена или уже отменена.', this.mainMenuKeyboard(tgId));
                    return;
                }
                if (subscription.xuiClientId) {
                    const deleteResult = await xui_1.xuiClient.deleteClient(config_1.config.inboundId, subscription.xuiClientId, subscription.xuiEmail || `user${tgId}@f17.com`);
                    if (!deleteResult.success) {
                        const altResult = await xui_1.xuiClient.deleteClientAlternative(config_1.config.inboundId, {
                            clientId: subscription.xuiClientId,
                            email: subscription.xuiEmail || undefined,
                            subId: subscription.subId || undefined,
                            tgId: String(tgId),
                        });
                        if (!altResult.success) {
                            throw new Error('Не удалось удалить клиента из X-UI');
                        }
                    }
                }
                await prisma_1.default.subscription.update({
                    where: { id: subscription.id },
                    data: { status: 'cancelled' },
                });
                const subs = await this.getActiveSubscriptions(tgId);
                if (!subs.length) {
                    await ctx.reply('✅ Подписка отменена. Активных подписок больше нет.', this.mainMenuKeyboard(tgId));
                    return;
                }
                await ctx.reply('✅ Подписка отменена. Остальные подписки активны.', this.subscriptionsListKeyboard(subs));
            }
            catch (error) {
                console.error('Ошибка отмены подписки:', error);
                await ctx.reply(`❌ Ошибка: ${error.message}`, this.mainMenuKeyboard(tgId));
            }
        });
        // Кнопка "Назад"
        this.bot.action('menu:back', async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            await this.safeEditOrReply(ctx, 'Главное меню', this.mainMenuKeyboard(tgId));
        });
        // Кнопка "Поддержка"
        this.bot.action('menu:support', async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            if (!tgId)
                return;
            this.supportMode.add(tgId);
            await this.safeEditOrReply(ctx, '🆘 Поддержка\n\n' +
                'Напишите текст обращения одним сообщением.\n' +
                'Чтобы выйти без отправки — /cancel', undefined);
        });
        // Прием сообщений в режиме поддержки
        this.bot.on('message', async (ctx) => {
            const tgId = ctx.from?.id;
            if (!tgId)
                return;
            if (!this.supportMode.has(tgId))
                return;
            // Защита: команды в режиме поддержки (кроме /cancel)
            const msg = ctx.message;
            const maybeText = typeof msg?.text === 'string' ? msg.text : undefined;
            if (maybeText && maybeText.startsWith('/') && maybeText !== '/cancel') {
                await ctx.reply('Сейчас вы в режиме обращения. Отправьте текст или нажмите /cancel.');
                return;
            }
            // Разрешаем только текст
            if (!maybeText) {
                await ctx.reply('Пожалуйста, отправьте именно текстовое сообщение. Чтобы выйти — /cancel.');
                return;
            }
            const text = maybeText.trim();
            if (!text) {
                await ctx.reply('Сообщение не должно быть пустым. Напишите текст обращения или /cancel.');
                return;
            }
            const firstName = ctx.from?.first_name || '—';
            const username = ctx.from?.username ? `@${ctx.from.username}` : '—';
            const userId = tgId;
            const adminText = '📩 <b>Обращение в поддержку</b>\n' +
                `• <b>Имя:</b> ${this.escapeHtml(firstName)}\n` +
                `• <b>Username:</b> ${this.escapeHtml(username)}\n` +
                `• <b>User ID:</b> <code>${userId}</code>\n\n` +
                `<b>Текст:</b>\n${this.escapeHtml(text)}`;
            try {
                await this.bot.telegram.sendMessage(config_1.config.adminChatId, adminText, { parse_mode: 'HTML' });
            }
            catch (e) {
                console.error('Ошибка отправки обращения админу:', e);
                await ctx.reply('❌ Не удалось отправить сообщение в поддержку. Попробуйте позже.', this.mainMenuKeyboard(tgId));
                // остаемся в режиме поддержки, чтобы пользователь мог попробовать снова
                return;
            }
            this.supportMode.delete(tgId);
            await ctx.reply('✅ Сообщение отправлено в поддержку. Возвращаю в главное меню.', this.mainMenuKeyboard(tgId));
        });
        // Выбор плана
        this.bot.action(/^plan:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            if (!tgId) {
                await ctx.reply('Ошибка: не удалось определить пользователя');
                return;
            }
            const planCode = ctx.match[1];
            const planData = PLANS.find(p => p.code === planCode);
            if (!planData) {
                await ctx.reply('Неизвестный план.', this.mainMenuKeyboard(tgId));
                return;
            }
            const user = await this.getOrCreateUser(tgId, ctx.from?.username);
            const plan = await this.getPlan(planCode);
            if (!plan) {
                await ctx.reply('План не найден в базе данных.', this.mainMenuKeyboard(tgId));
                return;
            }
            // Создаем уникальный orderId
            const orderId = `order_${tgId}_${Date.now()}_${(0, crypto_1.randomUUID)().slice(0, 8)}`;
            try {
                // Создаем счет в Lava Public API (gate.lava.top)
                // Email обязателен для Lava, используем технический адрес по tgId.
                const buyerEmail = `tg${tgId}@f17.com`;
                const invoiceResponse = await lava_1.lavaClient.createInvoice(planCode, buyerEmail);
                // Сохраняем платеж в БД
                await prisma_1.default.payment.create({
                    data: {
                        userId: user.id,
                        planId: plan.id,
                        invoiceId: invoiceResponse.id,
                        orderId: orderId,
                        amount: plan.price,
                        description: `Fast подписка: ${planData.title}`,
                        payUrl: invoiceResponse.url,
                        status: 'pending'
                    }
                });
                await this.safeEditOrReply(ctx, `💳 Оплата подписки\n\n` +
                    `План: ${planData.title}\n` +
                    `Стоимость: ${planData.priceText}\n` +
                    `Срок: ${planData.days} дней\n\n` +
                    `Для оплаты нажмите кнопку ниже.\n` +
                    `Счет действителен 30 минут.`, telegraf_1.Markup.inlineKeyboard([
                    [telegraf_1.Markup.button.url('💳 Оплатить', invoiceResponse.url)],
                    [telegraf_1.Markup.button.callback('🔄 Проверить оплату', `checkpay:${invoiceResponse.id}`)],
                    [telegraf_1.Markup.button.callback('« Назад', 'menu:back')]
                ]));
            }
            catch (error) {
                console.error('Ошибка создания инвойса:', error);
                await ctx.reply(`❌ Ошибка: ${error.message}\n\n` +
                    `Попробуйте еще раз или обратитесь в поддержку.`, this.mainMenuKeyboard(tgId));
            }
        });
        // Проверка оплаты
        this.bot.action(/^checkpay:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            const invoiceId = ctx.match[1];
            if (!tgId)
                return;
            try {
                await ctx.editMessageText('🔄 Проверяю статус оплаты...');
                const payment = await prisma_1.default.payment.findFirst({
                    where: {
                        invoiceId,
                        user: { telegramId: BigInt(tgId) }
                    },
                    include: { plan: true, user: true }
                });
                if (!payment) {
                    await ctx.reply('Платеж не найден.', this.mainMenuKeyboard(tgId));
                    return;
                }
                if (payment.status === 'success') {
                    await ctx.reply('✅ Оплата уже подтверждена!', this.mainMenuKeyboard(tgId));
                    return;
                }
                const status = await lava_1.lavaClient.getInvoiceStatus(invoiceId);
                if (status.status === 'success') {
                    await this.processSuccessfulPayment(payment);
                    await ctx.editMessageText('✅ Оплата подтверждена! Подписка активирована.');
                }
                else if (status.status === 'pending') {
                    await ctx.editMessageText('⏳ Платеж обрабатывается...\n' +
                        'Попробуйте проверить позже.', telegraf_1.Markup.inlineKeyboard([
                        [telegraf_1.Markup.button.url('💳 Оплатить', payment.payUrl || '')],
                        [telegraf_1.Markup.button.callback('🔄 Проверить оплату', `checkpay:${invoiceId}`)],
                        [telegraf_1.Markup.button.callback('« Назад', 'menu:back')]
                    ]));
                }
                else {
                    await ctx.editMessageText(`❌ Платеж не оплачен (статус: ${status.status})`, telegraf_1.Markup.inlineKeyboard([
                        [telegraf_1.Markup.button.url('💳 Оплатить снова', payment.payUrl || '')],
                        [telegraf_1.Markup.button.callback('« Назад', 'menu:back')]
                    ]));
                }
            }
            catch (error) {
                console.error('Ошибка проверки платежа:', error);
                await ctx.reply(`❌ Ошибка: ${error.message}`, this.mainMenuKeyboard(tgId));
            }
        });
        // Отмена подписки
        this.bot.action('menu:cancelsub', async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = ctx.from?.id;
            if (!tgId) {
                await ctx.reply('Ошибка: не удалось определить пользователя');
                return;
            }
            // Backward-compat: если где-то осталась старая кнопка, перенаправляем
            const subs = await this.getActiveSubscriptions(tgId);
            if (!subs.length) {
                await this.safeEditOrReply(ctx, 'У тебя нет активной подписки.', this.mainMenuKeyboard(tgId));
                return;
            }
            if (subs.length === 1) {
                await this.safeEditOrReply(ctx, 'Выбрана подписка для отмены:', telegraf_1.Markup.inlineKeyboard([
                    [telegraf_1.Markup.button.callback('❌ Отменить', `sub:cancelsub:${subs[0].id}`)],
                    [telegraf_1.Markup.button.callback('« Назад', 'menu:mysub')],
                ]));
                return;
            }
            await this.safeEditOrReply(ctx, `У тебя ${subs.length} активных подписок. Выбери, какую отменить:`, this.subscriptionsListKeyboard(subs));
        });
        // Подтверждение отмены
        this.bot.action(/^confirmcancelsub:(\d+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const tgId = Number(ctx.match[1]);
            if (!tgId)
                return;
            await ctx.editMessageText('Отменяю подписку...');
            try {
                // Backward-compat: отменяем «последнюю» активную, если старый callback вызван
                const subscription = await this.getActiveSubscription(tgId);
                if (subscription && subscription.xuiClientId) {
                    // Удаляем клиента из X-UI
                    const deleteResult = await xui_1.xuiClient.deleteClient(config_1.config.inboundId, subscription.xuiClientId, subscription.xuiEmail || `user${tgId}@f17.com`);
                    if (!deleteResult.success) {
                        // Fallback: удаление через обновление inbound.settings.clients
                        const altResult = await xui_1.xuiClient.deleteClientAlternative(config_1.config.inboundId, {
                            clientId: subscription.xuiClientId,
                            email: subscription.xuiEmail || undefined,
                            // subId может быть полезен для поиска, если clientId/email не совпали
                            subId: subscription.subId || undefined,
                            tgId: String(tgId),
                        });
                        if (!altResult.success) {
                            throw new Error('Не удалось удалить клиента из X-UI');
                        }
                    }
                }
                // Обновляем статус подписки (только одной)
                if (subscription) {
                    await prisma_1.default.subscription.update({
                        where: { id: subscription.id },
                        data: { status: 'cancelled' },
                    });
                }
                await ctx.reply('✅ Подписка отменена!\n' +
                    'Доступ к ускорителю прекращен.', this.mainMenuKeyboard(tgId));
            }
            catch (error) {
                console.error('Ошибка отмены подписки:', error);
                await ctx.reply(`❌ Ошибка: ${error.message}`, this.mainMenuKeyboard(tgId));
            }
        });
        // Обработка ошибок
        this.bot.catch((error, ctx) => {
            console.error(`Ошибка для ${ctx.updateType}:`, error);
            const tgId = ctx.from?.id;
            ctx.reply('Произошла ошибка. Попробуйте еще раз.', this.mainMenuKeyboard(tgId));
        });
    }
    escapeHtml(input) {
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    async launch() {
        console.log('Запуск бота...');
        await this.initializeDatabase();
        await this.bot.launch();
        console.log('Бот запущен!');
    }
    stop(reason) {
        console.log('Остановка бота...', reason || '');
        if (this.paymentCheckInterval) {
            clearInterval(this.paymentCheckInterval);
        }
        this.bot.stop(reason);
        // Закрываем соединение с БД (не блокируем shutdown)
        prisma_1.default.$disconnect().catch((e) => console.error('Ошибка закрытия Prisma:', e));
    }
}
exports.bot = new VPNBot();
