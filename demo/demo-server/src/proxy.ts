const redbird = require("@jchip/redbird")
const Url = require("node:url");
const Path = require("node:path");
const ck = require("chalker");


/**
 * Interface representing the source part of a proxy rule
 * @interface ProxyRuleSource
 */
interface ProxyRuleSource {
  /** The path pattern to match */
  path: string;
  /** Additional properties that can be included in the source */
  [key: string]: any;
}

/**
 * Interface representing the target part of a proxy rule
 * @interface ProxyRuleTarget
 */
interface ProxyRuleTarget {
  /** The protocol to use (http, https, file) */
  protocol?: string;
  /** The port number for the target (optional for file protocol) */
  port?: number;
  /** The path for the target (used with file protocol) */
  path?: string;
  /** Additional properties that can be included in the target */
  [key: string]: any;
}

/**
 * Type representing a complete proxy rule
 * @typedef {[ProxyRuleSource, ProxyRuleTarget, any?]} ProxyRule
 */
type ProxyRule = [ProxyRuleSource, ProxyRuleTarget, any?];

/**
 * Interface representing the configuration options for the proxy server
 * @interface ProxyOptions
 */
interface ProxyOptions {
  /** The HTTP port to listen on */
  port: number;
  /** The hostname to bind to */
  host: string;
  /** Whether to enable HTTPS */
  secure: boolean;
  /** SSL configuration */
  ssl: {
    /** The HTTPS port to listen on */
    port: number;
    /** Path to the SSL key file */
    key: string;
    /** Path to the SSL certificate file */
    cert: string;
  };
  /** Logging configuration */
  pino: {
    /** The logging level */
    level: string;
  };
}

/**
 * Interface representing options for URL formatting
 * @interface UrlOptions
 */
interface UrlOptions {
  /** The protocol to use (default: "http") */
  protocol?: string;
  /** The hostname (default: "") */
  host?: string;
  /** The port number (default: 0) */
  port?: number;
  /** The path (default: "") */
  path?: string;
  /** The query string (default: "") */
  search?: string;
}

/**
 * Formats a URL string from URL options
 * @function formUrl
 * @param {UrlOptions} options - The URL options
 * @param {string} [options.protocol="http"] - The protocol to use
 * @param {string} [options.host=""] - The hostname
 * @param {number} [options.port=0] - The port number
 * @param {string} [options.path=""] - The path
 * @param {string} [options.search=""] - The query string
 * @returns {string} The formatted URL string
 */
export const formUrl = ({
  protocol = "http",
  host = "",
  port = 0,
  path = "",
  search = "",
}: UrlOptions): string => {
  const proto = protocol.toString().toLowerCase();
  const sp = String(port);
  const host2 =
    host && port && !(sp === "80" && proto === "http") && !(sp === "443" && proto === "https")
      ? `${host}:${port}`
      : host;

  return Url.format({ protocol: proto, host: host2, pathname: path, search });
};

/**
 * Gets a port number from an environment variable
 * @function getEnvPort
 * @param {string} key - The environment variable key
 * @param {number} [defaultVal=3000] - The default port value if the environment variable is not set or invalid
 * @returns {number} The port number from the environment variable or the default value
 */
function getEnvPort(key: string, defaultVal = 3000): number {
  if (process.env[key]) {
    const v = parseInt(process.env[key]);
    if (Number.isInteger(v) && v >= 0) {
      return v;
    }
  }

  return defaultVal;
}

/**
 * Starts a development proxy server with the specified rules
 * @function startDevProxy
 * @param {ProxyRule[]} rules - Array of proxy rules to configure
 * @returns {void}
 *
 * @example
 * ```typescript
 * startDevProxy([
 *   [{ path: "/" }, { protocol: "file", path: "./public" }],
 *   [{ path: "/api" }, { protocol: "http", port: 3000 }]
 * ]);
 * ```
 */
export function startDevProxy(rules: ProxyRule[]): void {
  const host = "localhost";
  const httpPort = getEnvPort("PORT");
  const httpsPort = getEnvPort("HTTPS_PORT", 3443);

  const proxyOptions: ProxyOptions = {
    port: httpPort,
    host,
    secure: true,
    ssl: {
      port: httpsPort,
      key: Path.join(__dirname, "../certs/dev.key"), // SSL cert key
      cert: Path.join(__dirname, "../certs/dev.cer"), // SSL cert
    },
    pino: {
      level: "warn",
    },
  };

  const proxy = redbird(proxyOptions);

  /**
   * Registers proxy rules for a specific protocol and port
   * @function registerRules
   * @param {ProxyRule[]} rules - The rules to register
   * @param {string} protocol - The protocol to use
   * @param {number} port - The port to use
   * @returns {void}
   */
  const registerRules = (rules: ProxyRule[], protocol: string, port: number): void => {
    const forwards = rules.map(([src, target, opts]) => {
      // Create a new object without protocol to avoid overwriting
      const sourceUrl = formUrl({ host, protocol, port, ...src });
      const targetUrl = formUrl({ host, protocol, port, path: src.path, ...target });
      return { sourceUrl, targetUrl, opts };
    });

    forwards.forEach(({ sourceUrl, targetUrl, opts }) => {
      proxy.register(sourceUrl, targetUrl, opts || {});
    });
  };

  registerRules(rules, "http", httpPort);

  const httpsUrl = formUrl({ host, protocol: "https", port: httpsPort });
  const httpUrl = formUrl({ host, protocol: "http", port: httpPort });

  console.log("proxy running, listening at:");
  console.log(ck` - HTTPS - <cyan>${httpsUrl}</cyan>`);
  console.log(ck` - HTTP  - <cyan>${httpUrl}</cyan>`);
}

