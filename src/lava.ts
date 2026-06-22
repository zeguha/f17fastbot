import {
  Currency,
  InvoiceStatus,
  LavaClient as LavaPublicSdkClient,
  LogLevel,
} from 'lava-top-sdk';
import { config } from './config';

export type LavaPaymentStatus = 'pending' | 'success' | 'failed';

function toSdkCurrency(v: 'RUB' | 'USD' | 'EUR'): Currency {
  switch (v) {
    case 'RUB':
      return Currency.RUB;
    case 'USD':
      return Currency.USD;
    case 'EUR':
      return Currency.EUR;
  }
}

class LavaClient {
  private client: LavaPublicSdkClient;

  constructor() {
    this.client = new LavaPublicSdkClient({
      apiKey: config.lava.apiKey,
      webhookSecretKey: config.lava.webhookSecretKey || 'unused',
      baseURL: config.lava.baseURL,
      timeout: 10000,
      logging: {
        level: LogLevel.ERROR,
        format: 'json',
      },
    });
  }

  private getOfferId(planCode: string): string {
    const offerId = (config.lava.offerIds as Record<string, string | undefined>)[planCode];
    if (!offerId) {
      throw new Error(`Не настроен LAVA_OFFER для тарифа: ${planCode}`);
    }
    return offerId;
  }

  async createInvoice(planCode: string, email: string): Promise<{ id: string; url: string }> {
    const offerId = this.getOfferId(planCode);
    const currency = toSdkCurrency(config.lava.currency);

    const invoice = await this.client.createOneTimePayment(email, offerId, currency);

    if (!invoice?.id) {
      throw new Error('Lava не вернула id инвойса');
    }
    if (!invoice.paymentUrl) {
      throw new Error('Lava не вернула paymentUrl');
    }

    return { id: invoice.id, url: invoice.paymentUrl };
  }

  async getInvoiceStatus(invoiceId: string): Promise<{ status: LavaPaymentStatus; raw: unknown }> {
    const invoice = await this.client.getInvoices(invoiceId);

    let status: LavaPaymentStatus;
    switch (invoice.status) {
      case InvoiceStatus.COMPLETED:
        status = 'success';
        break;
      case InvoiceStatus.FAILED:
        status = 'failed';
        break;
      case InvoiceStatus.NEW:
      case InvoiceStatus.IN_PROGRESS:
      default:
        status = 'pending';
        break;
    }

    return { status, raw: invoice };
  }
}

export const lavaClient = new LavaClient();
