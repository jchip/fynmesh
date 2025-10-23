// Service Worker for FynMesh Demo Server
// This will eventually simulate backend services for GitHub Pages deployment

const CACHE_NAME = "fynmesh-demo-v1";
const SW_VERSION = "1.0.0";

// Check if we're in development mode
const isDevelopment = location.hostname === "localhost" || location.hostname === "127.0.0.1";

// Get the base path from the service worker's own URL
// e.g., if SW is at /fynmesh/sw.js, basePath is /fynmesh/
const swUrl = new URL(self.location.href);
const basePath = swUrl.pathname.substring(0, swUrl.pathname.lastIndexOf('/') + 1);
console.log(`[Service Worker] Base path detected: ${basePath}`);

// Cache important assets (paths relative to basePath)
const STATIC_ASSETS = [
  `${basePath}`,
  `${basePath}index.html`,
  `${basePath}system.min.js`,
  `${basePath}federation-js/dist/federation-js.min.js`,
  `${basePath}kernel/dist/fynmesh-browser-kernel.min.js`,
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log(`[Service Worker] Installing version ${SW_VERSION} (development: ${isDevelopment})`);

  if (isDevelopment) {
    console.log("[Service Worker] Development mode - skipping cache population");
    event.waitUntil(
      self.skipWaiting().then(() => {
        console.log("[Service Worker] Installation complete (dev mode)");
      }),
    );
    return;
  }

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[Service Worker] Caching static assets");
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log("[Service Worker] Installation complete");
        // Force activation of new service worker
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("[Service Worker] Installation failed:", error);
      }),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activating");

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log("[Service Worker] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => {
        console.log("[Service Worker] Activation complete");
        // Take control of all clients
        return self.clients.claim();
      }),
  );
});

// Fetch event - handle network requests
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Handle static assets
  if (STATIC_ASSETS.some((asset) => url.pathname === asset || url.pathname.endsWith(asset))) {
    if (isDevelopment) {
      // Development: Network-first strategy (always get fresh content)
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.status === 200) {
              console.log("[Service Worker] [DEV] Fresh from network:", request.url);
              return response;
            }
            throw new Error(`Network response not ok: ${response.status}`);
          })
          .catch((error) => {
            console.log(
              "[Service Worker] [DEV] Network failed, trying cache:",
              request.url,
              error.message,
            );
            return caches.match(request).then((cachedResponse) => {
              if (cachedResponse) {
                console.log("[Service Worker] [DEV] Serving from cache as fallback:", request.url);
                return cachedResponse;
              }
              console.error("[Service Worker] [DEV] No cache fallback available:", request.url);
              return new Response("Development: Network and cache unavailable", {
                status: 503,
                statusText: "Service Unavailable",
              });
            });
          }),
      );
    } else {
      // Production: Cache-first strategy
      event.respondWith(
        caches
          .match(request)
          .then((response) => {
            if (response) {
              console.log("[Service Worker] [PROD] Serving from cache:", request.url);
              return response;
            }

            console.log("[Service Worker] [PROD] Fetching from network:", request.url);
            return fetch(request).then((response) => {
              // Cache successful responses
              if (response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseClone);
                });
              }
              return response;
            });
          })
          .catch((error) => {
            console.error("[Service Worker] [PROD] Fetch failed:", error);
            // Return a fallback response if needed
            return new Response("Service Worker: Network error occurred", {
              status: 503,
              statusText: "Service Unavailable",
            });
          }),
      );
    }
  }

  // TODO: Future enhancement - simulate backend API responses here
  // This is where we'll add mock API responses for GitHub Pages deployment
  if (url.pathname.startsWith("/api/")) {
    console.log("[Service Worker] API request detected (not implemented yet):", url.pathname);
    // Future: Handle API simulation here
  }
});

// Message event - handle messages from main thread
self.addEventListener("message", (event) => {
  console.log("[Service Worker] Message received:", event.data);

  if (event.data && event.data.type === "GET_VERSION") {
    event.ports[0].postMessage({
      type: "VERSION_RESPONSE",
      version: SW_VERSION,
      development: isDevelopment,
    });
  }

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  // Development helper: Clear all caches
  if (event.data && event.data.type === "CLEAR_CACHE" && isDevelopment) {
    console.log("[Service Worker] [DEV] Clearing all caches...");
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log("[Service Worker] [DEV] Deleting cache:", cacheName);
            return caches.delete(cacheName);
          }),
        );
      })
      .then(() => {
        console.log("[Service Worker] [DEV] All caches cleared!");
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({
            type: "CACHE_CLEARED",
            success: true,
          });
        }
      })
      .catch((error) => {
        console.error("[Service Worker] [DEV] Failed to clear caches:", error);
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({
            type: "CACHE_CLEARED",
            success: false,
            error: error.message,
          });
        }
      });
  }
});

console.log(`[Service Worker] Script loaded, version ${SW_VERSION}`);
