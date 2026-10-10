"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { makeDefaultApp } from "./actions";

type DefaultAppState = { success: boolean; error?: string };

export default function DefaultAppControl({
    keyId,
    isDefault,
}: {
    keyId: string;
    isDefault: boolean;
}) {
    const [state, action] = useActionState(makeDefaultApp, {
        success: false,
    } as DefaultAppState);
    const router = useRouter();

    useEffect(() => {
        if (state.success) router.refresh();
    }, [router, state]);

    return (
        <div className="settings-default-control">
            <form action={action}>
                <input name="keyId" value={keyId} type="hidden" readOnly />
                <SubmitButton isDefault={isDefault} />
            </form>
            {state.error ? (
                <p className="inline-error" role="alert">
                    {state.error}
                </p>
            ) : null}
        </div>
    );
}

function SubmitButton({ isDefault }: { isDefault: boolean }) {
    const status = useFormStatus();
    return (
        <button
            className={`workspace-button${isDefault ? " secondary" : ""}`}
            type="submit"
            disabled={status.pending || isDefault}
            aria-pressed={isDefault}
        >
            {isDefault ? <Check aria-hidden="true" /> : null}
            {status.pending
                ? "Saving…"
                : isDefault
                  ? "Default app"
                  : "Make default"}
        </button>
    );
}
