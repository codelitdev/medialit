import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * The pieces inside a SettingsCard, so every card uses one type scale and
 * one rhythm:
 * - fields are 20px apart (SettingsStack);
 * - a field's label, control and hint are 8px apart;
 * - labels are 12px semibold, option text and values 13px, hints 11px muted.
 */

/** Stacks a card's fields and its actions, 20px apart. */
export function SettingsStack({ children }: { children: ReactNode }) {
    return <div className="grid gap-5">{children}</div>;
}

const settingsLabelClass =
    "m-0 p-0 text-xs font-semibold leading-4 text-foreground";

/** Text next to a switch or checkbox. */
export const settingsOptionClass =
    "m-0 text-[13px] font-normal leading-5 text-foreground";

export function SettingsHint({
    id,
    children,
}: {
    id?: string;
    children: ReactNode;
}) {
    return (
        <p
            id={id}
            className="m-0 text-[11px] leading-normal text-muted-foreground"
        >
            {children}
        </p>
    );
}

/** A label, its control and an optional hint. */
export function SettingsField({
    label,
    htmlFor,
    hint,
    hintId,
    className,
    children,
}: {
    label: ReactNode;
    htmlFor?: string;
    hint?: ReactNode;
    hintId?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cn("grid gap-2", className)}>
            {htmlFor ? (
                <label htmlFor={htmlFor} className={settingsLabelClass}>
                    {label}
                </label>
            ) : (
                <span className={settingsLabelClass}>{label}</span>
            )}
            {children}
            {hint ? <SettingsHint id={hintId}>{hint}</SettingsHint> : null}
        </div>
    );
}

/** A group of checkboxes or switches under one label. */
export function SettingsFieldset({
    legend,
    hint,
    children,
}: {
    legend: ReactNode;
    hint?: ReactNode;
    children: ReactNode;
}) {
    return (
        <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className={cn(settingsLabelClass, "mb-2")}>{legend}</legend>
            {children}
            {hint ? <SettingsHint>{hint}</SettingsHint> : null}
        </fieldset>
    );
}

/** A label and description on the left, a control on the right, set off
 * from the content above by a rule (Default app, Danger zone). */
export function SettingsRow({
    label,
    description,
    children,
}: {
    label?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-border pt-4">
            <div className="grid min-w-0 max-w-[460px] gap-1">
                {label ? (
                    <span className={settingsLabelClass}>{label}</span>
                ) : null}
                {description ? (
                    <SettingsHint>{description}</SettingsHint>
                ) : null}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

/** A save or action result: an error, a success message, or nothing. */
export function SettingsStatus({
    error,
    success,
}: {
    error?: string | null;
    success?: ReactNode;
}) {
    if (error) {
        return (
            <p
                className="m-0 text-xs text-[color:var(--destructive)]"
                role="alert"
            >
                {error}
            </p>
        );
    }
    if (success) {
        return (
            <p
                className="m-0 text-xs text-[color:var(--success)]"
                role="status"
            >
                {success}
            </p>
        );
    }
    return null;
}
