const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.isProduction = process.env.NODE_ENV === 'production';
    this.logLevel = process.env.LOG_LEVEL || (this.isProduction ? 'error' : 'info');
    
    // Niveaux de log (du plus bas au plus haut)
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    this.currentLevel = this.levels[this.logLevel] || 1;
  }

  shouldLog(level) {
    return this.levels[level] >= this.currentLevel;
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data, null, 2)}`;
    }
    return `${prefix} ${message}`;
  }

  debug(message, data = null) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  info(message, data = null) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  warn(message, data = null) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  error(message, error = null) {
    if (this.shouldLog('error')) {
      const errorInfo = error ? {
        message: error.message,
        stack: error.stack,
        ...error
      } : null;
      console.error(this.formatMessage('error', message, errorInfo));
    }
  }

  // Méthodes spécialisées pour les différents contextes
  db(message, data = null) {
    this.debug(`[DB] ${message}`, data);
  }

  api(message, data = null) {
    this.info(`[API] ${message}`, data);
  }

  performance(message, data = null) {
    this.info(`[PERF] ${message}`, data);
  }

  security(message, data = null) {
    this.warn(`[SEC] ${message}`, data);
  }
}

// Instance singleton
const logger = new Logger();

module.exports = logger; 