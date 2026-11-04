import { describe, expect, it, vi } from "vitest";
import { FRAG } from "./shader";
import { createInk, PALETTES } from "./index";

describe("createInk", () => {
  it("leaves the canvas alone and reports it when WebGL is unavailable", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(null);
    const ink = createInk(canvas);
    expect(ink.supported).toBe(false);
    expect(() => {
      ink.setColors({ body: "red" });
      ink.setPresence("full");
      ink.destroy();
    }).not.toThrow();
    expect(canvas.width).toBe(300);
  });
});

describe("the shader", () => {
  it("takes every palette slot as a uniform", () => {
    for (const slot of Object.keys(PALETTES.light)) expect(FRAG).toContain(`uniform vec3  u_${slot};`);
  });

  it("reacts to nothing but time", () => {
    const uniforms = [...FRAG.matchAll(/^uniform \w+\s+(\w+);/gm)].map((m) => m[1]);
    expect(uniforms.filter((u) => !/^u_(paper|wash|body|deep|core)$/.test(u))).toEqual(["u_res", "u_time", "u_mask"]);
  });
});

describe("PALETTES", () => {
  it("fills all five slots in both themes", () => {
    for (const palette of Object.values(PALETTES)) expect(Object.keys(palette).sort()).toEqual(["body", "core", "deep", "paper", "wash"]);
  });
});
