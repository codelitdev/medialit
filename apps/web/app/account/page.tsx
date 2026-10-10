import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CreditCard, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { getSubscriber, getUser } from "@/app/actions";

export default async function AccountPage() {
    const [session, account, user] = await Promise.all([
        auth(),
        getSubscriber(),
        getUser(),
    ]);
    if (!session) redirect("/login?next=/account");
    if (!account) redirect("/login?next=/account");

    const planName =
        account.plan === "oss"
            ? "Open source"
            : account.plan === "pro"
              ? "Pro"
              : "Basic";
    const subscriptionStatus = account.subscription?.status;

    return (
        <>
            <div className="workspace-page-heading">
                <div>
                    <h1>Account settings</h1>
                    <p>
                        Profile and subscription details for your MediaLit
                        account.
                    </p>
                </div>
            </div>

            <div className="account-overview">
                <section className="settings-card">
                    <div className="settings-card-title">
                        <span className="settings-card-icon">
                            <UserRound aria-hidden="true" />
                        </span>
                        <div>
                            <h2>Profile</h2>
                            <p className="settings-subtle">
                                Account information used to sign in.
                            </p>
                        </div>
                    </div>
                    <div className="account-profile-details">
                        <span>Name</span>
                        <strong>{user?.name || "—"}</strong>
                        <span>Email</span>
                        <strong>{account.email}</strong>
                    </div>
                </section>

                <section className="settings-card">
                    <div className="settings-card-title">
                        <span className="settings-card-icon">
                            <CreditCard aria-hidden="true" />
                        </span>
                        <div>
                            <h2>Plan</h2>
                            <p className="settings-subtle">
                                Your plan sets storage and upload limits.
                            </p>
                        </div>
                    </div>
                    <div className="account-plan-row">
                        <div>
                            <span className="cl-badge cl-badge--default">
                                {planName}
                            </span>
                            {subscriptionStatus ? (
                                <span
                                    className={`cl-badge cl-badge--${subscriptionStatus === "past_due" ? "warning" : subscriptionStatus === "cancelling" ? "neutral" : "success"}`}
                                >
                                    {subscriptionStatus === "past_due"
                                        ? "Payment overdue"
                                        : subscriptionStatus === "cancelling"
                                          ? "Cancelling"
                                          : "Active"}
                                </span>
                            ) : null}
                        </div>
                        <Link
                            className="workspace-button secondary"
                            href="/account/billing"
                        >
                            Manage billing <ArrowUpRight aria-hidden="true" />
                        </Link>
                    </div>
                    {account.subscription?.paidThroughAt ? (
                        <p className="settings-subtle account-paid-through">
                            Access continues through{" "}
                            {new Date(
                                account.subscription.paidThroughAt,
                            ).toLocaleDateString()}
                            .
                        </p>
                    ) : null}
                </section>
            </div>
        </>
    );
}
