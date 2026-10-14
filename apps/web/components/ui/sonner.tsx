"use client";

import { useTheme } from "next-themes";
import {
    CircleCheckIcon,
    InfoIcon,
    Loader2Icon,
    OctagonXIcon,
    TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps["theme"]}
            className="toaster group"
            icons={{
                success: (
                    <CircleCheckIcon
                        className="size-4"
                        style={{ color: "var(--success)" }}
                    />
                ),
                info: (
                    <InfoIcon
                        className="size-4"
                        style={{ color: "var(--primary)" }}
                    />
                ),
                warning: (
                    <TriangleAlertIcon
                        className="size-4"
                        style={{ color: "var(--warning)" }}
                    />
                ),
                error: (
                    <OctagonXIcon
                        className="size-4"
                        style={{ color: "var(--destructive)" }}
                    />
                ),
                loading: (
                    <Loader2Icon
                        className="size-4 animate-spin"
                        style={{ color: "var(--muted-foreground)" }}
                    />
                ),
            }}
            style={
                {
                    "--normal-bg": "var(--popover)",
                    "--normal-text": "var(--popover-foreground)",
                    "--normal-border": "var(--border)",
                    "--border-radius": "var(--radius)",
                } as React.CSSProperties
            }
            {...props}
        />
    );
};

export { Toaster };
