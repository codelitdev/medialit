import type { Config } from "tailwindcss";
import codelitPreset from "@codelitdev/design-system/tailwind-preset";

const config = {
    presets: [codelitPreset],
    darkMode: ["class"],
    content: [
        "./pages/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
        "./app/**/*.{ts,tsx}",
        "./src/**/*.{ts,tsx}",
    ],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
            /* Markdown previews use the design system's colours and fonts. */
            typography: {
                DEFAULT: {
                    css: {
                        "--tw-prose-body": "var(--foreground)",
                        "--tw-prose-headings": "var(--foreground)",
                        "--tw-prose-lead": "var(--muted-foreground)",
                        "--tw-prose-links": "var(--primary)",
                        "--tw-prose-bold": "var(--foreground)",
                        "--tw-prose-counters": "var(--muted-foreground)",
                        "--tw-prose-bullets": "var(--muted-foreground)",
                        "--tw-prose-hr": "var(--border)",
                        "--tw-prose-quotes": "var(--foreground)",
                        "--tw-prose-quote-borders": "var(--border)",
                        "--tw-prose-captions": "var(--muted-foreground)",
                        "--tw-prose-code": "var(--foreground)",
                        "--tw-prose-pre-code": "var(--foreground)",
                        "--tw-prose-pre-bg": "var(--muted)",
                        "--tw-prose-th-borders": "var(--border)",
                        "--tw-prose-td-borders": "var(--border)",
                        "code, pre": { fontFamily: "var(--font-mono)" },
                        "code::before": { content: "none" },
                        "code::after": { content: "none" },
                        ":not(pre) > code": {
                            padding: "0.15em 0.35em",
                            borderRadius: "0.3rem",
                            backgroundColor: "var(--muted)",
                            fontWeight: "500",
                        },
                        pre: { border: "1px solid var(--border)" },
                        img: { borderRadius: "0.5rem" },
                        "blockquote p:first-of-type::before": {
                            content: "none",
                        },
                        "blockquote p:last-of-type::after": {
                            content: "none",
                        },
                        // GFM task lists show a checkbox, not a bullet.
                        "ul.contains-task-list": {
                            listStyle: "none",
                            paddingInlineStart: "0",
                        },
                        "li.task-list-item": { paddingInlineStart: "0" },
                        "li.task-list-item input": {
                            marginTop: "0",
                            marginRight: "0.5em",
                            accentColor: "var(--primary)",
                        },
                    },
                },
            },
        },
    },
    plugins: [
        require("tailwindcss-animate"),
        require("@tailwindcss/typography"),
    ],
} satisfies Config;

export default config;
