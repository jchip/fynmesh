import { shouldEmitSourceMap } from "../../src/build-env";

describe("shouldEmitSourceMap", () => {
  it("emits maps for a development build", () => {
    expect(shouldEmitSourceMap({})).toBe(true);
    expect(shouldEmitSourceMap({ NODE_ENV: "development" })).toBe(true);
    expect(shouldEmitSourceMap({ NODE_ENV: "test" })).toBe(true);
  });

  it("skips maps for a production build", () => {
    expect(shouldEmitSourceMap({ NODE_ENV: "production" })).toBe(false);
  });

  it("puts maps back when FYNMESH_SOURCEMAP asks for them", () => {
    expect(shouldEmitSourceMap({ NODE_ENV: "production", FYNMESH_SOURCEMAP: "1" })).toBe(true);
    expect(shouldEmitSourceMap({ NODE_ENV: "production", FYNMESH_SOURCEMAP: "true" })).toBe(true);
  });

  it("takes maps away when FYNMESH_SOURCEMAP declines them", () => {
    expect(shouldEmitSourceMap({ FYNMESH_SOURCEMAP: "0" })).toBe(false);
    expect(shouldEmitSourceMap({ NODE_ENV: "development", FYNMESH_SOURCEMAP: "false" })).toBe(false);
    expect(shouldEmitSourceMap({ NODE_ENV: "development", FYNMESH_SOURCEMAP: "FALSE" })).toBe(false);
  });

  it("ignores an empty override and falls back to NODE_ENV", () => {
    expect(shouldEmitSourceMap({ NODE_ENV: "production", FYNMESH_SOURCEMAP: "" })).toBe(false);
    expect(shouldEmitSourceMap({ NODE_ENV: "development", FYNMESH_SOURCEMAP: "" })).toBe(true);
  });
});
