"use client";

import { SettingsField } from "@/components/settings-field";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { updateAppName } from "./actions";

type UpdateState = { success: boolean; error?: string };

export default function UpdateSettingsForm({
    appId,
    name,
}: {
    appId: string;
    name: string;
}) {
    const [state, updateNameAction] = useActionState(updateAppName, {
        success: false,
    } as UpdateState);
    const [newName, setNewName] = useState(name);
    const router = useRouter();

    useEffect(() => {
        if (state.success) router.refresh();
    }, [router, state]);

    return (
        <SettingsField
            label="App name"
            htmlFor="new-app-name"
            className="sm:max-w-sm"
        >
            <form action={updateNameAction} className="flex items-center gap-2">
                <input
                    id="new-app-name"
                    className="settings-input"
                    name="newName"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    required
                />
                <input name="appId" value={appId} type="hidden" readOnly />
                <SubmitButton />
            </form>
            {state.error ? (
                <p
                    className="m-0 text-xs text-[color:var(--destructive)]"
                    role="alert"
                >
                    {String(state.error)}
                </p>
            ) : null}
            {state.success ? (
                <p
                    className="m-0 text-xs text-[color:var(--success)]"
                    role="status"
                >
                    App name saved.
                </p>
            ) : null}
        </SettingsField>
    );
}

function SubmitButton() {
    const status = useFormStatus();
    return (
        <button
            className="workspace-button"
            type="submit"
            disabled={status.pending}
        >
            {status.pending ? "Saving…" : "Save"}
        </button>
    );
}
