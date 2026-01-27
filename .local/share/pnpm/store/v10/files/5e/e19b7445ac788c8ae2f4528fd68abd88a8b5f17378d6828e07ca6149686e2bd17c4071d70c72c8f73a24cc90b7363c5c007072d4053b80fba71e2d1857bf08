import { InvoiceResponse, Currency, PaymentMethod, Periodicity, Language, FeedItemType, ProductType, FeedVisibility } from './types';
import { LoggerConfig } from './logger';
export * from './types';
export * from './logger';
export { WebhookHandler } from './webhook';
export { WebhookServer } from './server';
export interface LavaClientConfig {
    apiKey: string;
    webhookSecretKey: string;
    baseURL?: string;
    timeout?: number;
    webhookPort?: number;
    logging?: LoggerConfig;
    proxy?: {
        host: string;
        port: number;
        protocol?: string;
    };
}
export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}
export interface ApiError {
    message: string;
    code?: number;
}
export interface Product {
    id: string;
    name: string;
    description?: string;
    price: number;
    currency: Currency;
    [key: string]: any;
}
export interface ProductsResponse {
    items: Product[];
}
export interface DonationResponse {
    url: string;
}
export interface Sale {
    id: string;
    offerId: string;
    email: string;
    amount: number;
    currency: Currency;
    status: string;
    createdAt: string;
}
export interface SalesResponse {
    items: Sale[];
    total: number;
    page: number;
    perPage: number;
}
export declare class LavaClient {
    private readonly client;
    private readonly apiKey;
    private readonly logger;
    constructor(config: LavaClientConfig);
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
    createInvoice(email: string, offerId: string, currency: Currency, periodicity?: Periodicity, paymentMethod?: PaymentMethod, buyerLanguage?: Language, utmSource?: string, utmMedium?: string, utmCampaign?: string, utmTerm?: string, utmContent?: string): Promise<InvoiceResponse>;
    /**
     * Получение информации о контракте по ID
     * @param id Идентификатор контракта
     */
    getInvoices(id: string): Promise<InvoiceResponse>;
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
    createOneTimePayment(email: string, offerId: string, currency: Currency, paymentMethod?: PaymentMethod, buyerLanguage?: Language, utmSource?: string, utmMedium?: string, utmCampaign?: string, utmTerm?: string, utmContent?: string): Promise<InvoiceResponse>;
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
    createSubscription(email: string, offerId: string, currency: Currency, periodicity: Exclude<Periodicity, Periodicity.ONE_TIME>, paymentMethod?: PaymentMethod, buyerLanguage?: Language, utmSource?: string, utmMedium?: string, utmCampaign?: string, utmTerm?: string, utmContent?: string): Promise<InvoiceResponse>;
    protected get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T>;
    protected post<T>(endpoint: string, data?: Record<string, unknown>): Promise<T>;
    /**
     * Получение списка продуктов
     * @param beforeCreatedAt Фильтр по дате создания (ISO string)
     * @param contentCategories Тип контента (POST, PRODUCT)
     * @param productTypes Тип продукта (COURSE, DIGITAL_PRODUCT, BOOK, GUIDE, SUBSCRIPTION, AUDIO, MODS, CONSULTATION)
     * @param feedVisibility Видимость в ленте (ALL, ONLY_VISIBLE, ONLY_HIDDEN)
     * @param showAllSubscriptionPeriods Показывать все периоды подписки
     * @returns Список продуктов и постов
     */
    getProducts(beforeCreatedAt?: string, contentCategories?: FeedItemType, productTypes?: ProductType, feedVisibility?: FeedVisibility, showAllSubscriptionPeriods?: boolean): Promise<ProductsResponse>;
    /**
     * Получение продукта по ID
     * @param id Идентификатор продукта
     */
    getProduct(id: string): Promise<Product>;
    /**
     * Получение URL для донатов
     */
    getDonations(): Promise<DonationResponse>;
    /**
     * Получение списка продаж
     * @param page Номер страницы (начиная с 1)
     * @param perPage Количество элементов на странице
     */
    getSales(page?: number, perPage?: number): Promise<SalesResponse>;
    /**
     * Получение списка продаж по конкретному продукту
     * @param productId ID продукта
     * @param page Номер страницы (начиная с 1)
     * @param perPage Количество элементов на странице
     */
    getSalesByProductId(productId: string, page?: number, perPage?: number): Promise<SalesResponse>;
    verifyWebhookSignature(payload: Record<string, any>, signature: string, secretKey: string): boolean;
}
