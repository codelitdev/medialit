import React, { ReactNode } from "react";
import { CheckIcon } from "@radix-ui/react-icons";
import CancelSubscriptionButton from "./cancel-subscription-button";
import DodoCheckoutButton from "./dodo-checkout-button";
import ResumeSubscriptionButton from "./resume-subscription-button";
import { getSubscriber } from "@/app/actions";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

const pricingPlans = [
    {
        name: "Basic",
        description: "Get started for free",
        price: 0,
        icon: <CheckIcon className="h-4 w-4 text-primary" />,
        features: [
            "1 GB of storage",
            "50 MB maximum file size",
            "Unlimited upload and download",
            "Private files",
        ],
        isSecondary: true,
    },
    {
        name: "Pro",
        description: "More storage for teams that want more",
        price: 10,
        yearlyPrice: 100,
        icon: <CheckIcon className="h-4 w-4 text-primary" />,
        features: [
            "Everything in the Basic plan",
            "100 GB of storage",
            "2 GB maximum file size",
        ],
    },
];

interface PricingPaneProps {
    name: string;
    description: string;
    price: number;
    yearlyPrice?: number;
    icon: ReactNode;
    features: string[];
    isSecondary?: boolean;
}

const PricingPane = async ({
    name,
    description,
    price,
    yearlyPrice,
    icon,
    features,
    isSecondary = false,
}: PricingPaneProps) => {
    const user = await getSubscriber();

    if (!user) {
        return redirect("/404");
    }
    const current = user.plan === name.toLowerCase();

    return (
        <Card
            className={`${isSecondary ? "border-muted" : "border-primary"} flex flex-col h-full`}
        >
            <CardHeader>
                <CardTitle className="text-2xl font-bold">{name}</CardTitle>
                <CardDescription>{description}</CardDescription>
                <div className="py-2">
                    <div>
                        <span className="text-3xl font-bold">${price}</span>
                        <span className="text-muted-foreground">/month</span>
                    </div>
                    {yearlyPrice != null && (
                        <div className="mt-1">
                            <span className="text-3xl font-bold">
                                ${yearlyPrice}
                            </span>
                            <span className="text-muted-foreground">/year</span>
                            <p className="text-sm text-muted-foreground">
                                2 months free
                            </p>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="flex-grow">
                <div className="space-y-2">
                    {features.map((feature) => (
                        <div
                            key={feature}
                            className="flex items-center gap-2 text-slate-700 text-sm"
                        >
                            {icon}
                            <p>{feature}</p>
                        </div>
                    ))}
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 mt-auto">
                {name === "Basic" && current && (
                    <Button
                        disabled
                        className="w-full bg-white hover:bg-white text-muted-foreground border border-muted-foreground justify-center"
                    >
                        Current plan
                    </Button>
                )}
                {name === "Pro" && user.plan === "basic" && (
                    <>
                        <DodoCheckoutButton
                            mode="checkout"
                            interval="month"
                            className="w-full"
                        >
                            Subscribe monthly
                        </DodoCheckoutButton>
                        <DodoCheckoutButton
                            mode="checkout"
                            interval="year"
                            className="w-full"
                        >
                            Subscribe yearly
                        </DodoCheckoutButton>
                    </>
                )}
                {name === "Pro" &&
                    user.plan === "pro" &&
                    user.subscriptionMethod === "dodo" && (
                        <DodoCheckoutButton mode="portal" className="w-full">
                            Manage billing
                        </DodoCheckoutButton>
                    )}
                {name === "Pro" &&
                    ["subscribed", "paused"].includes(
                        user.subscriptionStatus,
                    ) && (
                        <CancelSubscriptionButton
                            currentPlan={name}
                            subscriptionStatus={user.subscriptionStatus}
                            className="w-full"
                        />
                    )}
                {name === "Pro" && user.subscriptionStatus === "cancelled" && (
                    <ResumeSubscriptionButton
                        currentPlan={name}
                        subscriptionStatus={user.subscriptionStatus}
                        expiresAt={user.subscriptionEndsAfter}
                        className="w-full"
                    />
                )}
            </CardFooter>
        </Card>
    );
};

const Billing = async () => {
    const user = await getSubscriber();
    if (user?.plan === "oss") {
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
    return (
        <section id="pricing" className="mb-2">
            <p className="text-muted-foreground mb-4">
                Leave all your upload woes to us! We take care of your file
                uploads so that you focus on your users.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pricingPlans.map((pricingPlan) => (
                    <PricingPane key={pricingPlan.name} {...pricingPlan} />
                ))}
            </div>
        </section>
    );
};

export default Billing;
