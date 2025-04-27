// Import from local module file
import { formatWithPrefix, createFormatter } from "./utils.js";

/**
 * A sample utility function
 * @param {string} text - The text to log
 * @returns {string} - The capitalized text
 */
export function capitalizeText(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Another sample function
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} - The sum of the two numbers
 */
export function addNumbers(a, b) {
  return a + b;
}

// Re-export functions from utils
export { formatWithPrefix, createFormatter };

// Default export
export default {
  capitalizeText,
  addNumbers,
  formatWithPrefix,
  createFormatter,
};
