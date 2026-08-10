import * as React from "react";

// CodeLit loader — vendored from @codelitdev/design-system's reference
// Loader component (not imported from the package root: that barrel pulls in
// every reference component and trips Turbopack's module resolution on this
// package). The draw-in animation itself (`cl-loader`/`cl-draw` keyframes)
// ships in the design system's components.css, already loaded globally via
// `@import "@codelitdev/design-system/styles.css"` in globals.css.
export interface LoaderProps {
    /** Which product mark to draw. Omit for the CodeLit house mark (amber). */
    product?: "codelit" | "courselit" | "medialit" | "sendlit" | "frontlit";
    /** Pixel size, square. Default 40. */
    size?: number;
    style?: React.CSSProperties;
}

const PATHS: Record<string, { d: string; transform?: string }[]> = {
    codelit: [
        {
            d: "M32,23 C27.8,19 27,12.4 32,9 C37,12.4 36.2,19 32,23 Z",
            transform: "translate(0,4.5)",
        },
        {
            d: "M32,23 C27.8,19 27,12.4 32,9 C37,12.4 36.2,19 32,23 Z",
            transform: "translate(0,4.5) rotate(120 32 32)",
        },
        {
            d: "M32,23 C27.8,19 27,12.4 32,9 C37,12.4 36.2,19 32,23 Z",
            transform: "translate(0,4.5) rotate(240 32 32)",
        },
    ],
    courselit: [
        { d: "M32,10 L38,28 L32,34 L26,28 Z" },
        { d: "M32,10 L38,28 L32,34 L26,28 Z", transform: "rotate(90 32 32)" },
        { d: "M32,10 L38,28 L32,34 L26,28 Z", transform: "rotate(180 32 32)" },
        { d: "M32,10 L38,28 L32,34 L26,28 Z", transform: "rotate(270 32 32)" },
    ],
    medialit: [
        { d: "M32,24 C28.8,19 28.8,13.5 32,10 C35.2,13.5 35.2,19 32,24 Z" },
        {
            d: "M32,24 C28.8,19 28.8,13.5 32,10 C35.2,13.5 35.2,19 32,24 Z",
            transform: "rotate(90 32 32)",
        },
        {
            d: "M32,24 C28.8,19 28.8,13.5 32,10 C35.2,13.5 35.2,19 32,24 Z",
            transform: "rotate(180 32 32)",
        },
        {
            d: "M32,24 C28.8,19 28.8,13.5 32,10 C35.2,13.5 35.2,19 32,24 Z",
            transform: "rotate(270 32 32)",
        },
    ],
    sendlit: [
        {
            d: "M32,32 C23,29.5 18.5,20.5 23,12.5 C26.5,17 26.5,24 31,26.5",
        },
        {
            d: "M32,32 C23,29.5 18.5,20.5 23,12.5 C26.5,17 26.5,24 31,26.5",
            transform: "rotate(120 32 32)",
        },
        {
            d: "M32,32 C23,29.5 18.5,20.5 23,12.5 C26.5,17 26.5,24 31,26.5",
            transform: "rotate(240 32 32)",
        },
    ],
    frontlit: [
        {
            d: "M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z",
            transform: "translate(41.19,22.81) rotate(45)",
        },
        {
            d: "M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z",
            transform: "translate(41.19,41.19) rotate(135)",
        },
        {
            d: "M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z",
            transform: "translate(22.81,41.19) rotate(225)",
        },
        {
            d: "M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z",
            transform: "translate(22.81,22.81) rotate(315)",
        },
    ],
};

const JOINED = new Set(["courselit", "medialit", "frontlit"]);
const SEND_STROKE_WIDTH = 2.6;

export function Loader({ product = "codelit", size = 40, style }: LoaderProps) {
    const paths = PATHS[product] ?? PATHS.codelit;
    const joined = JOINED.has(product);
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 64 64"
            role="status"
            aria-label="Loading"
            className={`cl-loader cl-loader--${product}`}
            style={style}
        >
            <g
                fill="none"
                stroke="currentColor"
                strokeWidth={product === "frontlit" ? 2.4 : SEND_STROKE_WIDTH}
                strokeLinejoin={joined ? "round" : undefined}
                strokeLinecap={joined ? undefined : "round"}
                transform={
                    product === "sendlit" ? "translate(-2,0)" : undefined
                }
            >
                {paths.map((p, i) => (
                    <path
                        key={i}
                        d={p.d}
                        transform={p.transform}
                        strokeDasharray={200}
                        className="cl-loader__path"
                    />
                ))}
            </g>
        </svg>
    );
}
