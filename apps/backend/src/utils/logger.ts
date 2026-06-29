export enum LogLevel {
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR",
    DEBUG = "DEBUG"
}

export const logger = {
    info: (message: string, context?: any) => log(LogLevel.INFO, message, context),
    warn: (message: string, context?: any) => log(LogLevel.WARN, message, context),
    error: (message: string, context?: any) => log(LogLevel.ERROR, message, context),
    debug: (message: string, context?: any) => log(LogLevel.DEBUG, message, context),
};

const log = (level: LogLevel, message: string, context?: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...(context ? { context } : {})
    };
    
    // In production, you might send this to a logging service
    console.log(JSON.stringify(logEntry));
};
