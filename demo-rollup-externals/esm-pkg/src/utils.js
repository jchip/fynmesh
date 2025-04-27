/**
 * Formats text with a prefix
 * @param {string} text - The text to format
 * @param {string} prefix - The prefix to add
 * @returns {string} - The formatted text
 */
export function formatWithPrefix(text, prefix = ">> ") {
  return `${prefix}${text}`;
}

/**
 * Creates a message formatter with a specific prefix
 * @param {string} prefix - The prefix to use
 * @returns {Function} - A formatter function
 */
export function createFormatter(prefix) {
  return (text) => formatWithPrefix(text, prefix);
}

// Named exports only
