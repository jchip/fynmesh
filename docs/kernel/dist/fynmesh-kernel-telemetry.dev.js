(function () {
  'use strict';

  var __defProp = Object.defineProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var _buffer;
  const DEFAULT_MAX_BUFFER_SIZE = 500;
  class ConsoleTelemetryTransport {
    async send(batch) {
      console.log("[telemetry]", batch);
    }
  }
  class KernelTelemetryImpl {
    constructor(config) {
      __privateAdd(this, _buffer, []);
      __publicField(this, "transport");
      __publicField(this, "maxBufferSize");
      this.transport = config?.transport ?? new ConsoleTelemetryTransport();
      this.maxBufferSize = config?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
    }
    capture(entry) {
      const full = { ...entry, ts: Date.now() };
      if (__privateGet(this, _buffer).length >= this.maxBufferSize) {
        __privateGet(this, _buffer).shift();
      }
      __privateGet(this, _buffer).push(full);
    }
    capErr(name, data, error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.capture({
        type: "error",
        name,
        data,
        error: { message: err.message, stack: err.stack }
      });
    }
    scope(prefix) {
      return {
        capture: (entry) => this.capture({ ...entry, name: `${prefix}.${entry.name}` }),
        capErr: (name, data, error) => this.capErr(`${prefix}.${name}`, data, error),
        scope: (sub) => this.scope(`${prefix}.${sub}`),
        flush: () => this.flush()
      };
    }
    /** Buffer length; the ring-buffer tests assert on it. */
    get bufferSize() {
      return __privateGet(this, _buffer).length;
    }
    flush() {
      if (__privateGet(this, _buffer).length === 0) return;
      const batch = __privateGet(this, _buffer).splice(0);
      const failed = (err) => console.error("[telemetry] transport.send failed:", err);
      try {
        void Promise.resolve(this.transport.send(batch)).catch(failed);
      } catch (err) {
        failed(err);
      }
    }
  }
  _buffer = new WeakMap();

  function install(kernel, hooks) {
    kernel.setTelemetry = (config) => {
      hooks.setTel(new KernelTelemetryImpl(config));
    };
  }
  const telemetryAddon = { name: "telemetry", install };

  function installGlobal(addon) {
    const kernel = globalThis.fynMeshKernel;
    if (!kernel?.use) {
      throw new Error(
        `FynMesh add-on "${addon.name}" loaded before the kernel: load the core kernel bundle first`
      );
    }
    kernel.use(addon);
  }

  installGlobal(telemetryAddon);

})();
