/**
 * Extended EventTarget class for the FynMesh kernel
 * Adds convenient methods for event handling
 */
export declare class FynEventTarget extends EventTarget {
    constructor();
    /**
     * Add an event listener
     * @param type The event type to listen for
     * @param handler The event handler
     * @param options Optional addEventListener options
     */
    on(type: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    /**
     * Add a one-time event listener
     * @param type The event type to listen for
     * @param handler The event handler
     * @param options Optional addEventListener options
     */
    once(type: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
}
export type FynAppEventTarget = FynEventTarget;
