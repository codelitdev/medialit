import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// CodeLit badge — mirrors the design system's `.cl-badge` spec: a rounded pill on a
// soft color wash. Set `dot` for a leading status dot in the current text color.
// Soft washes resolve from design-system tokens (@codelitdev/design-system/styles.css).
const badgeVariants = cva(
    "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold [&>svg]:pointer-events-none [&>svg]:size-3",
    {
        variants: {
            variant: {
                default: "bg-[var(--primary-soft)] text-primary",
                neutral: "bg-muted text-muted-foreground",
                success: "bg-[var(--success-soft)] text-[#1f6b35]",
                warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
                destructive: "bg-[var(--destructive-soft)] text-destructive",
                outline:
                    "text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
);

function Badge({
    className,
    variant,
    dot = false,
    children,
    ...props
}: React.ComponentProps<"span"> &
    VariantProps<typeof badgeVariants> & {
        dot?: boolean;
    }) {
    return (
        <span
            data-slot="badge"
            className={cn(badgeVariants({ variant, className }))}
            {...props}
        >
            {dot && (
                <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-current"
                />
            )}
            {children}
        </span>
    );
}

export { Badge, badgeVariants };
