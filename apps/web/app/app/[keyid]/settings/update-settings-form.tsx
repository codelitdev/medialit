"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { updateAppName } from "./actions";

type UpdateState = { success: boolean; error?: string };

export default function UpdateSettingsForm({
    keyId,
    name,
}: {
    keyId: string;
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
        <div className="settings-field">
            <label htmlFor="new-app-name">App name</label>
            <form action={updateNameAction} className="settings-control-row">
                <input
                    id="new-app-name"
                    className="settings-input"
                    name="newName"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    required
                />
                <input name="keyId" value={keyId} type="hidden" readOnly />
                <SubmitButton />
            </form>
            {state.error ? (
                <p className="inline-error" role="alert">
                    {String(state.error)}
                </p>
            ) : null}
            {state.success ? (
                <p className="inline-feedback" role="status">
                    App name saved.
                </p>
            ) : null}
        </div>
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
