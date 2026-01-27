"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lavaClient = void 0;
// src/lava.ts
const lava_top_sdk_1 = require("lava-top-sdk");
const config_1 = require("./config");
function toSdkCurrency(v) {
    switch (v) {
        case 'RUB':
            return lava_top_sdk_1.Currency.RUB;
        case 'USD':
            return lava_top_sdk_1.Currency.USD;
        case 'EUR':
            return lava_top_sdk_1.Currency.EUR;
    }
}
class LavaClient {
    constructor() {
        // В SDK webhookSecretKey обязательный, даже если вебхуки не используем.
        this.client = new lava_top_sdk_1.LavaClient({
            apiKey: config_1.config.lava.apiKey,
            webhookSecretKey: config_1.config.lava.webhookSecretKey || 'unused',
            baseURL: config_1.config.lava.baseURL,
            timeout: 10000,
            logging: {
                level: lava_top_sdk_1.LogLevel.ERROR,
                format: 'json',
            },
        });
    }
    getOfferId(planCode) {
        const offerId = config_1.config.lava.offerIds[planCode];
        if (!offerId) {
            throw new Error(`Не настроен LAVA_OFFER для тарифа: ${planCode}`);
        }
        return offerId;
    }
    /**
     * Создаёт инвойс в Lava Public API.
     * Возвращает id инвойса и URL страницы оплаты.
     */
    async createInvoice(planCode, email) {
        const offerId = this.getOfferId(planCode);
        const currency = toSdkCurrency(config_1.config.lava.currency);
        // Для наших планов используется разовая оплата (ONE_TIME)
        const invoice = await this.client.createOneTimePayment(email, offerId, currency);
        if (!invoice?.id) {
            throw new Error('Lava не вернула id инвойса');
        }
        if (!invoice.paymentUrl) {
            throw new Error('Lava не вернула paymentUrl');
        }
        return { id: invoice.id, url: invoice.paymentUrl };
    }
    /**
     * Возвращает статус инвойса.
     */
    async getInvoiceStatus(invoiceId) {
        const invoice = await this.client.getInvoices(invoiceId);
        let status;
        switch (invoice.status) {
            case lava_top_sdk_1.InvoiceStatus.COMPLETED:
                status = 'success';
                break;
            case lava_top_sdk_1.InvoiceStatus.FAILED:
                status = 'failed';
                break;
            case lava_top_sdk_1.InvoiceStatus.NEW:
            case lava_top_sdk_1.InvoiceStatus.IN_PROGRESS:
            default:
                status = 'pending';
                break;
        }
        return { status, raw: invoice };
    }
}
exports.lavaClient = new LavaClient();
