# Service Worker Setup for FynMesh Demo Server

## Overview

The demo-server includes a service worker setup that will be used to simulate backend services for GitHub Pages deployment. Since GitHub Pages only serves static content, the service worker will intercept API requests and provide mock responses.

## Files

- **`/public/sw.js`** - The main service worker script
- **`/public/sw-utils.js`** - Service worker management utilities and registration
- **Status indicator** - Visual status indicator in the page footer

## Current Features

### ✅ Basic Service Worker Infrastructure
- Service worker registration and lifecycle management
- Caching strategy for static assets
- Update notification system
- Debug utilities accessible via browser console

### ✅ Status Monitoring
- Visual status indicator in footer shows service worker state
- Console logging for debugging
- Version checking and update notifications

### ✅ Developer Tools
Available in browser console:
```javascript
// Check service worker status
swDebug.getStatus()

// Force update service worker
swDebug.forceUpdate()

// Unregister service worker
swDebug.unregister()

// Get service worker version
swDebug.getVersion()
```

## Planned Features (TODO)

### 🔄 Backend API Simulation
- Intercept `/api/*` requests
- Provide mock responses for common backend services
- Support for:
  - User authentication simulation
  - Data CRUD operations
  - File upload/download simulation
  - WebSocket simulation via Server-Sent Events

### 🔄 Advanced Caching
- Cache strategies for different content types
- Offline support for micro-frontends
- Background sync for better performance

### ✅ GitHub Pages Support
- Configurable base path for deployment to subpaths (e.g., `username.github.io/fynmesh`)
- Service worker registration adapts to deployment location
- All asset paths resolve correctly regardless of deployment path

### 🔄 GitHub Pages Optimization (TODO)
- Automatic fallback for missing routes (SPA routing)
- Optimized caching for module federation bundles
- CDN simulation for faster loading

## Usage

### Development
The service worker is automatically registered when you load the demo page. Check the browser console for registration status and the footer for a visual indicator.

### GitHub Pages Deployment
For deployment to GitHub Pages with a custom base path (e.g., `username.github.io/fynmesh`):

```bash
# Build templates with base path for GitHub Pages
BASE_PATH="/fynmesh" npm run build:templates

# Copy built files to docs directory (for gh-pages publishing)
cp -r public/* ../../docs/
```

This configures all asset paths and service worker registration to work correctly with the subpath deployment.

### Testing Service Worker Updates
1. Make changes to `sw.js`
2. Reload the page
3. The service worker will detect updates and show a notification
4. Accept the update to reload with the new version

### Debugging
Open browser DevTools → Application → Service Workers to inspect the service worker state, or use the console utilities:

```javascript
// Quick status check
swDebug.getStatus()
```

## Future Backend Simulation Implementation

When implementing API simulation, add handlers in `sw.js` like this:

```javascript
// In sw.js fetch event handler
if (url.pathname.startsWith('/api/')) {
  event.respondWith(handleApiRequest(request));
}

async function handleApiRequest(request) {
  const url = new URL(request.url);

  // Example: Mock user API
  if (url.pathname === '/api/user') {
    return new Response(JSON.stringify({
      id: 1,
      name: 'Demo User',
      email: 'demo@fynmesh.com'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Default 404 for unhandled APIs
  return new Response('API not found', { status: 404 });
}
```

## Browser Support

- ✅ Chrome/Edge 45+
- ✅ Firefox 44+
- ✅ Safari 11.1+
- ❌ Internet Explorer (not supported)

The service worker will gracefully degrade in unsupported browsers.

## Best Practices

1. **Version Management**: Update the `SW_VERSION` constant in `sw.js` when making changes
2. **Cache Strategy**: Be mindful of cache invalidation for development vs production
3. **Error Handling**: Always provide fallbacks for network failures
4. **Testing**: Test service worker behavior in incognito mode to simulate first-time visits

## Notes

- Service workers require HTTPS in production (localhost is exempt)
- Clear browser cache if experiencing issues during development
- Use browser DevTools → Application → Storage to clear service worker data
