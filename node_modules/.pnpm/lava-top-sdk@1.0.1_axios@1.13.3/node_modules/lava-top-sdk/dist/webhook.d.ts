import { InvoiceStatus, SubscriptionCancellationData, PaymentSuccessData, PaymentFailedData, SubscriptionRecurringPaymentSuccessData, SubscriptionRecurringPaymentFailedData } from './types';
import { Logger, LogLevel } from './logger';
export interface WebhookConfig {
    secretKey: string;
    logger?: Logger;
    onSubscriptionCancelled?: (data: SubscriptionCancellationData) => void | Promise<void>;
    onPaymentSuccess?: (data: PaymentSuccessData) => void | Promise<void>;
    onPaymentFailed?: (data: PaymentFailedData) => void | Promise<void>;
    onSubscriptionRecurringPaymentSuccess?: (data: SubscriptionRecurringPaymentSuccessData) => void | Promise<void>;
    onSubscriptionRecurringPaymentFailed?: (data: SubscriptionRecurringPaymentFailedData) => void | Promise<void>;
}
export declare class WebhookHandler {
    readonly logger: Logger;
    private readonly secretKey;
    private readonly onSubscriptionCancelled?;
    private readonly onPaymentSuccess?;
    private readonly onPaymentFailed?;
    private readonly onSubscriptionRecurringPaymentSuccess?;
    private readonly onSubscriptionRecurringPaymentFailed?;
    constructor(config: WebhookConfig | string);
    /**
     * Устанавливает уровень логирования
     * @param level Уровень логирования (DEBUG, INFO, WARN, ERROR)
     */
    setLogLevel(level: LogLevel): void;
    /**
     * Проверяет подпись webhook'а
     * @param signature Подпись
     * @param body Тело запроса
     * @returns true если подпись верна
     */
    /**
     * Обрабатывает webhook от платежной системы
     * @param signature Подпись
     * @param body Тело запроса
     */
    handleWebhook(signature: string, body: string): Promise<void>;
    /**
     * Проверяет, является ли статус успешным
     * @param status Статус платежа
     */
    isSuccessStatus(status: InvoiceStatus): boolean;
    /**
     * Проверяет, является ли статус ошибочным
     * @param status Статус платежа
     */
    isErrorStatus(status: InvoiceStatus): boolean;
}
