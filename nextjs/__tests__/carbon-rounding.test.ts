import { describe, expect, it } from "vitest";
import { carbon2, ciCarbon2, creditTonnes, formatCarbon } from "@/lib/utils";

describe("carbon rounding", () => {
  it("keeps carbon to 2 decimals and guards float noise", () => {
    expect(carbon2(10.605)).toBe(10.61);
    expect(carbon2(0.1 + 0.2)).toBe(0.3);
    expect(carbon2(-1.005)).toBe(-1.01);
  });

  it("rounds CIs up to 2 decimals", () => {
    expect(ciCarbon2(1.231)).toBe(1.24);
    expect(ciCarbon2(1.23)).toBe(1.23);
    expect(ciCarbon2(-0.5)).toBe(0);
  });

  it("gain from rounded stocks adds up to what is shown", () => {
    const base = carbon2(10.604), now = carbon2(21.306);
    expect(carbon2(now - base)).toBe(10.71); // 21.31 − 10.60
  });

  it("prices credits as the 2-decimal total rounded down", () => {
    const total = carbon2(52.68 + 52.69); // 105.37
    expect(creditTonnes(total)).toBe(105);
    expect(creditTonnes(-3)).toBe(0);
  });

  it("formats with 2 decimals and separators", () => {
    expect(formatCarbon(1234.5)).toBe("1,234.50");
  });
});
