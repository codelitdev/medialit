import { Loader } from "@/components/ui/codelit/loader";
import { cn } from "@/lib/utils";

/** Standard "loading" state — the design system's animated MediaLit mark. */
export function Loading({ className }: { className?: string }) {
    return (
        <p
            className={cn(
                "flex items-center gap-2 text-sm text-muted-foreground",
                className,
            )}
        >
            <span className="text-primary">
                <Loader product="medialit" size={16} />
            </span>
            Loading…
        </p>
    );
}
