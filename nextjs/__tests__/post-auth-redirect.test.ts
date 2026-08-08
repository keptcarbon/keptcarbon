import { describe, it, expect } from "vitest";
import { sanitizePostAuthRedirect } from "@/lib/post-auth-redirect";

// The value feeds NextResponse.redirect in the OAuth callbacks, so anything
// that could escape our origin must be rejected (open-redirect guard).
describe("sanitizePostAuthRedirect", () => {
  it("accepts a plain same-site path", () => {
    expect(sanitizePostAuthRedirect("/map-draw")).toBe("/map-draw");
    expect(sanitizePostAuthRedirect("/my-plots?tab=1")).toBe("/my-plots?tab=1");
  });

  it("rejects empty / nullish values", () => {
    expect(sanitizePostAuthRedirect("")).toBeNull();
    expect(sanitizePostAuthRedirect(null)).toBeNull();
    expect(sanitizePostAuthRedirect(undefined)).toBeNull();
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(sanitizePostAuthRedirect("https://evil.com")).toBeNull();
    expect(sanitizePostAuthRedirect("//evil.com")).toBeNull();
  });

  it("rejects backslash escapes browsers treat as //", () => {
    expect(sanitizePostAuthRedirect("/\\evil.com")).toBeNull();
    expect(sanitizePostAuthRedirect("/foo\\bar")).toBeNull();
  });

  it("rejects control chars and whitespace smuggling", () => {
    expect(sanitizePostAuthRedirect("/foo\nbar")).toBeNull();
    expect(sanitizePostAuthRedirect("/foo bar")).toBeNull();
    expect(sanitizePostAuthRedirect("/\t/evil")).toBeNull();
  });
});
