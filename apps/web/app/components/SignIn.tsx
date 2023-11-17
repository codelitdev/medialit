"use client";

import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

const signinErrors: Record<Lowercase<any>, string> = {
    default: "Unable to sign in.",
    signin: "Try signing in with a different account.",
    oauthsignin: "Try signing in with a different account.",
    oauthcallbackerror: "Try signing in with a different account.",
    oauthcreateaccount: "Try signing in with a different account.",
    emailcreateaccount: "Try signing in with a different account.",
    callback: "Try signing in with a different account.",
    oauthaccountnotlinked:
        "To confirm your identity, sign in with the same account you used originally.",
    emailsignin: "The e-mail could not be sent.",
    credentialssignin:
        "Sign in failed. Check the details you provided are correct.",
    sessionrequired: "Please sign in to access this page.",
};

export default function SignIn(props: any) {
    const { error: errorType } = props;
    const [showCode, setShowCode] = useState(false);
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const searchParams = useSearchParams();
    const callbackUrlValue = searchParams.get("callbackUrl");
    const { data: session, status } = useSession();

    const error =
        errorType &&
        (signinErrors[errorType.toLowerCase() as Lowercase<any>] ??
            signinErrors.default);

    const checkToken = async function (e: FormEvent) {
        e.preventDefault();
        const url = `/api/auth/code/generate?email=${encodeURIComponent(
            email
        )}${
            callbackUrlValue
                ? `&callbackUrl=${encodeURIComponent(callbackUrlValue)}`
                : ""
        }`;
        const response = await fetch(url);
        if (response.ok) {
            setShowCode(true);
        } else {
            await response.json();
        }
    };

    const signInUser = async function (e: FormEvent) {
        e.preventDefault();
        signIn("credentials", {
            email,
            code,
        });
    };

    return (
        <div>
            {error && (
                <div className="error">
                    <p>{error}</p>
                </div>
            )}

            {!showCode && !session && (
                <form
                    onSubmit={checkToken}
                    className="min-h-screen mt-[-100px] flex flex-col justify-center items-center gap-2"
                >
                    <input
                        type="email" 
                        name="email"
                        value={email}
                        placeholder="Enter your email"
                        required
                        className="p-2 border rounded focus:outline-none focus:border-[#8B8B8B]"
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <button
                        type="submit"
                        className="bg-[#000000] hover:bg-[#333333] w-20 h-8 font-normal text-sm text-[#FFFFFF] text-center rounded transition duration-300"
                    >
                        Get Code
                    </button>
                </form>
            )}

            {showCode && (
                <form
                    onSubmit={signInUser}
                    className="min-h-screen mt-[-100px] flex flex-col items-center gap-2 justify-center text-center"
                >
                    Enter the code sent to {email}
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="p-2 border rounded focus:outline-none focus:border-[#8B8B8B]"
                    />
                    <button
                        type="submit"
                        className="bg-[#000000] hover:bg-[#333333] w-20 h-8 font-normal text-sm text-[#FFFFFF] text-center rounded transition duration-300"
                    >
                        Login
                    </button>
                </form>
            )}
        </div>
    );
}
