/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors
 */

/**
 * @typedef {Object} ValidatorConfig
 * @property {boolean} strict
 * @property {number} maxLength
 * @property {RegExp} [pattern]
 */

/**
 * @param {string} value
 * @param {ValidatorConfig} config
 * @returns {ValidationResult}
 */
export function validate(value, config) {
    const errors = [];
    if (config.strict && !value.trim()) {
        errors.push('Value cannot be empty');
    }
    if (value.length > config.maxLength) {
        errors.push(`Value exceeds max length of ${config.maxLength}`);
    }
    if (config.pattern && !config.pattern.test(value)) {
        errors.push('Value does not match the required pattern');
    }
    return { valid: errors.length === 0, errors };
}
