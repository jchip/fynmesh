import {
  assertCreationValuesAllowed,
  checkAppName,
  checkDirectoryName,
} from "../../src/app-config";

describe("create input inspections", () => {
  it("checks local identifier formats without validation terminology", () => {
    expect(checkAppName("test-app")).toBe(true);
    expect(checkDirectoryName("test-dir")).toBe(true);
    expect(checkAppName("Bad_Name")).toBe(
      "App name can only contain lowercase letters, numbers, and hyphens",
    );
    expect(() => assertCreationValuesAllowed("test-app", "../escape")).toThrow(
      "Directory name can only contain lowercase letters, numbers, and hyphens",
    );
  });
});
