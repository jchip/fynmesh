/**
 * Preload hints against the combined bundle map.
 *
 * A module the build folded into a combined file is fetched as that file and
 * never under its own url — federation's `instantiate` hook pulls the carrier
 * instead. So a hint naming the module's own url is a hint for a file the
 * runtime never requests: the hint is wasted and the file really needed is
 * still fetched cold.
 *
 * What is pinned down here: a hint names the file that will actually be
 * fetched, N members of one file cost one tag, and every way of not knowing the
 * carrier degrades to hinting the url as given.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BrowserKernel } from "../src/browser-kernel.js";

const BASE = "http://app.test/dist/";
const CARRIER = BASE + "combo-1.js";
const MEMBER_A = BASE + "hello-aaa111.js";
const MEMBER_B = BASE + "getInfo-bbb222.js";
const SOLO = BASE + "solo-ccc333.js";

/** what federation holds after a build that combined A and B, and left SOLO alone */
const carriers: Record<string, string> = {
  [MEMBER_A]: CARRIER,
  [MEMBER_B]: CARRIER,
};

function hinted(): string[] {
  return [...document.head.querySelectorAll('link[rel="preload"]')].map(
    (link) => link.getAttribute("href") as string
  );
}

beforeEach(() => {
  document.head.innerHTML = "";
  (globalThis as any).Federation = {
    bundleUrlFor: (url: string) => carriers[url],
  };
});

afterEach(() => {
  delete (globalThis as any).Federation;
});

describe("preload hints for a combined module", () => {
  it("names the file that carries it, not the module's own url", () => {
    new BrowserKernel().tryPreload(MEMBER_A, 0);

    expect(hinted()).toEqual([CARRIER]);
  });

  it("leaves a module that is its own file alone", () => {
    new BrowserKernel().tryPreload(SOLO, 0);

    expect(hinted()).toEqual([SOLO]);
  });

  it("costs one tag however many members of that file are hinted", () => {
    const kernel = new BrowserKernel();

    kernel.tryPreload(MEMBER_A, 0);
    kernel.tryPreload(MEMBER_B, 0);
    kernel.tryPreload(MEMBER_A, 1);

    expect(hinted()).toEqual([CARRIER]);
  });

  it("is still subject to the depth limit", () => {
    // translation happens at injection, so it cannot resurrect a skipped hint
    new BrowserKernel().tryPreload(MEMBER_A, 5);

    expect(hinted()).toEqual([]);
  });
});

describe("when the carrier cannot be known", () => {
  it("hints the url as given with no Federation loaded", () => {
    delete (globalThis as any).Federation;

    new BrowserKernel().tryPreload(MEMBER_A, 0);

    expect(hinted()).toEqual([MEMBER_A]);
  });

  it("hints the url as given against a Federation without the lookup", () => {
    (globalThis as any).Federation = { import: vi.fn() };

    new BrowserKernel().tryPreload(MEMBER_A, 0);

    expect(hinted()).toEqual([MEMBER_A]);
  });

  it("hints the url as given when the lookup throws", () => {
    (globalThis as any).Federation = {
      bundleUrlFor: () => {
        throw new Error("boom");
      },
    };

    new BrowserKernel().tryPreload(MEMBER_A, 0);

    expect(hinted()).toEqual([MEMBER_A]);
  });
});
