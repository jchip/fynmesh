/**
 * Extended EventTarget class for the FynMesh kernel
 * Adds convenient methods for event handling
 */
export class FynEventTarget extends EventTarget {
  /**
   * Add an event listener
   * @param type The event type to listen for
   * @param handler The event handler
   * @param options Optional addEventListener options
   */
  on(
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    this.addEventListener(type, handler, options);
  }

  /**
   * Add a one-time event listener
   * @param type The event type to listen for
   * @param handler The event handler
   * @param options Optional addEventListener options
   */
  once(
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    const xh = (evt: Event) => {
      this.removeEventListener(type, xh);
      return typeof handler === "function" ? handler(evt) : handler.handleEvent(evt);
    };
    this.addEventListener(type, xh, options);
  }
}

// Legacy type alias for backward compatibility
export type FynAppEventTarget = FynEventTarget;
