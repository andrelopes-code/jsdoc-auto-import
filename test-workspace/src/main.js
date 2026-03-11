// @ts-check

/**
 * @import { ApiError } from './types/api'
 */

// TEST SCENARIO 1: Quick Fix for missing types
// Place cursor on any @type line and press Cmd+. / Ctrl+.

/** @type {import('@types/user').User} */
const currentUser = getUser();

/** @type {import('@models').ApiError} */
const foos = {};

/** @type {ProductCategory} */
const featuredProduct = getProduct();

/**
 * @param {User} user
 * @param {CartItem} cart
 * @returns {Order}
 */
function createOrder(user, cart) {
    return {
        id: '1',
        userId: user.id,
        items: [],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

// TEST SCENARIO 2: Inline import conversion
// Place cursor here and press Cmd+. / Ctrl+.
/** @type {ApiResponse} */
const response = fetch('/api/data');

// TEST SCENARIO 3: Auto-complete inside JSDoc
// Type inside the braces and press Ctrl+Space
/** @type {} */
let validator;

// TEST SCENARIO 4: Multiple types on one line
/** @type {ApiResponse<Product>} */
const productResponse = null;

/**
 * @param {RequestConfig} config
 * @param {ValidatorConfig} validatorConfig
 */
function setupApi(config, validatorConfig) {}

function getUser() {
    return /** @type {any} */ (null);
}
function getProduct() {
    return /** @type {any} */ (null);
}
