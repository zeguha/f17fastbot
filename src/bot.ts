import { Telegraf, Markup, Context } from 'telegraf';
import { randomUUID, randomBytes } from 'crypto';
import 'dotenv/config';
import { config } from './config';
import { xuiClient } from './xui';
import { lavaClient } from './lava';
import prisma from './prisma';

interface PlanData {
  code: string;
  title: string;
  days: number;
  price: number;
  priceText: string;
}

const PLANS: PlanData[] = [
  { code: '1m', title: '1 месяц', days: 30, price: 199, priceText: '199 ₽' },
  { code: '3m', title: '3 месяца', days: 90, price: 549, priceText: '549 ₽' },
];

class VPNBot {
  private bot: Telegraf;
  private paymentCheckInterval?: NodeJS.Timeout;
  private supportMode = new Set<number>();

  constructor() {
    if (!config.botToken) {
      throw new Error('BOT_TOKEN не указан');
    }
    this.bot = new Telegraf(config.botToken);
    
    this.setupHandlers();
    this.startPaymentChecker();
  }

  private async initializeDatabase() {
    try {
      console.log('Инициализация базы данных...');
      
      for (const plan of PLANS) {
        const existingPlan = await prisma.plan.findFirst({
          where: { name: plan.code }
        });

        if (!existingPlan) {
          await prisma.plan.create({
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
    } catch (error) {
      console.error('Ошибка инициализации базы данных:', error);
    }
  }

  private startPaymentChecker() {
    this.paymentCheckInterval = setInterval(async () => {
      await this.checkPendingPayments();
    }, 30000);
  }

  private async checkPendingPayments() {
    try {
      const pendingPayments = await prisma.payment.findMany({
        where: {
          status: 'pending',
          createdAt: {
            gt: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        },
        include: {
          user: true,
          plan: true
        }
      });

      for (const payment of pendingPayments) {
        try {
          const status = await lavaClient.getInvoiceStatus(payment.invoiceId);
          
          if (status.status === 'success') {
            await this.processSuccessfulPayment(payment);
          } else if (status.status === 'failed') {
            await prisma.payment.update({
              where: { id: payment.id },
              data: { status: 'failed' }
            });
          }
        } catch (error) {
          console.error(`Ошибка проверки платежа ${payment.invoiceId}:`, error);
        }
      }
    } catch (error) {
      console.error('Ошибка проверки платежей:', error);
    }
  }

  private async processSuccessfulPayment(payment: any) {
    try {
      const user = payment.user;
      const plan = payment.plan;

      await prisma.payment.update({
        where: { id: payment.id },
        data: { 
          status: 'success',
          payTime: new Date()
        }
      });

      const now = new Date();
      const endAt = new Date(now.getTime() + plan.duration * 24 * 60 * 60 * 1000);
      const clientId = randomUUID();
      const subId = randomUUID().replace(/-/g, '');
      const emailBase = `user${user.telegramId}-${subId}`;

      const clientDataBase: Record<string, any> = {
        id: clientId,
        limitIp: 0,
        totalGB: 0,
        expiryTime: endAt.getTime(),
        enable: true,
        tgId: String(user.telegramId),
        subId: subId,
        comment: `tg:${user.telegramId} plan:${plan.name}`,
        reset: 0,
      };

      const inboundIds = (config.inboundIds && config.inboundIds.length > 0)
        ? config.inboundIds
        : [config.inboundId];

      const inboundCache = new Map<number, any>();
      const getInbound = async (inboundId: number) => {
        if (inboundCache.has(inboundId)) return inboundCache.get(inboundId);
        const r = await xuiClient.getInbound(inboundId);
        if (!r.success) throw new Error(`Не удалось получить inbound #${inboundId}: ${r.msg}`);
        inboundCache.set(inboundId, r.obj);
        return r.obj;
      };

      const errors: string[] = [];
      for (const inboundId of inboundIds) {
        const inbound = await getInbound(inboundId);
        const protocol = String(inbound?.protocol || '').toLowerCase();

        let settingsObj: any = null;
        try {
          settingsObj = inbound?.settings ? JSON.parse(inbound.settings) : null;
        } catch {
          settingsObj = null;
        }
        const templateClient = settingsObj?.clients?.[0] || null;

        const clientData: Record<string, any> = {
          ...clientDataBase,
          email: `${emailBase}-${inboundId}@${config.clientEmailDomain}`,
        };

        if (protocol === 'vless') {
          const flow = templateClient?.flow;
          if (typeof flow === 'string' && flow.trim().length > 0) clientData.flow = flow;
        } else if (protocol === 'vmess') {
          const sec = templateClient?.security;
          clientData.security = (typeof sec === 'string' && sec.trim().length > 0) ? sec : 'auto';
        } else if (protocol === 'shadowsocks') {
          const method = settingsObj?.method || templateClient?.method;
          if (typeof method === 'string' && method.trim().length > 0) clientData.method = method;
          clientData.password = randomBytes(32).toString('base64');
        }

        const result = await xuiClient.createClient(inboundId, clientData as any);
        if (!result.success) errors.push(`#${inboundId}: ${result.msg}`);
      }

      if (errors.length > 0) {
        throw new Error(`Ошибка X-UI (не все inbound'ы создались): ${errors.join(' | ')}`);
      }

      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: 'active',
          startAt: now,
          endAt: endAt,
          xuiClientId: clientId,
          subId,
          xuiEmail: `${emailBase}-${inboundIds[0]}@${config.clientEmailDomain}`,
        }
      });

      const subLink = `${config.publicSubUrl}/sub/${subId}`;
      await this.bot.telegram.sendMessage(
        Number(user.telegramId),
        `✅ Оплата успешно получена!\n\n` +
        `📋 Подписка активирована:\n` +
        `План: ${this.getPlanTitle(plan.name)}\n` +
        `Срок действия: ${this.formatDate(endAt)}\n` +
        `Дней: ${plan.duration}\n\n` +
        `🔗 Ссылка для подключения:\n<code>${subLink}</code>\n\n` +
        `Для управления подпиской используйте команду /mysub`,
        { parse_mode: 'HTML' }
      );

    } catch (error: any) {
      console.error(`Ошибка обработки платежа ${payment.id}:`, error);
      await prisma.payment.update({
        where: { id: payment.id },
        data: { 
          status: 'error',
          description: error.message?.substring(0, 255) || 'Неизвестная ошибка'
        }
      });
    }
  }

  private getPlanTitle(planCode: string): string {
    const plan = PLANS.find(p => p.code === planCode);
    return plan ? plan.title : planCode;
  }

  private formatDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  }

  private async safeEditOrReply(ctx: any, text: string, extra?: any) {
    try {
      if (ctx.updateType === 'callback_query') {
        await ctx.editMessageText(text, extra);
      } else {
        await ctx.reply(text, extra);
      }
    } catch (error) {
      try {
        await ctx.reply(text, extra);
      } catch (e) {
        console.error('Ошибка отправки сообщения:', e);
      }
    }
  }

  private async getOrCreateUser(tgId: number, username?: string) {
    const telegramId = BigInt(tgId);
    
    let user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          username: username || null
        }
      });
    }

    return user;
  }

  private async getPlan(planCode: string) {
    return await prisma.plan.findFirst({
      where: { name: planCode }
    });
  }

  private isAdmin(tgId: number): boolean {
    const raw = process.env.ADMIN_TG_IDS;
    if (raw && raw.trim().length > 0) {
      const set = new Set(
        raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
      return set.has(String(tgId));
    }

    if (process.env.ALLOW_TESTSUB === '1') return true;

    return false;
  }

  private async hasActiveSubscription(tgId: number): Promise<boolean> {
    const user = await prisma.user.findUnique({
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

  private async getActiveSubscription(tgId: number) {
    const user = await prisma.user.findUnique({
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

  private async getActiveSubscriptions(tgId: number) {
    const user = await prisma.user.findUnique({
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

  private subscriptionsListKeyboard(subs: Array<any>) {
    const rows = subs.map((s) => {
      const planTitle = this.getPlanTitle(s.plan?.name || '');
      const until = s.endAt ? this.formatDate(new Date(s.endAt)) : '—';
      return [Markup.button.callback(`📱 ${planTitle} до ${until}`, `sub:open:${s.id}`)];
    });

    rows.push([Markup.button.callback('« В главное меню', 'menu:back')]);
    return Markup.inlineKeyboard(rows);
  }

  private mainMenuKeyboard(tgId?: number) {
    const buttons = [];
    
    buttons.push([Markup.button.callback('💳 Купить подписку', 'menu:subscribe')]);
    
    if (tgId) {
      buttons.push([Markup.button.callback('📋 Мои подписки', 'menu:mysub')]);
    }

    buttons.push([Markup.button.callback('❓ FAQ', 'menu:faq')]);

    buttons.push([Markup.button.callback('🆘 Поддержка', 'menu:support')]);
    
    return Markup.inlineKeyboard(buttons);
  }

  private plansKeyboard() {
    const rows = PLANS.map(plan => [
      Markup.button.callback(`${plan.title} - ${plan.priceText}`, `plan:${plan.code}`)
    ]);
    rows.push([Markup.button.callback('« Назад', 'menu:back')]);
    return Markup.inlineKeyboard(rows);
  }

  private subscriptionInfoKeyboard(subscriptionId: number) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отменить подписку', `sub:cancelsub:${subscriptionId}`)],
      [Markup.button.callback('« К списку подписок', 'menu:mysub')],
      [Markup.button.callback('« В главное меню', 'menu:back')],
    ]);
  }

  private faqText(): string {
    return (
      `<b>FAQ</b> — ответы на частые вопросы\n\n` +
      `<b>1) Как подключиться?</b>\n` +
      `Открой ссылку подписки в приложении-клиенте (например: v2rayNG, Hiddify, v2rayN). ` +
      `Обычно ссылка сама предложит импорт.\n\n` +
      `<b>2) Где моя ссылка подписки?</b>\n` +
      `Нажми «📋 Мои подписки» в меню или отправь команду /mysub.\n\n` +
      `<b>3) Сколько устройств можно подключить?</b>\n` +
      `Можно подключить несколько устройств, но не передавай ссылку третьим лицам — доступ могут заблокировать.\n\n` +
      `<b>4) Ссылка открывается, но интернет не работает</b>\n` +
      `Проверь: включён ли VPN в приложении, правильные дата/время на телефоне, не включён ли режим экономии трафика/энергии. ` +
      `Иногда помогает переимпорт подписки (обновить/пересканировать) и перезапуск приложения.\n\n` +
      `<b>5) Что делать, если скорость низкая?</b>\n` +
      `Попробуй обновить подписку в клиенте и переключить один из конфигов. ` +
      `Скорость может зависеть от провайдера/страны/времени суток.\n\n` +
      `<b>6) Оплата не проходит / не пришла подписка</b>\n` +
      `Подожди 1–2 минуты и нажми «Проверить оплату». Если не помогло — напиши в поддержку.\n\n` +
      `<b>7) Как связаться с поддержкой?</b>\n` +
      `Нажми «🆘 Поддержка» в меню и опиши проблему одним сообщением (желательно со скриншотом).`
    );
  }

  private faqKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('« В главное меню', 'menu:back')],
    ]);
  }

  private setupHandlers() {
    this.bot.start(async (ctx) => {
      const name = ctx.from?.first_name || 'друг';
      const tgId = ctx.from?.id;
      const supportLine = config.supportUsername ? `Поддержка @${config.supportUsername.replace(/^@/, '')}\n` : '';
      const newsLine = config.newsChannelUsername ? `Канал с обновлениями @${config.newsChannelUsername.replace(/^@/, '')}` : '';
      
      if (tgId) {
        await this.getOrCreateUser(tgId, ctx.from?.username);
      }
      
      await ctx.reply(
        `Привет, ${name}! 👋\n\n` +
        `Я помогу тебе настроить доступ к ускорителю интернета.\n` +
        `Выбери подписку и оплати картой РФ.\n` +
        supportLine +
        newsLine,
        this.mainMenuKeyboard(tgId)
      );
    });

    this.bot.command('subscribe', async (ctx) => {
      await ctx.reply('Выбери план подписки:', this.plansKeyboard());
    });

    this.bot.command('faq', async (ctx) => {
      await ctx.reply(this.faqText(), {
        parse_mode: 'HTML',
        ...this.faqKeyboard(),
      });
    });

    this.bot.command('cancel', async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;

      if (!this.supportMode.has(tgId)) {
        await ctx.reply('Нечего отменять.', this.mainMenuKeyboard(tgId));
        return;
      }

      this.supportMode.delete(tgId);
      await ctx.reply('❌ Обращение отменено. Возвращаю в главное меню.', this.mainMenuKeyboard(tgId));
    });

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

      const text = (ctx.message as any)?.text as string | undefined;
      const arg = text?.split(/\s+/).slice(1)[0]?.trim();
      const planCode = (arg && ['1m', '3m'].includes(arg) ? arg : '1m') as
        | '1m'
        | '3m';

      const plan = await this.getPlan(planCode);
      if (!plan) {
        await ctx.reply('План не найден в базе данных.');
        return;
      }

      const user = await this.getOrCreateUser(tgId, ctx.from?.username);
      const now = new Date();
      const endAt = new Date(now.getTime() + plan.duration * 24 * 60 * 60 * 1000);
      const clientId = randomUUID();
      const subId = randomUUID().replace(/-/g, '');
      const emailBase = `user${user.telegramId}-${subId}`;

      const clientDataBase: Record<string, any> = {
        id: clientId,
        limitIp: 0,
        totalGB: 0,
        expiryTime: endAt.getTime(),
        enable: true,
        tgId: String(user.telegramId),
        subId,
        comment: `TEST tg:${user.telegramId} plan:${plan.name}`,
        reset: 0,
      };

      const inboundIds = (config.inboundIds && config.inboundIds.length > 0)
        ? config.inboundIds
        : [config.inboundId];

      const inboundCache = new Map<number, any>();
      const getInbound = async (inboundId: number) => {
        if (inboundCache.has(inboundId)) return inboundCache.get(inboundId);
        const r = await xuiClient.getInbound(inboundId);
        if (!r.success) throw new Error(`Не удалось получить inbound #${inboundId}: ${r.msg}`);
        inboundCache.set(inboundId, r.obj);
        return r.obj;
      };

      const errors: string[] = [];
      for (const inboundId of inboundIds) {
        const inbound = await getInbound(inboundId);
        const protocol = String(inbound?.protocol || '').toLowerCase();

        let settingsObj: any = null;
        try {
          settingsObj = inbound?.settings ? JSON.parse(inbound.settings) : null;
        } catch {
          settingsObj = null;
        }
        const templateClient = settingsObj?.clients?.[0] || null;

        const clientData: Record<string, any> = {
          ...clientDataBase,
          email: `${emailBase}-${inboundId}@${config.clientEmailDomain}`,
        };

        if (protocol === 'vless') {
          const flow = templateClient?.flow;
          if (typeof flow === 'string' && flow.trim().length > 0) clientData.flow = flow;
        } else if (protocol === 'vmess') {
          const sec = templateClient?.security;
          clientData.security = (typeof sec === 'string' && sec.trim().length > 0) ? sec : 'auto';
        } else if (protocol === 'shadowsocks') {
          const method = settingsObj?.method || templateClient?.method;
          if (typeof method === 'string' && method.trim().length > 0) clientData.method = method;
          clientData.password = randomBytes(32).toString('base64');
        }

        const result = await xuiClient.createClient(inboundId, clientData as any);
        if (!result.success) errors.push(`#${inboundId}: ${result.msg}`);
      }

      if (errors.length > 0) {
        await ctx.reply(`❌ Не удалось создать клиента в X-UI (не все inbound'ы): ${errors.join(' | ')}`);
        return;
      }

      const createdSub = await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: 'active',
          startAt: now,
          endAt,
          xuiClientId: clientId,
          subId,
          xuiEmail: `${emailBase}-${inboundIds[0]}@${config.clientEmailDomain}`,
        },
      });

      const subLink = `${config.publicSubUrl}/sub/${subId}`;
      await ctx.reply(
        `🧪 Тестовая подписка выдана (без оплаты)\n\n` +
          `План: ${this.getPlanTitle(plan.name)}\n` +
          `Действует до: ${this.formatDate(endAt)}\n\n` +
          `🔗 Ссылка для подключения:\n<code>${subLink}</code>\n\n` +
          `Чтобы протестировать удаление: /mysub → «Отменить подписку»`,
        {
          parse_mode: 'HTML',
          ...this.subscriptionInfoKeyboard(createdSub.id),
        }
      );
    });

    this.bot.command('mysub', async (ctx) => {
      const tgId = ctx.from?.id;
      
      if (!tgId) {
        await ctx.reply('Ошибка: не удалось определить пользователя');
        return;
      }

      const subs = await this.getActiveSubscriptions(tgId);

      if (!subs.length) {
        await ctx.reply(
          'У тебя нет активной подписки.',
          this.mainMenuKeyboard(tgId)
        );
        return;
      }

      if (subs.length > 1) {
        await ctx.reply(
          `📋 Твои активные подписки: ${subs.length}\n\nВыбери подписку, чтобы посмотреть ссылку или отменить:`,
          this.subscriptionsListKeyboard(subs)
        );
        return;
      }

      const subscription = subs[0];

      const daysLeft = Math.ceil((subscription.endAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const subLink = subscription.subId
        ? `${config.publicSubUrl}/sub/${subscription.subId}`
        : null;
      const planTitle = this.getPlanTitle(subscription.plan.name);
      
      await ctx.reply(
        `📋 Твоя подписка:\n\n` +
        `План: ${planTitle}\n` +
        `Действует до: ${this.formatDate(subscription.endAt)}\n` +
        `Осталось дней: ${daysLeft}\n\n` +
        (subLink
          ? `🔗 Ссылка для подключения:\n<code>${subLink}</code>\n\n`
          : `🔗 Ссылка для подключения: недоступна (обратитесь в поддержку)\n\n`) +
        `Сохрани эту ссылку!`,
        { 
          parse_mode: 'HTML',
          ...this.subscriptionInfoKeyboard(subscription.id)
        }
      );
    });

    this.bot.action('menu:subscribe', async (ctx) => {
      await ctx.answerCbQuery();
      await this.safeEditOrReply(ctx, 'Выбери план подписки:', this.plansKeyboard());
    });

    this.bot.action('menu:faq', async (ctx) => {
      await ctx.answerCbQuery();
      await this.safeEditOrReply(ctx, this.faqText(), {
        parse_mode: 'HTML',
        ...this.faqKeyboard(),
      });
    });

    this.bot.action('menu:mysub', async (ctx) => {
      await ctx.answerCbQuery();
      const tgId = ctx.from?.id;
      
      if (!tgId) {
        await ctx.reply('Ошибка: не удалось определить пользователя');
        return;
      }

      const subs = await this.getActiveSubscriptions(tgId);

      if (!subs.length) {
        await this.safeEditOrReply(
          ctx, 
          'У тебя нет активной подписки.',
          this.mainMenuKeyboard(tgId)
        );
        return;
      }

      if (subs.length > 1) {
        await this.safeEditOrReply(
          ctx,
          `📋 Твои активные подписки: ${subs.length}\n\nВыбери подписку, чтобы посмотреть ссылку или отменить:`,
          this.subscriptionsListKeyboard(subs)
        );
        return;
      }

      const subscription = subs[0];

      const daysLeft = Math.ceil((subscription.endAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const subLink = subscription.subId
        ? `${config.publicSubUrl}/sub/${subscription.subId}`
        : null;
      const planTitle = this.getPlanTitle(subscription.plan.name);
      
      await this.safeEditOrReply(
        ctx,
        `📋 Твоя подписка:\n\n` +
        `План: ${planTitle}\n` +
        `Действует до: ${this.formatDate(subscription.endAt)}\n` +
        `Осталось дней: ${daysLeft}\n\n` +
        (subLink
          ? `🔗 Ссылка для подключения:\n<code>${subLink}</code>\n\n`
          : `🔗 Ссылка для подключения: недоступна (обратитесь в поддержку)\n\n`) +
        `Сохрани эту ссылку!`,
        { 
          parse_mode: 'HTML',
          ...this.subscriptionInfoKeyboard(subscription.id)
        }
      );
    });

    this.bot.action(/^sub:open:(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const tgId = ctx.from?.id;
      const subId = Number(ctx.match[1]);
      if (!tgId) return;

      const subscription = await prisma.subscription.findFirst({
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
      const subLink = subscription.subId ? `${config.publicSubUrl}/sub/${subscription.subId}` : null;
      const planTitle = this.getPlanTitle(subscription.plan.name);

      await this.safeEditOrReply(
        ctx,
        `📋 Подписка #${subscription.id}:\n\n` +
          `План: ${planTitle}\n` +
          `Действует до: ${this.formatDate(subscription.endAt)}\n` +
          `Осталось дней: ${daysLeft}\n\n` +
          (subLink
            ? `🔗 Ссылка для подключения:\n<code>${subLink}</code>\n\n`
            : `🔗 Ссылка для подключения: недоступна (обратитесь в поддержку)\n\n`) +
          `Сохрани эту ссылку!`,
        {
          parse_mode: 'HTML',
          ...this.subscriptionInfoKeyboard(subscription.id),
        }
      );
    });

    this.bot.action(/^sub:cancelsub:(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const tgId = ctx.from?.id;
      const subId = Number(ctx.match[1]);
      if (!tgId) return;

      const subscription = await prisma.subscription.findFirst({
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

      await this.safeEditOrReply(
        ctx,
        `⚠️ Вы уверены, что хотите отменить подписку #${subscription.id} (${this.getPlanTitle(subscription.plan.name)})?\n\n` +
          'После отмены:\n' +
          '• Доступ к ускорителю по этой ссылке будет прекращен\n' +
          '• Остальные подписки (если есть) останутся активными',
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Да, отменить', `sub:confirmcancel:${subscription.id}`)],
          [Markup.button.callback('« Назад к подписке', `sub:open:${subscription.id}`)],
          [Markup.button.callback('« К списку подписок', 'menu:mysub')],
        ])
      );
    });

    this.bot.action(/^sub:confirmcancel:(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const tgId = ctx.from?.id;
      const subId = Number(ctx.match[1]);
      if (!tgId) return;

      await this.safeEditOrReply(ctx, 'Отменяю подписку...');

      try {
        const subscription = await prisma.subscription.findFirst({
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
          const inboundIds = (config.inboundIds && config.inboundIds.length > 0)
            ? config.inboundIds
            : [config.inboundId];

          const errors: string[] = [];
          for (const inboundId of inboundIds) {
            const deleteResult = await xuiClient.deleteClient(
              inboundId,
              subscription.xuiClientId,
              subscription.xuiEmail || `user${tgId}@${config.clientEmailDomain}`
            );

            if (!deleteResult.success) {
              const altResult = await xuiClient.deleteClientAlternative(inboundId, {
                clientId: subscription.xuiClientId,
                email: subscription.xuiEmail || undefined,
                subId: subscription.subId || undefined,
              });

              if (!altResult.success) {
                errors.push(`#${inboundId}: ${altResult.msg || deleteResult.msg || 'unknown'}`);
              }
            }
          }

          if (errors.length > 0) {
            throw new Error(`Не удалось удалить клиента из X-UI во всех inbound'ах: ${errors.join(' | ')}`);
          }
        }

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'cancelled' },
        });

        const subs = await this.getActiveSubscriptions(tgId);
        if (!subs.length) {
          await ctx.reply('✅ Подписка отменена. Активных подписок больше нет.', this.mainMenuKeyboard(tgId));
          return;
        }

        await ctx.reply('✅ Подписка отменена. Остальные подписки активны.', this.subscriptionsListKeyboard(subs));
      } catch (error: any) {
        console.error('Ошибка отмены подписки:', error);
        await ctx.reply(`❌ Ошибка: ${error.message}`, this.mainMenuKeyboard(tgId));
      }
    });

    this.bot.action('menu:back', async (ctx) => {
      await ctx.answerCbQuery();
      const tgId = ctx.from?.id;
      await this.safeEditOrReply(ctx, 'Главное меню', this.mainMenuKeyboard(tgId));
    });

    this.bot.action('menu:support', async (ctx) => {
      await ctx.answerCbQuery();
      const tgId = ctx.from?.id;
      if (!tgId) return;

      this.supportMode.add(tgId);

      await this.safeEditOrReply(
        ctx,
        '🆘 Поддержка\n\n' +
          'Напишите текст обращения одним сообщением.\n' +
          'Чтобы выйти без отправки — /cancel',
        undefined
      );
    });

    this.bot.on('message', async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;
      if (!this.supportMode.has(tgId)) return;

      const msg: any = ctx.message;
      const maybeText = typeof msg?.text === 'string' ? msg.text : undefined;
      if (maybeText && maybeText.startsWith('/') && maybeText !== '/cancel') {
        await ctx.reply('Сейчас вы в режиме обращения. Отправьте текст или нажмите /cancel.');
        return;
      }

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

      const adminText =
        '📩 <b>Обращение в поддержку</b>\n' +
        `• <b>Имя:</b> ${this.escapeHtml(firstName)}\n` +
        `• <b>Username:</b> ${this.escapeHtml(username)}\n` +
        `• <b>User ID:</b> <code>${userId}</code>\n\n` +
        `<b>Текст:</b>\n${this.escapeHtml(text)}`;

      try {
        await this.bot.telegram.sendMessage(config.adminChatId, adminText, { parse_mode: 'HTML' });
      } catch (e) {
        console.error('Ошибка отправки обращения админу:', e);
        await ctx.reply(
          '❌ Не удалось отправить сообщение в поддержку. Попробуйте позже.',
          this.mainMenuKeyboard(tgId)
        );
        return;
      }

      this.supportMode.delete(tgId);
      await ctx.reply('✅ Сообщение отправлено в поддержку. Возвращаю в главное меню.', this.mainMenuKeyboard(tgId));
    });

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

      const orderId = `order_${tgId}_${Date.now()}_${randomUUID().slice(0, 8)}`;

      try {
        const buyerEmail = `tg${tgId}@${config.technicalEmailDomain}`;
        const invoiceResponse = await lavaClient.createInvoice(planCode, buyerEmail);

        await prisma.payment.create({
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

        await this.safeEditOrReply(
          ctx,
          `💳 Оплата подписки\n\n` +
          `План: ${planData.title}\n` +
          `Стоимость: ${planData.priceText}\n` +
          `Срок: ${planData.days} дней\n\n` +
          `Для оплаты нажмите кнопку ниже.\n` +
          `Счет действителен 30 минут.`,
          Markup.inlineKeyboard([
            [Markup.button.url('💳 Оплатить', invoiceResponse.url)],
            [Markup.button.callback('🔄 Проверить оплату', `checkpay:${invoiceResponse.id}`)],
            [Markup.button.callback('« Назад', 'menu:back')]
          ])
        );

      } catch (error: any) {
        console.error('Ошибка создания инвойса:', error);
        await ctx.reply(
          `❌ Ошибка: ${error.message}\n\n` +
          `Попробуйте еще раз или обратитесь в поддержку.`,
          this.mainMenuKeyboard(tgId)
        );
      }
    });

    this.bot.action(/^checkpay:(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const tgId = ctx.from?.id;
      const invoiceId = ctx.match[1];
      
      if (!tgId) return;

      try {
        await ctx.editMessageText('🔄 Проверяю статус оплаты...');

        const payment = await prisma.payment.findFirst({
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

        const status = await lavaClient.getInvoiceStatus(invoiceId);
        
        if (status.status === 'success') {
          await this.processSuccessfulPayment(payment);
          await ctx.editMessageText('✅ Оплата подтверждена! Подписка активирована.');
        } else if (status.status === 'pending') {
          await ctx.editMessageText(
            '⏳ Платеж обрабатывается...\n' +
            'Попробуйте проверить позже.',
            Markup.inlineKeyboard([
              [Markup.button.url('💳 Оплатить', payment.payUrl || '')],
              [Markup.button.callback('🔄 Проверить оплату', `checkpay:${invoiceId}`)],
              [Markup.button.callback('« Назад', 'menu:back')]
            ])
          );
        } else {
          await ctx.editMessageText(
            `❌ Платеж не оплачен (статус: ${status.status})`,
            Markup.inlineKeyboard([
              [Markup.button.url('💳 Оплатить снова', payment.payUrl || '')],
              [Markup.button.callback('« Назад', 'menu:back')]
            ])
          );
        }

      } catch (error: any) {
        console.error('Ошибка проверки платежа:', error);
        await ctx.reply(
          `❌ Ошибка: ${error.message}`,
          this.mainMenuKeyboard(tgId)
        );
      }
    });

    this.bot.action('menu:cancelsub', async (ctx) => {
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

      if (subs.length === 1) {
        await this.safeEditOrReply(ctx, 'Выбрана подписка для отмены:', Markup.inlineKeyboard([
          [Markup.button.callback('❌ Отменить', `sub:cancelsub:${subs[0].id}`)],
          [Markup.button.callback('« Назад', 'menu:mysub')],
        ]));
        return;
      }

      await this.safeEditOrReply(
        ctx,
        `У тебя ${subs.length} активных подписок. Выбери, какую отменить:`,
        this.subscriptionsListKeyboard(subs)
      );
    });

    this.bot.action(/^confirmcancelsub:(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const tgId = Number(ctx.match[1]);
      
      if (!tgId) return;

      await ctx.editMessageText('Отменяю подписку...');
      
      try {
        const subscription = await this.getActiveSubscription(tgId);
        
        if (subscription && subscription.xuiClientId) {
          const inboundIds = (config.inboundIds && config.inboundIds.length > 0)
            ? config.inboundIds
            : [config.inboundId];

          const errors: string[] = [];
          for (const inboundId of inboundIds) {
            const deleteResult = await xuiClient.deleteClient(
              inboundId,
              subscription.xuiClientId,
              subscription.xuiEmail || `user${tgId}@${config.clientEmailDomain}`
            );

            if (!deleteResult.success) {
              const altResult = await xuiClient.deleteClientAlternative(inboundId, {
                clientId: subscription.xuiClientId,
                email: subscription.xuiEmail || undefined,
                subId: subscription.subId || undefined,
              });

              if (!altResult.success) {
                errors.push(`#${inboundId}: ${altResult.msg || deleteResult.msg || 'unknown'}`);
              }
            }
          }

          if (errors.length > 0) {
            throw new Error(`Не удалось удалить клиента из X-UI во всех inbound'ах: ${errors.join(' | ')}`);
          }
        }

        if (subscription) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'cancelled' },
          });
        }

        await ctx.reply(
          '✅ Подписка отменена!\n' +
          'Доступ к ускорителю прекращен.',
          this.mainMenuKeyboard(tgId)
        );

      } catch (error: any) {
        console.error('Ошибка отмены подписки:', error);
        await ctx.reply(
          `❌ Ошибка: ${error.message}`,
          this.mainMenuKeyboard(tgId)
        );
      }
    });

    this.bot.catch((error: any, ctx: Context) => {
      console.error(`Ошибка для ${ctx.updateType}:`, error);
      const tgId = ctx.from?.id;
      ctx.reply('Произошла ошибка. Попробуйте еще раз.', this.mainMenuKeyboard(tgId));
    });
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public async launch() {
    console.log('Запуск бота...');
    await this.initializeDatabase();
    await this.bot.launch();
    console.log('Бот запущен!');
  }

  public stop(reason?: string) {
    console.log('Остановка бота...', reason || '');
    
    if (this.paymentCheckInterval) {
      clearInterval(this.paymentCheckInterval);
    }
    
    this.bot.stop(reason);

    prisma.$disconnect().catch((e: unknown) => console.error('Ошибка закрытия Prisma:', e));
  }
}

export const bot = new VPNBot();
