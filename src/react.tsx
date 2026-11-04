"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { createInk, PALETTES, type Ink, type InkColors, type InkPresence } from "./index";

export { PALETTES, type InkColors, type InkPresence } from "./index";

export interface InkBackgroundProps {
  /** Colours to use; any left out come from `PALETTES.light`. Any CSS colour, including `var(--token)`. */
  colors?: Partial<InkColors>;
  /** Defaults to `calm`. */
  presence?: InkPresence;
  /** Draw one still frame instead of animating. */
  still?: boolean;
  /**
   * `fixed` (default) covers the viewport behind the page; `absolute` fills
   * the nearest positioned ancestor instead.
   */
  position?: "fixed" | "absolute";
  /** Stacking order of the layer. Defaults to -1, behind the page's content. */
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The ink as a background layer. Where WebGL is unavailable, a soft gradient
 * in the same colours shows instead.
 */
export function InkBackground({
  colors,
  presence = "calm",
  still = false,
  position = "fixed",
  zIndex = -1,
  className,
  style,
}: InkBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkRef = useRef<Ink | null>(null);
  // A new object every render must not restart the ink, so colours compare by value.
  const colorKey = JSON.stringify(colors ?? {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ink = createInk(canvas, { colors: JSON.parse(colorKey), presence, still });
    inkRef.current = ink;
    return () => {
      ink.destroy();
      inkRef.current = null;
    };
    // Colours and presence are applied in place below, without a restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  useEffect(() => inkRef.current?.setColors(JSON.parse(colorKey)), [colorKey]);
  useEffect(() => inkRef.current?.setPresence(presence), [presence]);

  const palette = { ...PALETTES.light, ...colors };
  const layer: CSSProperties = { position, inset: 0, width: "100%", height: "100%", pointerEvents: "none" };
  return (
    <div aria-hidden className={className} style={{ ...layer, zIndex, ...style }}>
      {/* Seen only when WebGL is unavailable or lost. */}
      <div
        style={{
          ...layer,
          position: "absolute",
          backgroundColor: palette.paper,
          backgroundImage:
            `radial-gradient(90% 70% at 85% 12%, ${palette.wash} 0%, transparent 60%),` +
            `radial-gradient(70% 60% at 8% 88%, ${palette.wash} 0%, transparent 55%)`,
        }}
      />
      <canvas ref={canvasRef} style={{ ...layer, position: "absolute", display: "block" }} />
    </div>
  );
}
