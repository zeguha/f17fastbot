"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LavaClient = exports.WebhookServer = exports.WebhookHandler = void 0;
const axios_1 = __importDefault(require("axios"));
const types_1 = require("./types");
const logger_1 = require("./logger");
__exportStar(require("./types"), exports);
__exportStar(require("./logger"), exports);
var webhook_1 = require("./webhook");
Object.defineProperty(exports, "WebhookHandler", { enumerable: true, get: function () { return webhook_1.WebhookHandler; } });
var server_1 = require("./server");
Object.defineProperty(exports, "WebhookServer", { enumerable: true, get: function () { return server_1.WebhookServer; } });
class LavaClient {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.logger = new logger_1.Logger(config.logging);
        const axiosConfig = {
            baseURL: config.baseURL || 'https://gate.lava.top',
            timeout: config.timeout || 10000,
            headers: {
                'X-Api-Key': this.apiKey,
                'Content-Type': 'application/json',
            },
        };
        // Add proxy configuration if provided
        if (config.proxy) {
            axiosConfig.proxy = {
                host: config.proxy.host,
                port: config.proxy.port,
                protocol: config.proxy.protocol || 'http',
            };
        }
        this.client = axios_1.default.create(axiosConfig);
        // Добавляем интерсептор для логирования запросов
        this.client.interceptors.request.use((config) => {
            this.logger.debug('Outgoing request', {
                method: config.method,
                url: config.url,
                headers: config.headers,
                data: config.data,
            });
            return config;
        }, (error) => {
            this.logger.error('Request error', { error: error.message });
            return Promise.reject(error);
        });
        // Добавляем интерсептор для логирования ответов
        this.client.interceptors.response.use((response) => {
            this.logger.debug('Incoming response', {
                status: response.status,
                data: response.data,
            });
            return response;
        }, (error) => {
            var _a, _b, _c, _d;
            this.logger.error('Response error', {
                status: (_a = error.response) === null || _a === void 0 ? void 0 : _a.status,
                data: (_b = error.response) === null || _b === void 0 ? void 0 : _b.data,
                message: error.message,
            });
            if ((_d = (_c = error.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.error) {
                const errorMessage = error.response.data.error;
                return Promise.reject(new Error(errorMessage));
            }
            return Promise.reject(error);
        });
    }
    /**
     * Создание контракта на покупку контента
     * @param email Email покупателя
     * @param offerId ID предложения/товара
     * @param currency Валюта платежа (RUB, USD, EUR)
     * @param periodicity Периодичность платежа (ONE_TIME, MONTHLY, PERIOD_90_DAYS, PERIOD_180_DAYS, PERIOD_YEAR)
     * @param paymentMethod Способ оплаты (BANK131, UNLIMINT, PAYPAL, STRIPE)
     * @param buyerLanguage Язык интерфейса (EN, RU, ES)
     * @param utmSource Источник трафика (utm_source)
     * @param utmMedium Канал трафика (utm_medium)
     * @param utmCampaign Название кампании (utm_campaign)
     * @param utmTerm Ключевые слова (utm_term)
     * @param utmContent Содержание (utm_content)
     * @returns Информация о созданном контракте
     */
    createInvoice(email, offerId, currency, periodicity, paymentMethod, buyerLanguage, utmSource, utmMedium, utmCampaign, utmTerm, utmContent) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                email,
                offerId,
                currency,
                periodicity,
                paymentMethod,
                buyerLanguage,
                clientUtm: utmSource || utmMedium || utmCampaign || utmTerm || utmContent ? {
                    utm_source: utmSource,
                    utm_medium: utmMedium,
                    utm_campaign: utmCampaign,
                    utm_term: utmTerm,
                    utm_content: utmContent
                } : undefined
            };
            this.logger.info('Creating invoice', { params });
            const response = yield this.client.post('/api/v2/invoice', params);
            this.logger.info('Invoice created', { id: response.data.id });
            return response.data;
        });
    }
    /**
     * Получение информации о контракте по ID
     * @param id Идентификатор контракта
     */
    getInvoices(id) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.info('Getting invoice', { id });
            const response = yield this.client.get(`/api/v1/invoices/${id}`);
            this.logger.info('Invoice retrieved', { id: response.data.id });
            return response.data;
        });
    }
    /**
     * Создание одноразовой покупки
     * @param email Email покупателя
     * @param offerId ID предложения/товара
     * @param currency Валюта платежа (RUB, USD, EUR)
     * @param paymentMethod Способ оплаты (BANK131, UNLIMINT, PAYPAL, STRIPE)
     * @param buyerLanguage Язык интерфейса (EN, RU, ES)
     * @param utmSource Источник трафика (utm_source)
     * @param utmMedium Канал трафика (utm_medium)
     * @param utmCampaign Название кампании (utm_campaign)
     * @param utmTerm Ключевые слова (utm_term)
     * @param utmContent Содержание (utm_content)
     * @returns Информация о созданном контракте
     */
    createOneTimePayment(email, offerId, currency, paymentMethod, buyerLanguage, utmSource, utmMedium, utmCampaign, utmTerm, utmContent) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.info('Creating one-time payment', { email, offerId, currency });
            return this.createInvoice(email, offerId, currency, types_1.Periodicity.ONE_TIME, paymentMethod, buyerLanguage, utmSource, utmMedium, utmCampaign, utmTerm, utmContent);
        });
    }
    /**
     * Создание подписки
     * @param email Email покупателя
     * @param offerId ID предложения/товара
     * @param currency Валюта платежа (RUB, USD, EUR)
     * @param periodicity Периодичность платежа (MONTHLY, PERIOD_90_DAYS, PERIOD_180_DAYS, PERIOD_YEAR)
     * @param paymentMethod Способ оплаты (BANK131, UNLIMINT, PAYPAL, STRIPE)
     * @param buyerLanguage Язык интерфейса (EN, RU, ES)
     * @param utmSource Источник трафика (utm_source)
     * @param utmMedium Канал трафика (utm_medium)
     * @param utmCampaign Название кампании (utm_campaign)
     * @param utmTerm Ключевые слова (utm_term)
     * @param utmContent Содержание (utm_content)
     * @returns Информация о созданном контракте
     */
    createSubscription(email, offerId, currency, periodicity, paymentMethod, buyerLanguage, utmSource, utmMedium, utmCampaign, utmTerm, utmContent) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.info('Creating subscription', { email, offerId, currency, periodicity });
            return this.createInvoice(email, offerId, currency, periodicity, paymentMethod, buyerLanguage, utmSource, utmMedium, utmCampaign, utmTerm, utmContent);
        });
    }
    // Общий метод для GET запросов
    get(endpoint, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield this.client.get(endpoint, { params });
            return response.data;
        });
    }
    // Общий метод для POST запросов
    post(endpoint, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield this.client.post(endpoint, data);
            return response.data;
        });
    }
    /**
     * Получение списка продуктов
     * @param beforeCreatedAt Фильтр по дате создания (ISO string)
     * @param contentCategories Тип контента (POST, PRODUCT)
     * @param productTypes Тип продукта (COURSE, DIGITAL_PRODUCT, BOOK, GUIDE, SUBSCRIPTION, AUDIO, MODS, CONSULTATION)
     * @param feedVisibility Видимость в ленте (ALL, ONLY_VISIBLE, ONLY_HIDDEN)
     * @param showAllSubscriptionPeriods Показывать все периоды подписки
     * @returns Список продуктов и постов
     */
    getProducts(beforeCreatedAt, contentCategories, productTypes, feedVisibility, showAllSubscriptionPeriods) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                beforeCreatedAt,
                contentCategories,
                productTypes,
                feedVisibility,
                showAllSubscriptionPeriods
            };
            this.logger.info('Fetching products list', { params });
            const response = yield this.client.get('/api/v2/products', { params });
            this.logger.info('Products retrieved', { count: response.data.items.length });
            return response.data;
        });
    }
    /**
     * Получение продукта по ID
     * @param id Идентификатор продукта
     */
    getProduct(id) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.info('Fetching product details', { id });
            const response = yield this.client.get(`/api/v2/products/${id}`);
            this.logger.info('Product details retrieved', { id });
            return response.data;
        });
    }
    /**
     * Получение URL для донатов
     */
    getDonations() {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.info('Fetching donations URL');
            const response = yield this.client.get('/api/v1/donate');
            this.logger.info('Donations URL retrieved');
            return response.data;
        });
    }
    /**
     * Получение списка продаж
     * @param page Номер страницы (начиная с 1)
     * @param perPage Количество элементов на странице
     */
    getSales() {
        return __awaiter(this, arguments, void 0, function* (page = 1, perPage = 10) {
            this.logger.info('Fetching sales list', { page, perPage });
            const response = yield this.client.get('/api/v1/sales/', {
                params: { page, perPage }
            });
            this.logger.info('Sales list retrieved', { count: response.data.items.length });
            return response.data;
        });
    }
    /**
     * Получение списка продаж по конкретному продукту
     * @param productId ID продукта
     * @param page Номер страницы (начиная с 1)
     * @param perPage Количество элементов на странице
     */
    getSalesByProductId(productId_1) {
        return __awaiter(this, arguments, void 0, function* (productId, page = 1, perPage = 10) {
            this.logger.info('Fetching sales for product', { productId, page, perPage });
            const response = yield this.client.get(`/api/v1/sales/${productId}`, {
                params: { page, perPage }
            });
            this.logger.info('Product sales retrieved', { productId, count: response.data.items.length });
            return response.data;
        });
    }
    verifyWebhookSignature(payload, signature, secretKey) {
        this.logger.debug('Verifying webhook signature', { signature });
        // TODO: Implement actual signature verification logic
        // This is a placeholder implementation
        return signature === 'test-signature';
    }
}
exports.LavaClient = LavaClient;
