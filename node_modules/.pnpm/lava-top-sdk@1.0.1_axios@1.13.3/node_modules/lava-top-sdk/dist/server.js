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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookServer = void 0;
const http_1 = require("http");
class WebhookServer {
    constructor(webhookHandler, port = 3000, logger) {
        this.webhookHandler = webhookHandler;
        this.logger = this.webhookHandler.logger;
        // Создаем HTTP сервер
        this.server = (0, http_1.createServer)(this.handleRequest.bind(this));
        // Запускаем сервер
        this.server.listen(port, () => {
            this.logger.info(`Webhook server listening on port ${port}`);
        });
    }
    handleRequest(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, req_1, req_1_1;
            var _b, e_1, _c, _d;
            // Проверяем метод и путь
            if (req.method !== 'POST' || req.url !== '/webhook') {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not found' }));
                return;
            }
            this.logger.debug("handleWebhook", {
                method: req.method,
                path: req.url,
                headers: req.headers
            });
            try {
                const signature = req.headers['x-api-key'];
                if (!signature) {
                    this.logger.warn('Missing signature header');
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing signature header' }));
                    return;
                }
                // Читаем тело запроса
                const chunks = [];
                try {
                    for (_a = true, req_1 = __asyncValues(req); req_1_1 = yield req_1.next(), _b = req_1_1.done, !_b; _a = true) {
                        _d = req_1_1.value;
                        _a = false;
                        const chunk = _d;
                        chunks.push(chunk);
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_a && !_b && (_c = req_1.return)) yield _c.call(req_1);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
                const body = Buffer.concat(chunks).toString();
                yield this.webhookHandler.handleWebhook(signature, body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            }
            catch (error) {
                this.logger.error('Error processing webhook', { error });
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
    }
    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}
exports.WebhookServer = WebhookServer;
