# Browser Facilities for Resource Loading Priority

## Overview

Modern browsers provide several facilities to control resource loading priority and mitigate aggressive preloading issues.

---

## 1. Resource Hints (Link Rel Attributes)

### `rel="modulepreload"` ⚡ **Currently Using**

```html
<link rel="modulepreload" href="/module.js" as="script">
```

**Purpose:** Preload ES modules with high priority
**Priority:** **High** (same as parser-blocking scripts)
**Behavior:**
- Downloads module immediately
- Parses and caches in module map
- Does NOT execute until `import()` called
- Blocks other resources on slow connections

**Best for:** Critical modules needed for initial render

---

### `rel="prefetch"` 🔮 **Recommended for Transitive Deps**

```html
<link rel="prefetch" href="/module.js" as="script">
```

**Purpose:** Hint for likely future navigation
**Priority:** **Lowest** (idle time only)
**Behavior:**
- Only downloads during browser idle time
- Won't compete with critical resources
- Cached for future use
- Browser may ignore if bandwidth constrained

**Best for:** Likely-needed dependencies, future routes

**Browser Support:** ✅ Excellent (all modern browsers)

---

### `rel="preload"` 📦 (Not for ES Modules)

```html
<link rel="preload" href="/style.css" as="style">
<link rel="preload" href="/font.woff2" as="font" crossorigin>
```

**Purpose:** Early fetch for current page resources
**Priority:** **High** (but configurable with `fetchpriority`)
**Behavior:**
- Downloads immediately with high priority
- Must specify `as` attribute
- **Not suitable for ES modules** (use `modulepreload` instead)

**Best for:** CSS, fonts, images, non-module scripts

---

### `rel="dns-prefetch"` 🌐

```html
<link rel="dns-prefetch" href="https://cdn.example.com">
```

**Purpose:** Resolve DNS ahead of time
**Priority:** N/A (DNS only)
**Behavior:**
- Performs DNS lookup only
- Minimal overhead
- Useful for cross-origin resources

**Best for:** CDN domains, API endpoints

---

### `rel="preconnect"` 🔌

```html
<link rel="preconnect" href="https://cdn.example.com">
```

**Purpose:** Establish connection (DNS + TCP + TLS)
**Priority:** N/A (connection only)
**Behavior:**
- Completes full connection handshake
- More expensive than dns-prefetch
- Limit to 4-6 origins max

**Best for:** Critical cross-origin resources

---

## 2. Fetch Priority API ⭐ **Recommended**

### `fetchpriority` Attribute (Chrome 101+, Safari 17.2+)

```html
<!-- High priority -->
<link rel="modulepreload" href="/critical.js" fetchpriority="high">

<!-- Low priority -->
<link rel="modulepreload" href="/secondary.js" fetchpriority="low">

<!-- Auto (browser decides) -->
<link rel="modulepreload" href="/normal.js" fetchpriority="auto">
```

**Browser Support:**
- ✅ Chrome/Edge 101+ (May 2022)
- ✅ Safari 17.2+ (December 2023)
- ❌ Firefox (not yet supported)

**Priority Levels:**
- `high`: Load ASAP, prioritize over other resources
- `low`: Defer until idle, won't block critical resources
- `auto`: Let browser decide (default)

**JavaScript API:**
```javascript
fetch('/api/data', { priority: 'low' });

const img = new Image();
img.fetchPriority = 'high';
img.src = '/hero.jpg';
```

**Best for:** Fine-grained control within same resource type

---

## 3. Loading Attribute (Images/Iframes)

### `loading="lazy"` 🦥

```html
<img src="/image.jpg" loading="lazy">
<iframe src="/widget.html" loading="lazy">
```

**Purpose:** Defer loading until near viewport
**Priority:** N/A (deferred until scroll)
**Behavior:**
- Only loads when element is near viewport (~1-2 screens away)
- Native browser implementation (no JS needed)
- Saves bandwidth on long pages

**Browser Support:** ✅ Excellent (all modern browsers)

**Best for:** Below-fold images, iframes

---

## 4. Script Loading Attributes

### `async` vs `defer` vs `type="module"`

```html
<!-- Regular blocking script (worst) -->
<script src="/script.js"></script>

<!-- Async: Load in parallel, execute ASAP (unpredictable order) -->
<script src="/script.js" async></script>

<!-- Defer: Load in parallel, execute after DOM (ordered) -->
<script src="/script.js" defer></script>

<!-- Module: Automatically deferred -->
<script type="module" src="/module.js"></script>
```

**ES Module Default Behavior:**
- ES modules are automatically deferred
- Load in parallel without blocking parser
- Execute in dependency order

---

## 5. HTTP/2 Server Push (Deprecated ⚠️)

**Status:** Being removed from browsers
- Chrome removed in v106 (September 2022)
- Replaced by 103 Early Hints

**Why deprecated:**
- Wasted bandwidth (pushed unused resources)
- No cache awareness
- `rel="preload"` + Link headers work better

---

## 6. HTTP 103 Early Hints ⚡ (Modern Alternative)

**Server sends preload hints before final response:**

```http
HTTP/1.1 103 Early Hints
Link: </style.css>; rel=preload; as=style
Link: </script.js>; rel=preload; as=script

HTTP/1.1 200 OK
...
```

**Purpose:** Start loading resources while server generates HTML
**Browser Support:**
- ✅ Chrome 103+ (June 2022)
- ✅ Safari 17+ (September 2023)
- ❌ Firefox (in development)

**Best for:** Server-side rendered apps with slow backends

---

## 7. Priority Hints (Network Priority)

### Browser's Internal Priority System

Browsers assign internal priorities to resources:

| Resource Type | Default Priority |
|--------------|------------------|
| HTML | Highest |
| CSS | Highest |
| Fonts | High |
| Scripts (blocking) | High |
| Scripts (async/defer) | Low |
| Images (above fold) | Medium |
| Images (below fold) | Low |
| `rel="modulepreload"` | High |
| `rel="prefetch"` | Lowest (idle) |

**How it works:**
- Browser maintains a queue per priority level
- High priority resources fetch first
- Low priority waits for idle time

---

## 8. Network Information API (Adaptive Loading)

### Check Connection Quality

```javascript
// Check if user is on slow connection
const connection = navigator.connection || navigator.mozConnection;

if (connection) {
  console.log('Effective type:', connection.effectiveType);
  console.log('Downlink speed:', connection.downlink, 'Mbps');
  console.log('RTT:', connection.rtt, 'ms');
  console.log('Save data:', connection.saveData);
}

// Adapt preloading based on connection
if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
  // Disable aggressive preloading
  preloadDepth = 0;
} else if (connection.effectiveType === '3g') {
  // Conservative preloading
  preloadDepth = 1;
} else {
  // Aggressive preloading on fast connections
  preloadDepth = 2;
}
```

**Browser Support:**
- ✅ Chrome/Edge (good)
- ⚠️ Safari (limited)
- ❌ Firefox (not supported)

**Best for:** Adaptive loading strategies

---

## 9. Save-Data Header (User Preference)

### Respect User's Data Saving Preference

```javascript
// Check if user enabled data saver
const saveData = navigator.connection?.saveData;

if (saveData) {
  console.log('User wants to save data - reduce preloading');
  // Switch to prefetch instead of modulepreload
  // Or disable preloading entirely
}
```

**Server-side detection:**
```http
GET /api/data HTTP/1.1
Save-Data: on
```

**Best for:** Respecting user preferences on mobile/metered connections

---

## 10. Resource Timing API (Measurement)

### Measure Actual Performance Impact

```javascript
// Measure how long preloads take
const preloadTiming = performance.getEntriesByType('resource')
  .filter(entry => entry.initiatorType === 'link' && entry.name.includes('fynapp-entry'));

preloadTiming.forEach(entry => {
  console.log('Preload:', entry.name);
  console.log('Duration:', entry.duration, 'ms');
  console.log('Transfer size:', entry.transferSize, 'bytes');
});

// Check if preloads blocked critical resources
const criticalResources = performance.getEntriesByType('resource')
  .filter(entry => entry.name.includes('.css') || entry.name.includes('font'));

criticalResources.forEach(entry => {
  if (entry.startTime > 1000) {
    console.warn('Critical resource delayed:', entry.name);
  }
});
```

**Best for:** A/B testing different preload strategies

---

## Recommended Strategy for FynMesh

### Tiered Preloading with Browser Hints

```typescript
interface PreloadConfig {
  requested: string[];        // FynApps user explicitly requested
  dependencies: string[];     // Immediate dependencies
  transitive: string[];       // Transitive dependencies
  connection?: 'slow' | 'fast';
}

function generatePreloadTags(config: PreloadConfig): string {
  const tags: string[] = [];

  // Tier 1: Critical (requested FynApps) - HIGH PRIORITY
  config.requested.forEach(url => {
    tags.push(`<link rel="modulepreload" href="${url}" as="script" fetchpriority="high">`);
  });

  // Tier 2: Important (immediate dependencies) - NORMAL PRIORITY
  config.dependencies.forEach(url => {
    if (config.connection === 'slow') {
      // On slow connections, use prefetch (idle time)
      tags.push(`<link rel="prefetch" href="${url}" as="script">`);
    } else {
      // On fast connections, use modulepreload with auto priority
      tags.push(`<link rel="modulepreload" href="${url}" as="script" fetchpriority="auto">`);
    }
  });

  // Tier 3: Nice-to-have (transitive) - LOW PRIORITY
  if (config.connection !== 'slow') {
    config.transitive.forEach(url => {
      // Only prefetch on non-slow connections
      tags.push(`<link rel="prefetch" href="${url}" as="script">`);
    });
  }

  return tags.join('\n');
}
```

### Implementation in Kernel

```typescript
// browser-kernel.ts
private injectPreloadLink(url: string, priority: 'critical' | 'important' | 'prefetch' = 'important'): void {
  const link = document.createElement('link');

  if (priority === 'prefetch') {
    // Low priority: fetch during idle time
    link.rel = 'prefetch';
    link.as = 'script';
  } else {
    // High/normal priority: modulepreload
    link.rel = 'modulepreload';
    link.as = 'script';

    // Use fetchpriority if supported
    if ('fetchPriority' in HTMLLinkElement.prototype) {
      link.fetchPriority = priority === 'critical' ? 'high' : 'auto';
    }
  }

  link.href = url;
  document.head.appendChild(link);
}

// Adaptive loading based on connection
private getConnectionQuality(): 'slow' | 'fast' {
  const connection = (navigator as any).connection;
  if (!connection) return 'fast';

  // Check if user enabled data saver
  if (connection.saveData) return 'slow';

  // Check effective connection type
  const effectiveType = connection.effectiveType;
  if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
    return 'slow';
  }

  return 'fast';
}
```

---

## Summary: What to Use for FynMesh

| Scenario | Browser Facility | Implementation |
|----------|-----------------|----------------|
| **Critical FynApps** (depth 0) | `<link rel="modulepreload" fetchpriority="high">` | Current behavior ✅ |
| **Immediate deps** (depth 1) | `<link rel="modulepreload" fetchpriority="auto">` | Add priority option ⏳ |
| **Transitive deps** (depth 2+) | `<link rel="prefetch">` | Switch to prefetch ⏳ |
| **Slow connections** | Check `navigator.connection` | Adaptive loading ⏳ |
| **User data saver** | Check `connection.saveData` | Respect preference ⏳ |
| **Measurement** | Resource Timing API | A/B testing ⏳ |

---

## Browser Compatibility

| Feature | Chrome | Safari | Firefox | Edge |
|---------|--------|--------|---------|------|
| `modulepreload` | ✅ 64+ | ✅ 15+ | ✅ 115+ | ✅ 79+ |
| `prefetch` | ✅ 8+ | ✅ 13+ | ✅ 2+ | ✅ 12+ |
| `fetchpriority` | ✅ 101+ | ✅ 17.2+ | ❌ | ✅ 101+ |
| Network Info API | ✅ | ⚠️ Limited | ❌ | ✅ |
| Save-Data | ✅ | ❌ | ❌ | ✅ |

**Key Takeaway:** `prefetch` has universal support and is the safest way to reduce preload aggressiveness!

---

## Recommended Next Steps

1. ✅ **Use `rel="prefetch"` for transitive dependencies** (depth > 1)
   - Universal browser support
   - Won't block critical resources
   - Simple to implement

2. ⏳ **Add `fetchpriority` attribute** (progressive enhancement)
   - Use when supported
   - Fallback to default priority when not

3. ⏳ **Implement adaptive loading** (check connection quality)
   - Adjust preload strategy based on network
   - Respect user's data saver preference

4. ⏳ **Measure with Resource Timing API**
   - A/B test different strategies
   - Validate that preloading helps vs hurts
