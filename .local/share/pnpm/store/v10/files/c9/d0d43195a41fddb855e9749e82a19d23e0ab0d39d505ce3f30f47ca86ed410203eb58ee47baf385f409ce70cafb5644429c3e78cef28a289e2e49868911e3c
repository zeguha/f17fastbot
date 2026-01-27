"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(config = {}) {
        this.level = config.level || LogLevel.WARN;
        this.format = config.format || 'text';
        this.prefix = config.prefix || '[LavaClient]';
    }
    /**
     * Устанавливает уровень логирования
     * @param level Новый уровень логирования
     */
    setLevel(level) {
        this.level = level;
    }
    getLevel() {
        return this.level;
    }
    shouldLog(level) {
        const levels = Object.values(LogLevel);
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }
    formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        const logData = Object.assign({ timestamp,
            level, prefix: this.prefix, message }, data);
        if (this.format === 'json') {
            return JSON.stringify(logData);
        }
        return `${timestamp} ${level} ${this.prefix} ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
    }
    debug(message, data) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.debug(this.formatMessage(LogLevel.DEBUG, message, data));
        }
    }
    info(message, data) {
        if (this.shouldLog(LogLevel.INFO)) {
            console.info(this.formatMessage(LogLevel.INFO, message, data));
        }
    }
    warn(message, data) {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.formatMessage(LogLevel.WARN, message, data));
        }
    }
    error(message, data) {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(this.formatMessage(LogLevel.ERROR, message, data));
        }
    }
}
exports.Logger = Logger;
