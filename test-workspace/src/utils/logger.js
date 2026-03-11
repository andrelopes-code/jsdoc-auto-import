/**
 * @typedef {Object} LogEntry
 * @property {'info' | 'warn' | 'error' | 'debug'} level
 * @property {string} message
 * @property {Date} timestamp
 * @property {Record<string, unknown>} [context]
 */

/**
 * @typedef {Object} FormatOptions
 * @property {string} dateFormat
 * @property {boolean} includeContext
 * @property {boolean} colorize
 */

/**
 * @param {string} message
 * @param {Record<string, unknown>} [context]
 * @returns {LogEntry}
 */
export function createLogEntry(message, context) {
    return {
        level: 'info',
        message,
        timestamp: new Date(),
        context,
    };
}

/**
 * @param {LogEntry} entry
 * @param {FormatOptions} [options]
 * @returns {string}
 */
export function formatLog(entry, options) {
    const ts = options?.dateFormat
        ? entry.timestamp.toISOString()
        : entry.timestamp.toLocaleString();
    return `[${ts}] [${entry.level.toUpperCase()}] ${entry.message}`;
}
