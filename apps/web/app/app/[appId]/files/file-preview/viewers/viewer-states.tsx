"use client";

import { FileWarning } from "lucide-react";
import { Loader } from "@codelitdev/design-system";
import { Button } from "@/components/ui/button";

/* Shared loading and error states so every native viewer looks the same. */
export function ViewerLoading() {
    return (
        <span
            className="absolute inset-0 grid place-items-center text-primary"
            role="status"
        >
            <Loader product="medialit" size={96} />
            <span className="visually-hidden">Loading preview</span>
        </span>
    );
}

export function ViewerMessage({
    title,
    description,
    onRetry,
}: {
    title: string;
    description?: string;
    onRetry?: () => void;
}) {
    return (
        <div
            className="absolute inset-0 grid place-items-center p-6 text-center"
            role="alert"
        >
            <div className="flex max-w-xs flex-col items-center gap-3">
                <FileWarning
                    className="h-10 w-10 text-primary"
                    aria-hidden="true"
                />
                <p className="m-0 font-medium">{title}</p>
                {description ? (
                    <p className="m-0 text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
                {onRetry ? (
                    <Button variant="outline" size="sm" onClick={onRetry}>
                        Try again
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
