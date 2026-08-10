import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// CodeLit icon-only button — mirrors `.cl-iconbtn`. Square, for toolbars, table
// rows, and headers. Always pass an accessible name via `aria-label`.
const iconButtonVariants = cva(
    "inline-flex items-center justify-center rounded-[var(--radius)] border border-transparent bg-transparent text-muted-foreground outline-none transition-[background-color,color] hover:bg-muted hover:text-foreground focus-visible:shadow-[var(--shadow-focus)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                ghost: "",
                outline: "border-input",
            },
            size: {
                sm: "size-7 [&_svg:not([class*='size-'])]:size-4",
                md: "size-[34px] [&_svg:not([class*='size-'])]:size-[18px]",
            },
        },
        defaultVariants: {
            variant: "ghost",
            size: "md",
        },
    },
);

function IconButton({
    className,
    variant,
    size,
    asChild = false,
    ...props
}: React.ComponentProps<"button"> &
    VariantProps<typeof iconButtonVariants> & {
        asChild?: boolean;
    }) {
    const Comp = asChild ? Slot.Root : "button";

    return (
        <Comp
            data-slot="icon-button"
            className={cn(iconButtonVariants({ variant, size, className }))}
            {...props}
        />
    );
}

export { IconButton, iconButtonVariants };
