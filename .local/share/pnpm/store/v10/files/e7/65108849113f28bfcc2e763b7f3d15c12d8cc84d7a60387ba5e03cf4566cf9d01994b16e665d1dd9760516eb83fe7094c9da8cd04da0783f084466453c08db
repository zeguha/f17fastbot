export declare enum LogLevel {
    DEBUG = "DEBUG",
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR"
}
export interface LoggerConfig {
    level?: LogLevel;
    format?: 'json' | 'text';
    prefix?: string;
}
export declare class Logger {
    private level;
    private format;
    private prefix;
    constructor(config?: LoggerConfig);
    /**
     * Устанавливает уровень логирования
     * @param level Новый уровень логирования
     */
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
    private shouldLog;
    private formatMessage;
    debug(message: string, data?: any): void;
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, data?: any): void;
}
