export declare enum Currency {
    RUB = "RUB",
    USD = "USD",
    EUR = "EUR"
}
export declare enum PaymentMethod {
    BANK131 = "BANK131",
    UNLIMINT = "UNLIMINT",
    PAYPAL = "PAYPAL",
    STRIPE = "STRIPE"
}
export declare enum Periodicity {
    ONE_TIME = "ONE_TIME",
    MONTHLY = "MONTHLY",
    PERIOD_90_DAYS = "PERIOD_90_DAYS",
    PERIOD_180_DAYS = "PERIOD_180_DAYS",
    PERIOD_YEAR = "PERIOD_YEAR"
}
export declare enum InvoiceType {
    ONE_TIME = "ONE_TIME",
    RECURRING = "RECURRING"
}
export declare enum InvoiceStatus {
    NEW = "NEW",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}
export declare enum SubscriptionStatus {
    ACTIVE = "ACTIVE",
    CANCELLED = "CANCELLED",
    FAILED = "FAILED"
}
export declare enum Language {
    EN = "EN",
    RU = "RU",
    ES = "ES"
}
export declare enum FeedItemType {
    POST = "POST",
    PRODUCT = "PRODUCT"
}
export declare enum ProductType {
    COURSE = "COURSE",
    DIGITAL_PRODUCT = "DIGITAL_PRODUCT",
    BOOK = "BOOK",
    GUIDE = "GUIDE",
    SUBSCRIPTION = "SUBSCRIPTION",
    AUDIO = "AUDIO",
    MODS = "MODS",
    CONSULTATION = "CONSULTATION"
}
export declare enum FeedVisibility {
    ALL = "ALL",
    ONLY_VISIBLE = "ONLY_VISIBLE",
    ONLY_HIDDEN = "ONLY_HIDDEN"
}
export interface ClientUtm {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
}
export interface InvoiceRequestDto {
    email: string;
    offerId: string;
    currency: Currency;
    periodicity?: Periodicity;
    paymentMethod?: PaymentMethod;
    buyerLanguage?: Language;
    clientUtm?: ClientUtm;
}
export interface ErrorResponse {
    error: string;
    details?: Record<string, string>;
    timestamp: string;
}
export interface SubscriptionDetails {
    expiredAt?: string;
    terminatedAt?: string;
    cancelledAt?: string;
}
export interface ReceiptResponse {
    amount: number;
    currency: Currency;
    fee: number;
}
export interface BuyerResponse {
    email: string;
    cardMask?: string;
}
export interface ProductResponse {
    name: string;
    offer: string;
}
export interface ParentInvoiceResponse {
    id: string;
}
export interface InvoiceResponse {
    id: string;
    type: InvoiceType;
    datetime: string;
    status: InvoiceStatus;
    receipt: {
        amount: number;
        currency: string;
        fee: number;
    };
    buyer: {
        email: string;
    };
    product: {
        name: string;
        offer: string;
    };
    subscriptionStatus?: SubscriptionStatus;
    subscriptionDetails?: {
        expiredAt: string;
    };
    paymentUrl?: string;
}
export interface GetProductsParams {
    beforeCreatedAt?: string;
    contentCategories?: FeedItemType;
    productTypes?: ProductType;
    feedVisibility?: FeedVisibility;
    showAllSubscriptionPeriods?: boolean;
}
export interface PriceDto {
    amount: number;
    currency: Currency;
    periodicity?: Periodicity;
}
export interface OfferResponse {
    id: string;
    name?: string;
    description?: string;
    prices: PriceDto[];
    recurrent?: string;
}
export interface ProductItemResponse {
    id: string;
    title?: string;
    description?: string;
    type: ProductType;
    offers?: OfferResponse[];
}
export interface PostItemResponse {
    id: string;
    title: string;
    description?: string;
    body: string;
    type: string;
    createdAt: string;
    updatedAt: string;
    publishedAt: string;
}
export interface ProductsResponse {
    items: Array<{
        type: FeedItemType;
        data: ProductItemResponse | PostItemResponse;
    }>;
    nextPage?: string;
}
export interface BaseEventData {
    eventType: string;
    contractId: string;
    product: {
        id: string;
        title: string;
    };
    buyer: {
        email: string;
    };
}
export interface BasePaymentData extends BaseEventData {
    amount: number;
    currency: Currency;
    timestamp: string;
    status: string;
    errorMessage?: string;
}
export interface SubscriptionCancellationData extends BaseEventData {
    eventType: 'subscription.cancelled';
    cancelledAt: string;
    willExpireAt: string;
}
export interface PaymentSuccessData extends BasePaymentData {
    eventType: 'payment.success';
}
export interface PaymentFailedData extends BasePaymentData {
    eventType: 'payment.failed';
}
export interface SubscriptionRecurringPaymentSuccessData extends BasePaymentData {
    eventType: 'subscription.recurring.payment.success';
    parentContractId: string;
}
export interface SubscriptionRecurringPaymentFailedData extends BasePaymentData {
    eventType: 'subscription.recurring.payment.failed';
}
