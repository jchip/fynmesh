import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FynEventTarget } from '../src/event-target.js';

describe('FynEventTarget', () => {
    let eventTarget: FynEventTarget;

    beforeEach(() => {
        eventTarget = new FynEventTarget();
    });

    describe('event handling', () => {
        it('should add event listeners with on method', () => {
            const handler = vi.fn();

            eventTarget.on('test-event', handler);

            const event = new CustomEvent('test-event', { detail: { test: 'data' } });
            eventTarget.dispatchEvent(event);

            expect(handler).toHaveBeenCalledWith(event);
        });

        it('should add one-time event listeners with once method', () => {
            const handler = vi.fn();

            eventTarget.once('test-event', handler);

            // First dispatch should trigger the handler
            const event1 = new CustomEvent('test-event', { detail: { first: true } });
            eventTarget.dispatchEvent(event1);

            // Second dispatch should not trigger the handler
            const event2 = new CustomEvent('test-event', { detail: { second: true } });
            eventTarget.dispatchEvent(event2);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(event1);
        });

        it('should handle object-style event listeners', () => {
            const handler = {
                handleEvent: vi.fn()
            };

            eventTarget.on('test-event', handler);

            const event = new CustomEvent('test-event', { detail: { test: 'data' } });
            eventTarget.dispatchEvent(event);

            expect(handler.handleEvent).toHaveBeenCalledWith(event);
        });

        it('should handle once with object-style listeners', () => {
            const handler = {
                handleEvent: vi.fn()
            };

            eventTarget.once('test-event', handler);

            // First dispatch should trigger the handler
            const event1 = new CustomEvent('test-event', { detail: { first: true } });
            eventTarget.dispatchEvent(event1);

            // Second dispatch should not trigger the handler
            const event2 = new CustomEvent('test-event', { detail: { second: true } });
            eventTarget.dispatchEvent(event2);

            expect(handler.handleEvent).toHaveBeenCalledTimes(1);
            expect(handler.handleEvent).toHaveBeenCalledWith(event1);
        });

        it('should support multiple listeners for the same event', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            eventTarget.on('test-event', handler1);
            eventTarget.on('test-event', handler2);

            const event = new CustomEvent('test-event', { detail: { test: 'data' } });
            eventTarget.dispatchEvent(event);

            expect(handler1).toHaveBeenCalledWith(event);
            expect(handler2).toHaveBeenCalledWith(event);
        });

        it('should support event listener options', () => {
            const handler = vi.fn();

            eventTarget.on('test-event', handler, { once: true });

            // First dispatch should trigger the handler
            const event1 = new CustomEvent('test-event', { detail: { first: true } });
            eventTarget.dispatchEvent(event1);

            // Second dispatch should not trigger due to once option
            const event2 = new CustomEvent('test-event', { detail: { second: true } });
            eventTarget.dispatchEvent(event2);

            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('should allow removing event listeners', () => {
            const handler = vi.fn();

            eventTarget.addEventListener('test-event', handler);

            const event1 = new CustomEvent('test-event', { detail: { first: true } });
            eventTarget.dispatchEvent(event1);

            eventTarget.removeEventListener('test-event', handler);

            const event2 = new CustomEvent('test-event', { detail: { second: true } });
            eventTarget.dispatchEvent(event2);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(event1);
        });
    });

    describe('inheritance', () => {
        it('should extend native EventTarget', () => {
            expect(eventTarget).toBeInstanceOf(EventTarget);
        });

        it('should have all EventTarget methods', () => {
            expect(typeof eventTarget.addEventListener).toBe('function');
            expect(typeof eventTarget.removeEventListener).toBe('function');
            expect(typeof eventTarget.dispatchEvent).toBe('function');
        });

        it('should have custom convenience methods', () => {
            expect(typeof eventTarget.on).toBe('function');
            expect(typeof eventTarget.once).toBe('function');
        });
    });
});
