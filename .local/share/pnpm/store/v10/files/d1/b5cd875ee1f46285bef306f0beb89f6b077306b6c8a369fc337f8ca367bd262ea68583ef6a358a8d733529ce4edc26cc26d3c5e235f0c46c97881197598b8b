"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookHandler = void 0;
const types_1 = require("./types");
const logger_1 = require("./logger");
class WebhookHandler {
    constructor(config) {
        if (typeof config === 'string') {
            this.secretKey = config;
            this.logger = new logger_1.Logger();
        }
        else {
            this.secretKey = config.secretKey;
            this.logger = config.logger || new logger_1.Logger();
            this.onSubscriptionCancelled = config.onSubscriptionCancelled;
            this.onPaymentSuccess = config.onPaymentSuccess;
            this.onPaymentFailed = config.onPaymentFailed;
            this.onSubscriptionRecurringPaymentSuccess = config.onSubscriptionRecurringPaymentSuccess;
            this.onSubscriptionRecurringPaymentFailed = config.onSubscriptionRecurringPaymentFailed;
        }
    }
    /**
     * Устанавливает уровень логирования
     * @param level Уровень логирования (DEBUG, INFO, WARN, ERROR)
     */
    setLogLevel(level) {
        this.logger.setLevel(level);
    }
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
    handleWebhook(signature, body) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.logger.debug('Received webhook request', {
                    signatureLength: signature.length,
                    bodyLength: body.length
                });
                // Проверяем подпись
                if (this.secretKey !== signature) {
                    this.logger.warn('Invalid webhook signature');
                    return;
                }
                // Парсим тело запроса
                const data = JSON.parse(body);
                this.logger.debug('Parsed webhook data', { eventType: data.eventType });
                // Обрабатываем различные типы событий
                switch (data.eventType) {
                    case 'subscription.cancelled':
                        this.logger.debug('Processing subscription cancellation event');
                        if (this.onSubscriptionCancelled) {
                            try {
                                yield this.onSubscriptionCancelled(data);
                                this.logger.debug('Subscription cancellation callback completed successfully');
                            }
                            catch (error) {
                                this.logger.error('Error in subscription cancellation callback', { error });
                            }
                        }
                        return;
                    case 'payment.success':
                        this.logger.debug('Processing payment success event');
                        if (this.onPaymentSuccess) {
                            try {
                                yield this.onPaymentSuccess(data);
                                this.logger.debug('Payment success callback completed successfully');
                            }
                            catch (error) {
                                this.logger.error('Error in payment success callback', { error });
                            }
                        }
                        return;
                    case 'payment.failed':
                        this.logger.debug('Processing payment failed event');
                        if (this.onPaymentFailed) {
                            try {
                                yield this.onPaymentFailed(data);
                                this.logger.debug('Payment failed callback completed successfully');
                            }
                            catch (error) {
                                this.logger.error('Error in payment failed callback', { error });
                            }
                        }
                        return;
                    case 'subscription.recurring.payment.success':
                        this.logger.debug('Processing subscription recurring payment success event');
                        if (this.onSubscriptionRecurringPaymentSuccess) {
                            try {
                                yield this.onSubscriptionRecurringPaymentSuccess(data);
                                this.logger.debug('Subscription recurring payment success callback completed successfully');
                            }
                            catch (error) {
                                this.logger.error('Error in subscription recurring payment success callback', { error });
                            }
                        }
                        return;
                    case 'subscription.recurring.payment.failed':
                        this.logger.debug('Processing subscription recurring payment failed event');
                        if (this.onSubscriptionRecurringPaymentFailed) {
                            try {
                                yield this.onSubscriptionRecurringPaymentFailed(data);
                                this.logger.debug('Subscription recurring payment failed callback completed successfully');
                            }
                            catch (error) {
                                this.logger.error('Error in subscription recurring payment failed callback', { error });
                            }
                        }
                        return;
                    default:
                        this.logger.warn('Unknown webhook event type', { eventType: data.eventType });
                        return;
                }
            }
            catch (error) {
                this.logger.error('Error handling webhook', { error });
                throw error;
            }
        });
    }
    /**
     * Проверяет, является ли статус успешным
     * @param status Статус платежа
     */
    isSuccessStatus(status) {
        return status === types_1.InvoiceStatus.COMPLETED;
    }
    /**
     * Проверяет, является ли статус ошибочным
     * @param status Статус платежа
     */
    isErrorStatus(status) {
        return status === types_1.InvoiceStatus.FAILED;
    }
}
exports.WebhookHandler = WebhookHandler;
