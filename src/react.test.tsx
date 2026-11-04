import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InkBackground } from "./react";

describe("InkBackground", () => {
  it("renders a hidden layer with a canvas and the gradient fallback in the given colours", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container } = render(<InkBackground colors={{ paper: "rgb(1, 2, 3)" }} />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.style.position).toBe("fixed");
    expect(layer.style.pointerEvents).toBe("none");
    expect(layer.querySelector("canvas")).not.toBeNull();
    expect((layer.firstElementChild as HTMLElement).style.backgroundColor).toBe("rgb(1, 2, 3)");
  });

  it("can fill a positioned parent instead of the viewport", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container } = render(<InkBackground position="absolute" zIndex={0} />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer.style.position).toBe("absolute");
    expect(layer.style.zIndex).toBe("0");
  });
});
