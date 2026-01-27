import { WebhookHandler } from './webhook';
import { Logger } from './logger';
export declare class WebhookServer {
    private readonly webhookHandler;
    private readonly logger;
    private server;
    constructor(webhookHandler: WebhookHandler, port?: number, logger?: Logger);
    private handleRequest;
    stop(): void;
}
