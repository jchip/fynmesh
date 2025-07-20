// Service Worker Utilities for FynMesh Demo
// Provides debugging and management functions for the service worker

/**
 * Service Worker Manager - handles registration, updates, and debugging
 */
class ServiceWorkerManager {
  constructor(basePath = "") {
    this.registration = null;
    this.isSupported = "serviceWorker" in navigator;
    this.debug = true; // Set to false in production
    this.basePath = basePath;
  }

  /**
   * Initialize the service worker
   */
  async init() {
    if (!this.isSupported) {
      this.log("Service workers are not supported in this browser", "warn");
      this.updateStatusUI("unsupported");
      return false;
    }

    try {
      this.updateStatusUI("registering");
      this.registration = await this.registerServiceWorker();
      this.setupEventListeners();
      this.updateStatusUI("active");
      return true;
    } catch (error) {
      this.log("Service worker initialization failed:", "error", error);
      this.updateStatusUI("error");
      return false;
    }
  }

  /**
   * Register the service worker
   */
  async registerServiceWorker() {
    this.log("Registering service worker...");

    const swPath = `${this.basePath}/sw.js`;
    const swScope = this.basePath || "/";

    const registration = await navigator.serviceWorker.register(swPath, {
      scope: swScope,
    });

    this.log("Service worker registered successfully:", "info", registration);
    return registration;
  }

  /**
   * Set up event listeners for service worker updates and messages
   */
  setupEventListeners() {
    if (!this.registration) return;

    // Listen for updates
    this.registration.addEventListener("updatefound", () => {
      this.handleServiceWorkerUpdate();
    });

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener("message", (event) => {
      this.handleServiceWorkerMessage(event);
    });

    // Check for existing service worker
    if (this.registration.active) {
      this.getServiceWorkerVersion();
    }
  }

  /**
   * Handle service worker updates
   */
  handleServiceWorkerUpdate() {
    const newWorker = this.registration.installing;
    this.log("New service worker installing...");

    newWorker.addEventListener("statechange", () => {
      if (newWorker.state === "installed") {
        if (navigator.serviceWorker.controller) {
          this.log("New service worker available, page refresh recommended", "warn");
          this.notifyUpdate();
        } else {
          this.log("Service worker installed for the first time");
        }
      }
    });
  }

  /**
   * Handle messages from service worker
   */
  handleServiceWorkerMessage(event) {
    this.log("Message from service worker:", "info", event.data);

    if (event.data && event.data.type === "VERSION_RESPONSE") {
      this.log(`Service worker version: ${event.data.version}`);
    }
  }

  /**
   * Get the current service worker version
   */
  getServiceWorkerVersion() {
    if (!this.registration || !this.registration.active) return;

    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      this.handleServiceWorkerMessage(event);
    };

    this.registration.active.postMessage(
      {
        type: "GET_VERSION",
      },
      [messageChannel.port2],
    );
  }

  /**
   * Force service worker to skip waiting and take control
   */
  async forceUpdate() {
    if (!this.registration) return;

    this.log("Forcing service worker update...");

    if (this.registration.waiting) {
      this.registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    // Reload the page after a short delay
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }

  /**
   * Unregister the service worker
   */
  async unregister() {
    if (!this.registration) return false;

    try {
      const result = await this.registration.unregister();
      this.log("Service worker unregistered:", "info", result);
      this.registration = null;
      return result;
    } catch (error) {
      this.log("Failed to unregister service worker:", "error", error);
      return false;
    }
  }

  /**
   * Notify user about service worker update
   */
  notifyUpdate() {
    // Skip notification during development (localhost)
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      this.log("Service worker update detected (skipping notification in development)");
      return;
    }

    // Simple notification - can be enhanced with a proper UI component
    if (confirm("A new version of the demo is available. Refresh to update?")) {
      this.forceUpdate();
    }
  }

  /**
   * Debug logging
   */
  log(message, level = "info", data = null) {
    if (!this.debug) return;

    const prefix = "[SW Manager]";
    const fullMessage = `${prefix} ${message}`;

    switch (level) {
      case "error":
        console.error(fullMessage, data || "");
        break;
      case "warn":
        console.warn(fullMessage, data || "");
        break;
      case "info":
        console.info(fullMessage, data || "");
        break;
      default:
        console.log(fullMessage, data || "");
    }
  }

  /**
   * Update the service worker status UI in the footer
   */
  updateStatusUI(status) {
    const statusElement = document.getElementById("sw-status");
    const indicatorElement = document.getElementById("sw-indicator");
    const textElement = document.getElementById("sw-text");

    if (!statusElement || !indicatorElement || !textElement) {
      return; // Elements not found, maybe page not loaded yet
    }

    // Show the status element
    statusElement.style.display = "block";

    // Update based on status
    switch (status) {
      case "registering":
        statusElement.style.background = "rgba(59, 130, 246, 0.1)";
        statusElement.style.color = "#3b82f6";
        indicatorElement.style.background = "#3b82f6";
        textElement.textContent = "Service Worker Registering...";
        break;
      case "active":
        statusElement.style.background = "rgba(16, 185, 129, 0.1)";
        statusElement.style.color = "#10b981";
        indicatorElement.style.background = "#10b981";
        textElement.textContent = "Service Worker Active";
        break;
      case "error":
        statusElement.style.background = "rgba(239, 68, 68, 0.1)";
        statusElement.style.color = "#ef4444";
        indicatorElement.style.background = "#ef4444";
        textElement.textContent = "Service Worker Error";
        break;
      case "unsupported":
        statusElement.style.background = "rgba(107, 114, 128, 0.1)";
        statusElement.style.color = "#6b7280";
        indicatorElement.style.background = "#6b7280";
        textElement.textContent = "Service Worker Not Supported";
        break;
      default:
        statusElement.style.display = "none";
    }
  }

  /**
   * Clear service worker caches (development only)
   */
  async clearCache() {
    if (!this.registration || !this.registration.active) {
      this.log("No active service worker to clear cache", "warn");
      return false;
    }

    // Check if we're in development
    if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      this.log("Cache clearing only available in development", "warn");
      return false;
    }

    try {
      this.log("Requesting cache clear from service worker...");

      const messageChannel = new MessageChannel();
      const promise = new Promise((resolve, reject) => {
        messageChannel.port1.onmessage = (event) => {
          if (event.data.type === "CACHE_CLEARED") {
            if (event.data.success) {
              resolve(true);
            } else {
              reject(new Error(event.data.error || "Failed to clear cache"));
            }
          }
        };

        // Timeout after 5 seconds
        setTimeout(() => reject(new Error("Cache clear timeout")), 5000);
      });

      this.registration.active.postMessage({ type: "CLEAR_CACHE" }, [messageChannel.port2]);

      const result = await promise;
      this.log("Cache cleared successfully!", "info");
      return result;
    } catch (error) {
      this.log("Failed to clear cache:", "error", error);
      return false;
    }
  }

  /**
   * Get service worker status information
   */
  getStatus() {
    return {
      isSupported: this.isSupported,
      isRegistered: !!this.registration,
      state: this.registration ? this.registration.active?.state : null,
      scope: this.registration ? this.registration.scope : null,
      updateViaCache: this.registration ? this.registration.updateViaCache : null,
    };
  }
}

// Export for global use
window.ServiceWorkerManager = ServiceWorkerManager;

// Auto-initialize if not disabled
if (!window.SW_DISABLE_AUTO_INIT) {
  // Get base path from global config or default to empty
  const basePath = window.SW_BASE_PATH || "";
  window.swManager = new ServiceWorkerManager(basePath);

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.swManager.init();
    });
  } else {
    window.swManager.init();
  }
}

// Debugging utilities for development
window.swDebug = {
  getStatus: () => window.swManager?.getStatus(),
  forceUpdate: () => window.swManager?.forceUpdate(),
  unregister: () => window.swManager?.unregister(),
  getVersion: () => window.swManager?.getServiceWorkerVersion(),
  clearCache: () => window.swManager?.clearCache(),
};
