
(function (Federation){
//
var System = Federation._mfBind(
  {
    n: 'main', // chunk name
    f: 'main-y1pVxfkv.js', // chunk fileName
    c: 'fynapp-7-solid', // federation container name
    s: 'fynmesh', // default scope name
    e: false, // chunk isEntry
    v: '1.0.0' // container version
  },
  // dirs from ids of modules included in the chunk
  // use these to match rvm in container to find required version
  // if this is empty, it means this chunk uses no shared module
  // %nm is token that replaced node_modules
  ["src","%nm/style-inject/dist","%nm/solid-js/web/dist"]
);

System.register(['./dev-DC79LFD2.js'], (function (exports) {
  'use strict';
  var createRoot, createMemo, createRenderEffect, untrack, sharedConfig, createSignal, createComponent, For;
  return {
    setters: [function (module) {
      createRoot = module.createRoot;
      createMemo = module.createMemo;
      createRenderEffect = module.createRenderEffect;
      untrack = module.untrack;
      sharedConfig = module.sharedConfig;
      createSignal = module.createSignal;
      createComponent = module.createComponent;
      For = module.For;
    }],
    execute: (function () {

      exports("main", main);

      const memo = fn => createMemo(() => fn());
      function reconcileArrays(parentNode, a, b) {
        let bLength = b.length,
          aEnd = a.length,
          bEnd = bLength,
          aStart = 0,
          bStart = 0,
          after = a[aEnd - 1].nextSibling,
          map = null;
        while (aStart < aEnd || bStart < bEnd) {
          if (a[aStart] === b[bStart]) {
            aStart++;
            bStart++;
            continue;
          }
          while (a[aEnd - 1] === b[bEnd - 1]) {
            aEnd--;
            bEnd--;
          }
          if (aEnd === aStart) {
            const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
            while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
          } else if (bEnd === bStart) {
            while (aStart < aEnd) {
              if (!map || !map.has(a[aStart])) a[aStart].remove();
              aStart++;
            }
          } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
            const node = a[--aEnd].nextSibling;
            parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
            parentNode.insertBefore(b[--bEnd], node);
            a[aEnd] = b[bEnd];
          } else {
            if (!map) {
              map = new Map();
              let i = bStart;
              while (i < bEnd) map.set(b[i], i++);
            }
            const index = map.get(a[aStart]);
            if (index != null) {
              if (bStart < index && index < bEnd) {
                let i = aStart,
                  sequence = 1,
                  t;
                while (++i < aEnd && i < bEnd) {
                  if ((t = map.get(a[i])) == null || t !== index + sequence) break;
                  sequence++;
                }
                if (sequence > index - bStart) {
                  const node = a[aStart];
                  while (bStart < index) parentNode.insertBefore(b[bStart++], node);
                } else parentNode.replaceChild(b[bStart++], a[aStart++]);
              } else aStart++;
            } else a[aStart++].remove();
          }
        }
      }
      const $$EVENTS = "_$DX_DELEGATE";
      function render(code, element, init, options = {}) {
        if (!element) {
          throw new Error("The `element` passed to `render(..., element)` doesn't exist. Make sure `element` exists in the document.");
        }
        let disposer;
        createRoot(dispose => {
          disposer = dispose;
          element === document ? code() : insert(element, code(), element.firstChild ? null : undefined, init);
        }, options.owner);
        return () => {
          disposer();
          element.textContent = "";
        };
      }
      function template(html, isImportNode, isSVG, isMathML) {
        let node;
        const create = () => {
          if (isHydrating()) throw new Error("Failed attempt to create new DOM elements during hydration. Check that the libraries you are using support hydration.");
          const t = document.createElement("template");
          t.innerHTML = html;
          return t.content.firstChild;
        };
        const fn = isImportNode ? () => untrack(() => document.importNode(node || (node = create()), true)) : () => (node || (node = create())).cloneNode(true);
        fn.cloneNode = fn;
        return fn;
      }
      function delegateEvents(eventNames, document = window.document) {
        const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
        for (let i = 0, l = eventNames.length; i < l; i++) {
          const name = eventNames[i];
          if (!e.has(name)) {
            e.add(name);
            document.addEventListener(name, eventHandler);
          }
        }
      }
      function className(node, value) {
        if (isHydrating(node)) return;
        if (value == null) node.removeAttribute("class");else node.className = value;
      }
      function insert(parent, accessor, marker, initial) {
        if (marker !== undefined && !initial) initial = [];
        if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
        createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
      }
      function isHydrating(node) {
        return !!sharedConfig.context && !sharedConfig.done && (!node || node.isConnected);
      }
      function eventHandler(e) {
        if (sharedConfig.registry && sharedConfig.events) {
          if (sharedConfig.events.find(([el, ev]) => ev === e)) return;
        }
        let node = e.target;
        const key = `$$${e.type}`;
        const oriTarget = e.target;
        const oriCurrentTarget = e.currentTarget;
        const retarget = value => Object.defineProperty(e, "target", {
          configurable: true,
          value
        });
        const handleNode = () => {
          const handler = node[key];
          if (handler && !node.disabled) {
            const data = node[`${key}Data`];
            data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
            if (e.cancelBubble) return;
          }
          node.host && typeof node.host !== "string" && !node.host._$host && node.contains(e.target) && retarget(node.host);
          return true;
        };
        const walkUpTree = () => {
          while (handleNode() && (node = node._$host || node.parentNode || node.host));
        };
        Object.defineProperty(e, "currentTarget", {
          configurable: true,
          get() {
            return node || document;
          }
        });
        if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = _$HY.done = true;
        if (e.composedPath) {
          const path = e.composedPath();
          retarget(path[0]);
          for (let i = 0; i < path.length - 2; i++) {
            node = path[i];
            if (!handleNode()) break;
            if (node._$host) {
              node = node._$host;
              walkUpTree();
              break;
            }
            if (node.parentNode === oriCurrentTarget) {
              break;
            }
          }
        } else walkUpTree();
        retarget(oriTarget);
      }
      function insertExpression(parent, value, current, marker, unwrapArray) {
        const hydrating = isHydrating(parent);
        if (hydrating) {
          !current && (current = [...parent.childNodes]);
          let cleaned = [];
          for (let i = 0; i < current.length; i++) {
            const node = current[i];
            if (node.nodeType === 8 && node.data.slice(0, 2) === "!$") node.remove();else cleaned.push(node);
          }
          current = cleaned;
        }
        while (typeof current === "function") current = current();
        if (value === current) return current;
        const t = typeof value,
          multi = marker !== undefined;
        parent = multi && current[0] && current[0].parentNode || parent;
        if (t === "string" || t === "number") {
          if (hydrating) return current;
          if (t === "number") {
            value = value.toString();
            if (value === current) return current;
          }
          if (multi) {
            let node = current[0];
            if (node && node.nodeType === 3) {
              node.data !== value && (node.data = value);
            } else node = document.createTextNode(value);
            current = cleanChildren(parent, current, marker, node);
          } else {
            if (current !== "" && typeof current === "string") {
              current = parent.firstChild.data = value;
            } else current = parent.textContent = value;
          }
        } else if (value == null || t === "boolean") {
          if (hydrating) return current;
          current = cleanChildren(parent, current, marker);
        } else if (t === "function") {
          createRenderEffect(() => {
            let v = value();
            while (typeof v === "function") v = v();
            current = insertExpression(parent, v, current, marker);
          });
          return () => current;
        } else if (Array.isArray(value)) {
          const array = [];
          const currentArray = current && Array.isArray(current);
          if (normalizeIncomingArray(array, value, current, unwrapArray)) {
            createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
            return () => current;
          }
          if (hydrating) {
            if (!array.length) return current;
            if (marker === undefined) return current = [...parent.childNodes];
            let node = array[0];
            if (node.parentNode !== parent) return current;
            const nodes = [node];
            while ((node = node.nextSibling) !== marker) nodes.push(node);
            return current = nodes;
          }
          if (array.length === 0) {
            current = cleanChildren(parent, current, marker);
            if (multi) return current;
          } else if (currentArray) {
            if (current.length === 0) {
              appendNodes(parent, array, marker);
            } else reconcileArrays(parent, current, array);
          } else {
            current && cleanChildren(parent);
            appendNodes(parent, array);
          }
          current = array;
        } else if (value.nodeType) {
          if (hydrating && value.parentNode) return current = multi ? [value] : value;
          if (Array.isArray(current)) {
            if (multi) return current = cleanChildren(parent, current, marker, value);
            cleanChildren(parent, current, null, value);
          } else if (current == null || current === "" || !parent.firstChild) {
            parent.appendChild(value);
          } else parent.replaceChild(value, parent.firstChild);
          current = value;
        } else console.warn(`Unrecognized value. Skipped inserting`, value);
        return current;
      }
      function normalizeIncomingArray(normalized, array, current, unwrap) {
        let dynamic = false;
        for (let i = 0, len = array.length; i < len; i++) {
          let item = array[i],
            prev = current && current[normalized.length],
            t;
          if (item == null || item === true || item === false) ;else if ((t = typeof item) === "object" && item.nodeType) {
            normalized.push(item);
          } else if (Array.isArray(item)) {
            dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
          } else if (t === "function") {
            if (unwrap) {
              while (typeof item === "function") item = item();
              dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item], Array.isArray(prev) ? prev : [prev]) || dynamic;
            } else {
              normalized.push(item);
              dynamic = true;
            }
          } else {
            const value = String(item);
            if (prev && prev.nodeType === 3 && prev.data === value) normalized.push(prev);else normalized.push(document.createTextNode(value));
          }
        }
        return dynamic;
      }
      function appendNodes(parent, array, marker = null) {
        for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
      }
      function cleanChildren(parent, current, marker, replacement) {
        if (marker === undefined) return parent.textContent = "";
        const node = replacement || document.createTextNode("");
        if (current.length) {
          let inserted = false;
          for (let i = current.length - 1; i >= 0; i--) {
            const el = current[i];
            if (node !== el) {
              const isParent = el.parentNode === parent;
              if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);else isParent && el.remove();
            } else inserted = true;
          }
        } else parent.insertBefore(node, marker);
        return [node];
      }

      function styleInject(css, ref) {
        if (ref === void 0) ref = {};
        var insertAt = ref.insertAt;
        if (typeof document === 'undefined') {
          return;
        }
        var head = document.head || document.getElementsByTagName('head')[0];
        var style = document.createElement('style');
        style.type = 'text/css';
        if (insertAt === 'top') {
          if (head.firstChild) {
            head.insertBefore(style, head.firstChild);
          } else {
            head.appendChild(style);
          }
        } else {
          head.appendChild(style);
        }
        if (style.styleSheet) {
          style.styleSheet.cssText = css;
        } else {
          style.appendChild(document.createTextNode(css));
        }
      }

      var css_248z = "/* Main app container */\n.solid-app {\n  font-family: sans-serif;\n  padding: 20px;\n  background-color: #f7fafc;\n  color: #2d3748;\n  border-radius: 8px;\n  width: 100%;\n  height: 100%;\n  min-height: 100%;\n  margin: 0;\n  box-shadow: 0 4px 12px rgba(0,0,0,0.1);\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n}\n\n.solid-app.dark-mode {\n  background-color: #1a202c;\n  color: #f7fafc;\n  box-shadow: 0 4px 12px rgba(0,0,0,0.3);\n}\n\n/* Header */\nheader {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  margin-bottom: 20px;\n  flex-shrink: 0;\n}\n\n.subtitle {\n  color: #4a5568;\n  margin: 0;\n  font-size: 16px;\n  opacity: 0.8;\n  margin-bottom: 4px;\n}\n\n.dark-mode .subtitle {\n  color: #90cdf4;\n}\n\nh1 {\n  color: #2D7FF9;\n  margin: 0;\n}\n\n.dark-mode h1 {\n  color: #4D97F8;\n}\n\nh3 {\n  margin-top: 0;\n  margin-bottom: 16px;\n}\n\n/* Buttons */\n.theme-toggle {\n  background-color: #e2e8f0;\n  color: #2d3748;\n  border: none;\n  padding: 8px 15px;\n  border-radius: 4px;\n  cursor: pointer;\n}\n\n.dark-mode .theme-toggle {\n  background-color: #4a5568;\n  color: white;\n}\n\n.primary-button {\n  background-color: #2D7FF9;\n  color: white;\n  border: none;\n  padding: 8px 15px;\n  border-radius: 4px;\n  cursor: pointer;\n  margin-right: 10px;\n}\n\n.dark-mode .primary-button {\n  background-color: #4D97F8;\n}\n\n/* Tab Navigation */\n.tab-navigation {\n  margin-bottom: 24px;\n  border-bottom: 1px solid rgba(160, 174, 192, 0.3);\n  display: flex;\n  flex-shrink: 0;\n}\n\n.tab {\n  padding: 12px 16px;\n  cursor: pointer;\n  color: #718096;\n}\n\n.dark-mode .tab {\n  color: #A0AEC0;\n}\n\n.tab.active {\n  color: #2D7FF9;\n  border-bottom: 2px solid #2D7FF9;\n}\n\n.dark-mode .tab.active {\n  color: #4D97F8;\n  border-bottom: 2px solid #4D97F8;\n}\n\n/* Statistics Cards */\n.stats-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));\n  gap: 16px;\n  margin-bottom: 24px;\n}\n\n.stat-card {\n  background-color: white;\n  padding: 16px;\n  border-radius: 8px;\n  box-shadow: 0 2px 5px rgba(0,0,0,0.1);\n}\n\n.dark-mode .stat-card {\n  background-color: #2d3748;\n  box-shadow: 0 2px 5px rgba(0,0,0,0.2);\n}\n\n.stat-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  margin-bottom: 8px;\n}\n\n.stat-title {\n  font-size: 14px;\n  opacity: 0.8;\n}\n\n.stat-trend {\n  font-size: 12px;\n  padding: 2px 6px;\n  border-radius: 12px;\n}\n\n.stat-trend.up {\n  color: #48bb78;\n  background: rgba(72, 187, 120, 0.1);\n}\n\n.stat-trend.down {\n  color: #f56565;\n  background: rgba(245, 101, 101, 0.1);\n}\n\n.stat-value {\n  font-size: 24px;\n  font-weight: bold;\n  margin-bottom: 4px;\n}\n\n.stat-desc {\n  font-size: 12px;\n  opacity: 0.7;\n}\n\n/* Content Sections */\n.content-section,\n.chart-section,\n.counter-section {\n  background-color: white;\n  padding: 20px;\n  border-radius: 8px;\n  margin-bottom: 24px;\n  box-shadow: 0 2px 5px rgba(0,0,0,0.1);\n  flex: 1;\n  min-height: 0;\n}\n\n/* Main content area - expands to fill space */\n.main-content {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  overflow-y: auto;\n}\n\n/* Stats grid should expand in dashboard */\n.stats-grid {\n  flex: 1;\n  min-height: 0;\n}\n\n.dark-mode .content-section,\n.dark-mode .chart-section,\n.dark-mode .counter-section {\n  background-color: #2d3748;\n  box-shadow: 0 2px 5px rgba(0,0,0,0.2);\n}\n\n/* Chart */\n.chart {\n  height: 150px;\n  display: flex;\n  align-items: flex-end;\n  gap: 4px;\n}\n\n.chart-bar {\n  background: linear-gradient(to top, #2D7FF9, #76AEF7);\n  border-radius: 4px 4px 0 0;\n}\n\n.dark-mode .chart-bar {\n  background: linear-gradient(to top, #1E65C7, #4D97F8);\n}\n\n.chart-labels {\n  display: flex;\n  justify-content: space-between;\n  margin-top: 8px;\n  font-size: 12px;\n  opacity: 0.7;\n}\n\n/* Projects Table */\n.projects-table {\n  border-radius: 6px;\n  overflow: hidden;\n}\n\n.projects-header {\n  display: grid;\n  grid-template-columns: 2fr 1fr 1fr 1fr;\n  background-color: #e2e8f0;\n  padding: 12px 16px;\n  font-weight: bold;\n  font-size: 14px;\n}\n\n.dark-mode .projects-header {\n  background-color: #4a5568;\n}\n\n.project-row {\n  display: grid;\n  grid-template-columns: 2fr 1fr 1fr 1fr;\n  padding: 12px 16px;\n  border-bottom: 1px solid #e2e8f0;\n}\n\n.dark-mode .project-row {\n  border-bottom: 1px solid #4a5568;\n}\n\n/* Status Badges */\n.status-badge,\n.priority-badge {\n  font-size: 12px;\n  padding: 2px 8px;\n  border-radius: 12px;\n  display: inline-block;\n}\n\n.status-badge.completed {\n  background-color: #48bb78;\n  color: white;\n}\n\n.status-badge.in-progress {\n  background-color: #2D7FF9;\n  color: white;\n}\n\n.status-badge.on-hold {\n  background-color: #ecc94b;\n  color: #744210;\n}\n\n.status-badge.planning {\n  background-color: #a0aec0;\n  color: white;\n}\n\n.priority-badge.critical {\n  background-color: #f56565;\n  color: white;\n}\n\n.priority-badge.high {\n  background-color: #ed8936;\n  color: white;\n}\n\n.priority-badge.medium {\n  background-color: #ecc94b;\n  color: #744210;\n}\n\n.priority-badge.low {\n  background-color: #a0aec0;\n  color: white;\n}\n\n/* Progress Bar */\n.progress-cell {\n  display: flex;\n  align-items: center;\n}\n\n.progress-bar {\n  flex-grow: 1;\n  height: 8px;\n  background-color: #e2e8f0;\n  border-radius: 4px;\n  overflow: hidden;\n}\n\n.progress-fill {\n  height: 100%;\n}\n\n.progress-text {\n  margin-left: 8px;\n  font-size: 12px;\n}\n\n/* Settings */\n.setting-row {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  padding: 16px 0;\n  border-bottom: 1px solid rgba(160, 174, 192, 0.3);\n}\n\n.setting-name {\n  font-weight: bold;\n  margin-bottom: 4px;\n}\n\n.setting-desc {\n  font-size: 14px;\n  opacity: 0.7;\n}\n\n.setting-toggle {\n  background-color: #e2e8f0;\n  color: #718096;\n  border: none;\n  padding: 8px 15px;\n  border-radius: 4px;\n  cursor: pointer;\n}\n\n.dark-mode .setting-toggle {\n  background-color: #4a5568;\n  color: #a0aec0;\n}\n\n.setting-toggle.enabled {\n  background-color: #2D7FF9;\n  color: white;\n}\n\n.dark-mode .setting-toggle.enabled {\n  background-color: #4D97F8;\n}\n\n/* Footer */\nfooter {\n  font-size: 12px;\n  opacity: 0.7;\n  text-align: center;\n  margin-top: 20px;\n  flex-shrink: 0;\n}\n";
      styleInject(css_248z);

      var _tmpl$ = /*#__PURE__*/template(`<div class=stat-card><div class=stat-header><span class=stat-title></span><span> <!>%</span></div><div class=stat-value></div><div class=stat-desc>`),
        _tmpl$2 = /*#__PURE__*/template(`<div class=chart-bar>`),
        _tmpl$3 = /*#__PURE__*/template(`<div class=project-row><div></div><div><span></span></div><div><span></span></div><div class=progress-cell><div class=progress-bar><div class=progress-fill></div></div><span class=progress-text>%`),
        _tmpl$4 = /*#__PURE__*/template(`<div class=setting-row><div><div class=setting-name></div><div class=setting-desc></div></div><div><button>`),
        _tmpl$5 = /*#__PURE__*/template(`<div><header><div><h2 class=subtitle>FynApp using Solid.js 1.9.6</h2><h1></h1></div><div><button class=theme-toggle>Switch to <!> Mode</button></div></header><div class=tab-navigation></div><footer><p>Solid.js Micro Frontend Example | Last updated: `),
        _tmpl$6 = /*#__PURE__*/template(`<div>`),
        _tmpl$7 = /*#__PURE__*/template(`<div class=stats-grid>`),
        _tmpl$8 = /*#__PURE__*/template(`<div class=chart-section><h3>Performance Metrics</h3><div class=chart></div><div class=chart-labels>`),
        _tmpl$9 = /*#__PURE__*/template(`<div class=counter-section><h3>Interactive Counter</h3><p>You clicked the button <strong></strong> times</p><button class=primary-button>Increment`),
        _tmpl$0 = /*#__PURE__*/template(`<span>`),
        _tmpl$1 = /*#__PURE__*/template(`<div class=content-section><h3>Project Status</h3><div class=projects-table><div class=projects-header><div>Project Name</div><div>Status</div><div>Priority</div><div>Progress`),
        _tmpl$10 = /*#__PURE__*/template(`<div class=content-section><h3>Application Settings`);

      // Card Component
      const StatCard = props => {
        // Each card will have its own signal for the percentage value
        const [percentage] = createSignal(Math.floor(Math.random() * 20) + 1);
        return (() => {
          var _el$ = _tmpl$(),
            _el$2 = _el$.firstChild,
            _el$3 = _el$2.firstChild,
            _el$4 = _el$3.nextSibling,
            _el$5 = _el$4.firstChild,
            _el$7 = _el$5.nextSibling;
            _el$7.nextSibling;
            var _el$8 = _el$2.nextSibling,
            _el$9 = _el$8.nextSibling;
          insert(_el$3, () => props.title);
          insert(_el$4, () => props.trend === 'up' ? '⬆' : '⬇', _el$5);
          insert(_el$4, () => props.trend === 'up' ? '+' : '-', _el$7);
          insert(_el$4, () => props.randomValue(), _el$7);
          insert(_el$8, () => props.value);
          insert(_el$9, () => props.desc);
          createRenderEffect(() => className(_el$4, `stat-trend ${props.trend}`));
          return _el$;
        })();
      };

      // Chart Bar Component
      const ChartBar = props => {
        return (() => {
          var _el$0 = _tmpl$2();
          _el$0.style.setProperty("width", "10%");
          createRenderEffect(_$p => (_$p = `${props.value}px`) != null ? _el$0.style.setProperty("height", _$p) : _el$0.style.removeProperty("height"));
          return _el$0;
        })();
      };

      // Project Row Component
      const ProjectRow = props => {
        const getStatusClass = status => {
          switch (status) {
            case 'Completed':
              return 'completed';
            case 'In Progress':
              return 'in-progress';
            case 'On Hold':
              return 'on-hold';
            default:
              return 'planning';
          }
        };
        const getPriorityClass = priority => {
          switch (priority) {
            case 'Critical':
              return 'critical';
            case 'High':
              return 'high';
            case 'Medium':
              return 'medium';
            default:
              return 'low';
          }
        };
        const getProgressColor = completion => {
          if (completion === 100) return '#48bb78';
          if (completion > 50) return '#2D7FF9';
          return '#ecc94b';
        };
        return (() => {
          var _el$1 = _tmpl$3(),
            _el$10 = _el$1.firstChild,
            _el$11 = _el$10.nextSibling,
            _el$12 = _el$11.firstChild,
            _el$13 = _el$11.nextSibling,
            _el$14 = _el$13.firstChild,
            _el$15 = _el$13.nextSibling,
            _el$16 = _el$15.firstChild,
            _el$17 = _el$16.firstChild,
            _el$18 = _el$16.nextSibling,
            _el$19 = _el$18.firstChild;
          insert(_el$10, () => props.project.name);
          insert(_el$12, () => props.project.status);
          insert(_el$14, () => props.project.priority);
          insert(_el$18, () => props.project.completion, _el$19);
          createRenderEffect(_p$ => {
            var _v$ = `status-badge ${getStatusClass(props.project.status)}`,
              _v$2 = `priority-badge ${getPriorityClass(props.project.priority)}`,
              _v$3 = `${props.project.completion}%`,
              _v$4 = getProgressColor(props.project.completion);
            _v$ !== _p$.e && className(_el$12, _p$.e = _v$);
            _v$2 !== _p$.t && className(_el$14, _p$.t = _v$2);
            _v$3 !== _p$.a && ((_p$.a = _v$3) != null ? _el$17.style.setProperty("width", _v$3) : _el$17.style.removeProperty("width"));
            _v$4 !== _p$.o && ((_p$.o = _v$4) != null ? _el$17.style.setProperty("backgroundColor", _v$4) : _el$17.style.removeProperty("backgroundColor"));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined,
            o: undefined
          });
          return _el$1;
        })();
      };

      // Setting Row Component
      const SettingRow = props => {
        return (() => {
          var _el$20 = _tmpl$4(),
            _el$21 = _el$20.firstChild,
            _el$22 = _el$21.firstChild,
            _el$23 = _el$22.nextSibling,
            _el$24 = _el$21.nextSibling,
            _el$25 = _el$24.firstChild;
          insert(_el$22, () => props.setting.name);
          insert(_el$23, () => props.setting.description);
          _el$25.$$click = () => props.onToggle(props.index);
          insert(_el$25, () => props.setting.enabled ? 'Enabled' : 'Disabled');
          createRenderEffect(() => className(_el$25, `setting-toggle ${props.setting.enabled ? 'enabled' : ''}`));
          return _el$20;
        })();
      };

      // Main App Component
      const App = props => {
        const appName = props.appName || 'Solid App';
        const [count, setCount] = createSignal(0);
        const [darkMode, setDarkMode] = createSignal(false);
        const [activeTab, setActiveTab] = createSignal('dashboard');

        // Create a signal for random values that we'll update on increment
        const [randomValue1, setRandomValue1] = createSignal(Math.floor(Math.random() * 20) + 1);
        const [randomValue2, setRandomValue2] = createSignal(Math.floor(Math.random() * 20) + 1);
        const [randomValue3, setRandomValue3] = createSignal(Math.floor(Math.random() * 20) + 1);
        const [randomValue4, setRandomValue4] = createSignal(Math.floor(Math.random() * 20) + 1);
        const [cards] = createSignal([{
          title: "Analytics",
          value: "85%",
          trend: "up",
          desc: "User engagement",
          randomValue: randomValue1
        }, {
          title: "Revenue",
          value: "$12,850",
          trend: "up",
          desc: "Monthly revenue",
          randomValue: randomValue2
        }, {
          title: "Tickets",
          value: "23",
          trend: "down",
          desc: "Open support tickets",
          randomValue: randomValue3
        }, {
          title: "Users",
          value: "1,293",
          trend: "up",
          desc: "Active users",
          randomValue: randomValue4
        }]);
        const [chartData] = createSignal([30, 40, 45, 50, 49, 60, 70, 91, 125, 150]);
        const [projects] = createSignal([{
          id: 1,
          name: "Website Redesign",
          status: "In Progress",
          completion: 65,
          priority: "High"
        }, {
          id: 2,
          name: "Mobile App Development",
          status: "On Hold",
          completion: 30,
          priority: "Medium"
        }, {
          id: 3,
          name: "API Integration",
          status: "Completed",
          completion: 100,
          priority: "High"
        }, {
          id: 4,
          name: "Database Migration",
          status: "Planning",
          completion: 10,
          priority: "Low"
        }, {
          id: 5,
          name: "Security Audit",
          status: "In Progress",
          completion: 45,
          priority: "Critical"
        }]);
        const [settings, setSettings] = createSignal([{
          name: "Notifications",
          enabled: true,
          description: "Receive email notifications"
        }, {
          name: "Two-Factor Auth",
          enabled: false,
          description: "Add an extra layer of security"
        }, {
          name: "API Access",
          enabled: true,
          description: "Allow third-party API access"
        }, {
          name: "Dark Mode",
          enabled: false,
          description: "Use dark theme by default"
        }]);
        const toggleTheme = () => {
          setDarkMode(!darkMode());
        };
        const toggleSetting = index => {
          const newSettings = [...settings()];
          newSettings[index].enabled = !newSettings[index].enabled;
          setSettings(newSettings);
        };
        const increment = () => {
          setCount(count() + 1);
          // Update all the random values
          setRandomValue1(Math.floor(Math.random() * 20) + 1);
          setRandomValue2(Math.floor(Math.random() * 20) + 1);
          setRandomValue3(Math.floor(Math.random() * 20) + 1);
          setRandomValue4(Math.floor(Math.random() * 20) + 1);
        };
        return (() => {
          var _el$26 = _tmpl$5(),
            _el$27 = _el$26.firstChild,
            _el$28 = _el$27.firstChild,
            _el$29 = _el$28.firstChild,
            _el$30 = _el$29.nextSibling,
            _el$31 = _el$28.nextSibling,
            _el$32 = _el$31.firstChild,
            _el$33 = _el$32.firstChild,
            _el$35 = _el$33.nextSibling;
            _el$35.nextSibling;
            var _el$36 = _el$27.nextSibling,
            _el$37 = _el$36.nextSibling,
            _el$38 = _el$37.firstChild;
            _el$38.firstChild;
          insert(_el$30, appName);
          _el$32.$$click = toggleTheme;
          insert(_el$32, () => darkMode() ? 'Light' : 'Dark', _el$35);
          insert(_el$36, createComponent(For, {
            each: ['dashboard', 'projects', 'settings'],
            children: tab => (() => {
              var _el$40 = _tmpl$6();
              _el$40.$$click = () => setActiveTab(tab);
              insert(_el$40, () => tab.charAt(0).toUpperCase() + tab.slice(1));
              createRenderEffect(() => className(_el$40, `tab ${activeTab() === tab ? 'active' : ''}`));
              return _el$40;
            })()
          }));
          insert(_el$26, (() => {
            var _c$ = memo(() => activeTab() === 'dashboard');
            return () => _c$() && [(() => {
              var _el$41 = _tmpl$7();
              insert(_el$41, createComponent(For, {
                get each() {
                  return cards();
                },
                children: card => createComponent(StatCard, {
                  get title() {
                    return card.title;
                  },
                  get value() {
                    return card.value;
                  },
                  get trend() {
                    return card.trend;
                  },
                  get desc() {
                    return card.desc;
                  },
                  get randomValue() {
                    return card.randomValue;
                  }
                })
              }));
              return _el$41;
            })(), (() => {
              var _el$42 = _tmpl$8(),
                _el$43 = _el$42.firstChild,
                _el$44 = _el$43.nextSibling,
                _el$45 = _el$44.nextSibling;
              insert(_el$44, createComponent(For, {
                get each() {
                  return chartData();
                },
                children: value => createComponent(ChartBar, {
                  value: value,
                  total: 150
                })
              }));
              insert(_el$45, createComponent(For, {
                each: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
                children: month => (() => {
                  var _el$52 = _tmpl$0();
                  insert(_el$52, month);
                  return _el$52;
                })()
              }));
              return _el$42;
            })(), (() => {
              var _el$46 = _tmpl$9(),
                _el$47 = _el$46.firstChild,
                _el$48 = _el$47.nextSibling,
                _el$49 = _el$48.firstChild,
                _el$50 = _el$49.nextSibling,
                _el$51 = _el$48.nextSibling;
              insert(_el$50, count);
              _el$51.$$click = increment;
              return _el$46;
            })()];
          })(), _el$37);
          insert(_el$26, (() => {
            var _c$2 = memo(() => activeTab() === 'projects');
            return () => _c$2() && (() => {
              var _el$53 = _tmpl$1(),
                _el$54 = _el$53.firstChild,
                _el$55 = _el$54.nextSibling;
                _el$55.firstChild;
              insert(_el$55, createComponent(For, {
                get each() {
                  return projects();
                },
                children: project => createComponent(ProjectRow, {
                  project: project
                })
              }), null);
              return _el$53;
            })();
          })(), _el$37);
          insert(_el$26, (() => {
            var _c$3 = memo(() => activeTab() === 'settings');
            return () => _c$3() && (() => {
              var _el$57 = _tmpl$10();
                _el$57.firstChild;
              insert(_el$57, createComponent(For, {
                get each() {
                  return settings();
                },
                children: (setting, index) => createComponent(SettingRow, {
                  setting: setting,
                  get index() {
                    return index();
                  },
                  onToggle: toggleSetting
                })
              }), null);
              return _el$57;
            })();
          })(), _el$37);
          insert(_el$38, () => new Date().toLocaleDateString(), null);
          createRenderEffect(() => className(_el$26, `solid-app ${darkMode() ? 'dark-mode' : ''}`));
          return _el$26;
        })();
      };
      delegateEvents(["click"]);

      async function main(runtime) {
        console.log(`Bootstrapping ${runtime.fynApp.name}...`);
        try {
          // Find or create the div element to render into
          let targetDiv = document.getElementById("fynapp-7-solid");
          if (!targetDiv) {
            targetDiv = document.createElement("div");
            targetDiv.id = "fynapp-7-solid";
            document.body.appendChild(targetDiv);
          }

          // Clear any existing content
          targetDiv.innerHTML = "";

          // Render the Solid component
          const dispose = render(() => createComponent(App, {
            get appName() {
              return runtime.fynApp.name;
            }
          }), targetDiv);
          console.log(`${runtime.fynApp.name} bootstrapped successfully`);

          // Return cleanup function
          return () => {
            dispose();
            console.log(`${runtime.fynApp.name} unmounted`);
          };
        } catch (error) {
          console.error(`Error bootstrapping ${runtime.fynApp.name}:`, error);

          // Fallback rendering if component fails
          let targetDiv = document.getElementById("fynapp-7-solid");
          if (targetDiv) {
            targetDiv.innerHTML = `
        <div style="padding: 20px; color: #2D7FF9;">
          <h2>${runtime.fynApp.name} (Fallback)</h2>
          <p>Simple Solid.js component</p>
        </div>
      `;
          }
        }
      }

    })
  };
}));

})(globalThis.Federation);
//# sourceMappingURL=main-y1pVxfkv.js.map
