// src/config.ts
function parseInboundIds(raw: string | undefined, fallback: number): number[] {
  const source = (raw ?? '').trim();

  if (!source) return [fallback];

  // Поддерживаем форматы:
  // - "46,47,48"
  // - "46 47 48"
  // - "46-56" (диапазон)
  const parts = source.split(/[,\s]+/).filter(Boolean);
  const ids: number[] = [];

  for (const p of parts) {
    const m = p.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const from = Math.min(a, b);
      const to = Math.max(a, b);
      for (let i = from; i <= to; i++) ids.push(i);
      continue;
    }

    const n = Number(p);
    if (Number.isFinite(n)) ids.push(n);
  }

  // uniq + sort
  const uniq = Array.from(new Set(ids)).sort((a, b) => a - b);
  return uniq.length ? uniq : [fallback];
}

export const config = {
    // Telegram Bot
    botToken: process.env.BOT_TOKEN!,

    // Админ для обращений в поддержку (chat_id / user_id админа)
    // Пример: ADMIN_CHAT_ID=123456789
    adminChatId: Number(process.env.ADMIN_CHAT_ID),
    
    // X-UI Panel
    // Backward-compat: старое значение для 1 inbound.
    inboundId: Number(process.env.INBOUND_ID || 3),
    // Новое: список inbound'ов для выдачи подписки.
    // Примеры:
    //   INBOUND_IDS=46-56
    //   INBOUND_IDS=46,47,48
    inboundIds: [] as number[],
    xui: {
      url: process.env.XUI_URL!,
      login: process.env.XUI_LOGIN!,
      password: process.env.XUI_PASSWORD!
    },
    
    // Subscription URL
    publicSubUrl: process.env.PUBLIC_SUB_URL!,
    
    // Lava.Top API (Public API via gate.lava.top)
    lava: {
      apiKey: process.env.LAVA_API_KEY!,
      // offerId берутся из кабинета Lava (UUID). По одному offerId на каждый тариф.
      offerIds: {
        '1m': process.env.LAVA_OFFER_1M!,
        '3m': process.env.LAVA_OFFER_3M!,
        // 12m отключён
      },
      currency: (process.env.LAVA_CURRENCY || 'RUB') as 'RUB' | 'USD' | 'EUR',
      // опционально: секрет для проверки вебхуков (если будешь принимать вебхуки)
      webhookSecretKey: process.env.LAVA_WEBHOOK_SECRET_KEY || '',
      // опционально: baseURL для SDK (по умолчанию gate.lava.top)
      baseURL: process.env.LAVA_PUBLIC_BASE_URL || 'https://gate.lava.top',
    },
  };
  
  // Проверка обязательных переменных
  const required = [
    'BOT_TOKEN',
    'ADMIN_CHAT_ID',
    'XUI_URL',
    'XUI_LOGIN',
    'XUI_PASSWORD',
    'PUBLIC_SUB_URL',
    'LAVA_API_KEY',
    'LAVA_OFFER_1M',
    'LAVA_OFFER_3M'
  ];
  
  for (const env of required) {
    if (!process.env[env]) {
      throw new Error(`Отсутствует обязательная переменная: ${env}`);
    }
  }


  // Дополнительная валидация формата
  if (!Number.isFinite(config.inboundId) || config.inboundId <= 0) {
    throw new Error('INBOUND_ID должен быть положительным числом');
  }

  // Заполняем inboundIds после валидации INBOUND_ID
  config.inboundIds = parseInboundIds(process.env.INBOUND_IDS, config.inboundId);

  if (!Array.isArray(config.inboundIds) || config.inboundIds.length === 0) {
    throw new Error('INBOUND_IDS должен содержать хотя бы один inbound id');
  }

  for (const id of config.inboundIds) {
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('INBOUND_IDS должен содержать только положительные числа');
    }
  }

  if (!Number.isFinite(config.adminChatId) || config.adminChatId <= 0) {
    throw new Error('ADMIN_CHAT_ID должен быть положительным числом (chat_id админа)');
  }

  try {
    // eslint-disable-next-line no-new
    new URL(config.publicSubUrl);
  } catch {
    throw new Error('PUBLIC_SUB_URL должен быть валидным URL, например: https://example.com');
  }

  if (!['RUB', 'USD', 'EUR'].includes(config.lava.currency)) {
    throw new Error('LAVA_CURRENCY должен быть RUB, USD или EUR');
  }

  // offerId должны быть UUID
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const [planCode, offerId] of Object.entries(config.lava.offerIds)) {
    if (!uuidRe.test(offerId)) {
      throw new Error(`LAVA_OFFER для тарифа ${planCode} должен быть UUID (offerId из Lava)`);
    }
  }

  try {
    // eslint-disable-next-line no-new
    new URL(config.lava.baseURL);
  } catch {
    throw new Error('LAVA_PUBLIC_BASE_URL должен быть валидным URL, например: https://gate.lava.top');
  }
