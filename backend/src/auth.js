const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("./config");

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password.
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plaintext password with a hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Sign a JWT with user payload.
 * @param {{ id: string, email: string }} user
 * @returns {string}
 */
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {{ id: string, email: string }}
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken };
