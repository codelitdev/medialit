import type { ReactNode } from "react";
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
    children,
}: {
    icon: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    tone?: "default" | "danger";
    children: ReactNode;
}) {
    return (
        <section
            className={cn(
                "settings-card",
                tone === "danger" && "settings-card-danger",
            )}
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
            {/* The card owns the gap under its header, so content doesn't
                have to bring its own top margin. */}
            <div className="mt-4 [&>*:first-child]:mt-0">{children}</div>
        </section>
    );
}
