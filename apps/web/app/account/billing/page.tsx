import { getSubscriber } from "@/app/actions";
import { redirect } from "next/navigation";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import PricingPlans, { type BillingPlans } from "./pricing-plans";
import { serverApi } from "@/lib/server-api";

const Billing = async () => {
    const user = await getSubscriber();
    if (!user) {
        return redirect("/404");
    }
    if (user.plan === "oss") {
        return (
            <section id="pricing" className="mb-2">
                <p className="text-muted-foreground mb-4">
                    This installation is unlocked. Storage and upload size are
                    not limited by a plan.
                </p>
                <Card className="border-primary">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold">
                            OSS
                        </CardTitle>
                        <CardDescription>
                            Full access, with no checkout.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-slate-700">
                            Unlimited storage and file size.
                        </p>
                    </CardContent>
                </Card>
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
            <p className="text-muted-foreground mb-4">
                Leave all your upload woes to us! We take care of your file
                uploads so that you focus on your users.
            </p>

            <PricingPlans user={user} billing={billing} />
        </section>
    );
};

export default Billing;
