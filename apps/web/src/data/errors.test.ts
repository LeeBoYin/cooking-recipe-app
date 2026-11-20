import { describe, expect, it } from "vitest";
import { platformFromUserAgent, toErrorKind } from "./errors.ts";

describe("platformFromUserAgent", () => {
  it("認得 iPhone 與 Android，其他算桌機", () => {
    expect(platformFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(
      "ios",
    );
    expect(platformFromUserAgent("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
    expect(platformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
      "desktop",
    );
  });
});

describe("toErrorKind", () => {
  it("轉成小寫英數與底線，空的時候給 unknown", () => {
    expect(toErrorKind("Photo Upload Failed!")).toBe("photo_upload_failed");
    expect(toErrorKind("相片")).toBe("unknown");
    expect(toErrorKind("a".repeat(100))).toHaveLength(64);
  });
});
