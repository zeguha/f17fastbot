"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.xuiClient = void 0;
// xui.ts
const axios_1 = __importDefault(require("axios"));
const config_1 = require("./config");
class XUIClient {
    constructor() {
        this.sessionCookie = '';
        this.axios = axios_1.default.create({
            baseURL: config_1.config.xui.url,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
    async login() {
        try {
            const response = await this.axios.post('/login', {
                username: config_1.config.xui.login,
                password: config_1.config.xui.password
            });
            const setCookie = response.headers['set-cookie'];
            if (!setCookie || setCookie.length === 0) {
                throw new Error('Не удалось получить cookie от XUI');
            }
            this.sessionCookie = setCookie.map((c) => c.split(';')[0]).join('; ');
        }
        catch (error) {
            console.error('Login error:', error.message);
            throw new Error(`Ошибка авторизации в X-UI: ${error.message}`);
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
            const response = await this.axios.post('/panel/api/inbounds/addClient', {
                id: inboundId,
                settings: JSON.stringify({ clients: [clientData] })
            }, {
                headers: {
                    Cookie: this.sessionCookie
                }
            });
            return response.data || { success: false, msg: 'Пустой ответ', obj: null };
        }
        catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                await this.login();
                const retryResponse = await this.axios.post('/panel/api/inbounds/addClient', {
                    id: inboundId,
                    settings: JSON.stringify({ clients: [clientData] })
                }, {
                    headers: {
                        Cookie: this.sessionCookie
                    }
                });
                return retryResponse.data || { success: false, msg: 'Пустой ответ', obj: null };
            }
            console.error('Create client error:', error.message);
            return {
                success: false,
                msg: error.response?.data?.msg || error.message || String(error),
                obj: null
            };
        }
    }
    async deleteClient(inboundId, clientId, email) {
        await this.ensureAuth();
        try {
            // Метод 1: Используем стандартный API для удаления клиента
            const response = await this.axios.post('/panel/api/inbounds/delClient', {
                id: inboundId,
                settings: JSON.stringify({
                    clients: [{
                            id: clientId,
                            email: email
                        }]
                })
            }, {
                headers: {
                    Cookie: this.sessionCookie
                }
            });
            return response.data || { success: false, msg: 'Пустой ответ', obj: null };
        }
        catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                await this.login();
                const retryResponse = await this.axios.post('/panel/api/inbounds/delClient', {
                    id: inboundId,
                    settings: JSON.stringify({
                        clients: [{
                                id: clientId,
                                email: email
                            }]
                    })
                }, {
                    headers: {
                        Cookie: this.sessionCookie
                    }
                });
                return retryResponse.data || { success: false, msg: 'Пустой ответ', obj: null };
            }
            console.error('Delete client error (method 1):', error.message);
            return {
                success: false,
                msg: error.response?.data?.msg || error.message || String(error),
                obj: null
            };
        }
    }
    async deleteClientAlternative(inboundId, clientId) {
        await this.ensureAuth();
        try {
            // Метод 2: Альтернативный способ - получаем текущих клиентов, фильтруем и обновляем
            // Сначала получаем текущий инбаунд
            const getResponse = await this.axios.post('/panel/api/inbounds/get', {
                id: inboundId
            }, {
                headers: {
                    Cookie: this.sessionCookie
                }
            });
            if (!getResponse.data.success) {
                return { success: false, msg: 'Не удалось получить данные инбаунда', obj: null };
            }
            const inbound = getResponse.data.obj;
            let clients = [];
            try {
                const settings = JSON.parse(inbound.settings);
                clients = settings.clients || [];
            }
            catch (e) {
                return { success: false, msg: 'Ошибка парсинга настроек инбаунда', obj: null };
            }
            // Фильтруем клиентов, удаляя нужного
            const filteredClients = clients.filter((client) => client.id !== clientId);
            if (filteredClients.length === clients.length) {
                return { success: false, msg: 'Клиент не найден в списке', obj: null };
            }
            // Обновляем инбаунд
            const updateResponse = await this.axios.post('/panel/api/inbounds/update/' + inboundId, {
                settings: JSON.stringify({
                    ...JSON.parse(inbound.settings),
                    clients: filteredClients
                })
            }, {
                headers: {
                    Cookie: this.sessionCookie
                }
            });
            return updateResponse.data || { success: false, msg: 'Пустой ответ', obj: null };
        }
        catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                await this.login();
                // Повторяем попытку
                return this.deleteClientAlternative(inboundId, clientId);
            }
            console.error('Delete client error (method 2):', error.message);
            return {
                success: false,
                msg: error.response?.data?.msg || error.message || String(error),
                obj: null
            };
        }
    }
    async getClient(inboundId, clientId) {
        await this.ensureAuth();
        try {
            const response = await this.axios.post('/panel/api/inbounds/get', {
                id: inboundId
            }, {
                headers: {
                    Cookie: this.sessionCookie
                }
            });
            if (!response.data.success) {
                return { success: false, msg: 'Не удалось получить данные инбаунда', obj: null };
            }
            const inbound = response.data.obj;
            let clients = [];
            try {
                const settings = JSON.parse(inbound.settings);
                clients = settings.clients || [];
            }
            catch (e) {
                return { success: false, msg: 'Ошибка парсинга настроек инбаунда', obj: null };
            }
            const client = clients.find((c) => c.id === clientId);
            return {
                success: !!client,
                msg: client ? 'Клиент найден' : 'Клиент не найден',
                obj: client
            };
        }
        catch (error) {
            console.error('Get client error:', error.message);
            return {
                success: false,
                msg: error.message || String(error),
                obj: null
            };
        }
    }
}
exports.xuiClient = new XUIClient();
