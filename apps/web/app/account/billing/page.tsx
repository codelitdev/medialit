import { getSubscriber } from "@/app/actions";
import { redirect } from "next/navigation";
import PricingPlans, { type BillingPlans } from "./pricing-plans";
import { serverApi } from "@/lib/server-api";

const Billing = async () => {
    const user = await getSubscriber();
    if (!user) {
        return redirect("/404");
    }
    if (user.plan === "oss") {
        return (
            <section className="settings-card billing-oss-card">
                <div>
                    <span className="cl-badge cl-badge--success">
                        <span className="cl-badge__dot" />
                        Active
                    </span>
                    <h2>Open source plan</h2>
                    <p className="settings-subtle">
                        This installation is unlocked. Storage and upload size
                        are not limited by a plan.
                    </p>
                </div>
                <div className="billing-oss-details">
                    <span>Storage</span>
                    <strong>Unlimited</strong>
                    <span>Maximum upload size</span>
                    <strong>Unlimited</strong>
                </div>
            </section>
        );
    }
    const response = await serverApi("/api/account/billing/plans");
    if (!response.ok) {
        throw new Error("Could not load billing plans");
    }
    const billing: BillingPlans = await response.json();
    return (
        <section id="pricing" className="mb-2">
            <PricingPlans user={user} billing={billing} />
        </section>
    );
};

export default Billing;
