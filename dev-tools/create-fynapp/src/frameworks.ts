export const supportedFrameworks = ["react", "vue"] as const;

export type SupportedFramework = (typeof supportedFrameworks)[number];

export function assertSupportedFramework(value: string): asserts value is SupportedFramework {
  if (!supportedFrameworks.includes(value as SupportedFramework)) {
    throw new Error(
      `Unsupported framework: ${value}. Supported frameworks: ${supportedFrameworks.join(", ")}`,
    );
  }
}
