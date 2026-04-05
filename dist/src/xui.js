"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.xuiClient = void 0;
// src/xui.ts
const axios_1 = __importDefault(require("axios"));
const config_1 = require("./config");
class XUIClient {
    constructor() {
        this.sessionCookie = '';
        // Нормализуем, чтобы не получить двойной слэш в запросах: `${baseURL}/login`.
        this.baseURL = (config_1.config.xui.url || '').replace(/\/+$/, '');
        this.username = config_1.config.xui.login;
        this.password = config_1.config.xui.password;
    }
    async login() {
        try {
            // В x-ui логин обычно ожидает application/x-www-form-urlencoded
            const form = new URLSearchParams();
            form.set('username', this.username);
            form.set('password', this.password);
            const response = await axios_1.default.post(`${this.baseURL}/login`, form.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
                timeout: 10000,
            });
            const setCookie = response.headers['set-cookie'];
            if (!setCookie) {
                throw new Error('Не удалось получить cookie');
            }
            this.sessionCookie = setCookie.map((c) => c.split(';')[0]).join('; ');
        }
        catch (error) {
            console.error('Ошибка авторизации X-UI:', error.message);
            throw new Error(`Ошибка авторизации: ${error.message}`);
        }
    }
    async ensureAuth() {
        if (!this.sessionCookie) {
            await this.login();
        }
    }
    async createClient(inboundId, clientData) {
        await this.ensureAuth();
        try {
            const response = await axios_1.default.post(`${this.baseURL}/panel/api/inbounds/addClient`, {
                id: inboundId,
                settings: JSON.stringify({ clients: [clientData] })
            }, {
                headers: {
                    'Cookie': this.sessionCookie,
                    'Content-Type': 'application/json'
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
                timeout: 10000
            });
            return response.data || { success: false, msg: 'Пустой ответ', obj: null };
        }
        catch (error) {
            console.error('Ошибка создания клиента X-UI:', error.message);
            return {
                success: false,
                msg: error.response?.data?.msg || error.message || 'Ошибка сети',
                obj: null
            };
        }
    }
    async getInbound(inboundId) {
        await this.ensureAuth();
        try {
            const response = await axios_1.default.get(`${this.baseURL}/panel/api/inbounds/get/${inboundId}`, {
                headers: {
                    'Cookie': this.sessionCookie,
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
                timeout: 10000,
            });
            return response.data || { success: false, msg: 'Пустой ответ', obj: null };
        }
        catch (error) {
            console.error('Ошибка получения inbound X-UI:', error.message);
            return {
                success: false,
                msg: error.response?.data?.msg || error.message || 'Ошибка сети',
                obj: null,
            };
        }
    }
    async deleteClient(inboundId, clientId, email) {
        await this.ensureAuth();
        try {
            const response = await axios_1.default.post(`${this.baseURL}/panel/api/inbounds/delClient`, {
                id: inboundId,
                settings: JSON.stringify({
                    clients: [{
                            id: clientId,
                            email: email
                        }]
                })
            }, {
                headers: {
                    'Cookie': this.sessionCookie,
                    'Content-Type': 'application/json'
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
                timeout: 10000
            });
            return response.data || { success: false, msg: 'Пустой ответ', obj: null };
        }
        catch (error) {
            // В некоторых форках/версиях x-ui endpoint delClient отсутствует (404).
            // Тогда используем безопасный fallback через get+update inbound.settings.clients.
            const status = error?.response?.status;
            if (status === 404) {
                return await this.deleteClientAlternative(inboundId, { clientId, email });
            }
            console.error('Ошибка удаления клиента X-UI:', error.message);
            return {
                success: false,
                msg: error.response?.data?.msg || error.message || 'Ошибка сети',
                obj: null
            };
        }
    }
    async deleteClientAlternative(inboundId, criteria) {
        await this.ensureAuth();
        try {
            // В разных версиях x-ui методы могут отличаться:
            // - GET /panel/api/inbounds/get/{id}
            // - POST /panel/api/inbounds/get (часто 404)
            const httpsAgent = new (require('https').Agent)({ rejectUnauthorized: false });
            const response = await axios_1.default.get(`${this.baseURL}/panel/api/inbounds/get/${inboundId}`, {
                headers: {
                    'Cookie': this.sessionCookie,
                },
                httpsAgent,
                timeout: 10000
            });
            if (!response.data || response.data.success !== true) {
                return {
                    success: false,
                    msg: response.data?.msg || 'Не удалось получить инбаунд',
                    obj: response.data || null,
                };
            }
            const inbound = response.data.obj;
            let clients = [];
            let settingsObj;
            try {
                settingsObj = JSON.parse(inbound.settings);
                clients = settingsObj.clients || [];
            }
            catch {
                return { success: false, msg: 'Ошибка парсинга настроек', obj: null };
            }
            // Ищем клиента по id/email/subId/tgId. Важно: если не нашли — НЕ делаем update,
            // иначе можно случайно перезаписать настройки инбаунда.
            const matched = clients.filter((client) => {
                const byId = criteria.clientId && client?.id === criteria.clientId;
                const byEmail = criteria.email && client?.email === criteria.email;
                const bySubId = criteria.subId && client?.subId === criteria.subId;
                const byTgId = criteria.tgId &&
                    (String(client?.tgId) === String(criteria.tgId) ||
                        String(client?.tgId) === String(Number(criteria.tgId)));
                return Boolean(byId || byEmail || bySubId || byTgId);
            });
            if (matched.length === 0) {
                return {
                    success: false,
                    msg: 'Клиент не найден в inbound.settings.clients — отмена удаления',
                    obj: { criteria, clientsCount: clients.length },
                };
            }
            const filteredClients = clients.filter((client) => {
                const byId = criteria.clientId && client?.id === criteria.clientId;
                const byEmail = criteria.email && client?.email === criteria.email;
                const bySubId = criteria.subId && client?.subId === criteria.subId;
                const byTgId = criteria.tgId &&
                    (String(client?.tgId) === String(criteria.tgId) ||
                        String(client?.tgId) === String(Number(criteria.tgId)));
                return !(byId || byEmail || bySubId || byTgId);
            });
            settingsObj.clients = filteredClients;
            // X-UI часто требует, чтобы update получил те же поля, что были у инбаунда.
            // Поэтому формируем payload на основе текущего inbound, меняя только settings.
            const updateData = {
                id: inboundId,
                settings: JSON.stringify(settingsObj),
            };
            const copyKeys = [
                'remark',
                'port',
                'protocol',
                'enable',
                'expiryTime',
                'listen',
                'tag',
                'total',
                'up',
                'down',
                'streamSettings',
                'sniffing',
            ];
            for (const k of copyKeys) {
                if (inbound && Object.prototype.hasOwnProperty.call(inbound, k)) {
                    updateData[k] = inbound[k];
                }
            }
            const updateResponse = await axios_1.default.post(`${this.baseURL}/panel/api/inbounds/update/${inboundId}`, updateData, {
                headers: {
                    'Cookie': this.sessionCookie,
                    'Content-Type': 'application/json'
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
                timeout: 10000
            });
            return updateResponse.data || { success: false, msg: 'Пустой ответ', obj: null };
        }
        catch (error) {
            console.error('Ошибка альтернативного удаления X-UI:', error.message);
            return {
                success: false,
                msg: error.response?.data?.msg || error.message || 'Ошибка сети',
                obj: null
            };
        }
    }
}
exports.xuiClient = new XUIClient();
