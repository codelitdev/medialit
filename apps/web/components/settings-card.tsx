import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A card on a settings page: an icon, a title and a description, then the
 * card's content. The icon is centered on the title and description
 * together, so every card's header lines up the same way.
 */
export function SettingsCard({
    icon,
    title,
    description,
    tone = "default",
    className,
    children,
    ...props
}: Omit<ComponentPropsWithoutRef<"section">, "title"> & {
    icon: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    tone?: "default" | "danger";
}) {
    return (
        <section
            className={cn(
                "settings-card",
                tone === "danger" && "settings-card-danger",
                className,
            )}
            {...props}
        >
            <div className="flex items-center gap-3">
                <span
                    className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-[9px] [&_svg]:size-4",
                        tone === "danger"
                            ? "bg-[var(--destructive-soft)] text-destructive"
                            : "bg-muted text-muted-foreground",
                    )}
                >
                    {icon}
                </span>
                <div className="min-w-0">
                    <h2 className="m-0 text-[15px] font-[650] leading-5">
                        {title}
                    </h2>
                    {description ? (
                        <p className="m-0 mt-0.5 text-[11px] leading-normal text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>
            </div>
            {children}
        </section>
    );
}
