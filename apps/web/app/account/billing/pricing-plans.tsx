"use client";

import { useState } from "react";
import { CheckIcon } from "@radix-ui/react-icons";
import CancelSubscriptionButton from "./cancel-subscription-button";
import BillingButton from "./billing-button";
import ResumeSubscriptionButton from "./resume-subscription-button";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { getSubscriber } from "@/app/actions";

type Interval = "month" | "year";
type Subscriber = NonNullable<Awaited<ReturnType<typeof getSubscriber>>>;
type Limits = { storageBytes: number; maxUploadBytes: number };

/** Shape of GET /api/account/billing/plans. */
export type BillingPlans = {
    checkoutAvailable: boolean;
    currency: string | null;
    plans: {
        basic: { limits: Limits };
        pro: {
            prices: { month: number; year: number } | null;
            limits: Limits;
        };
    };
};

type Plan = {
    name: "Basic" | "Pro";
    description: string;
    /** Minor units per interval, or null when Pro cannot be bought. */
    prices: { month: number; year: number } | null;
    features: string[];
    isSecondary: boolean;
};

function formatBytes(bytes: number): string {
    const gb = bytes / 1024 ** 3;
    if (gb >= 1) return `${Number(gb.toFixed(1))} GB`;
    return `${Number((bytes / 1024 ** 2).toFixed(1))} MB`;
}

function formatPrice(amountMinor: number, currency: string): string {
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    }).format(amountMinor / 100);
}

function plansFrom(billing: BillingPlans): Plan[] {
    const { basic, pro } = billing.plans;
    return [
        {
            name: "Basic",
            description: "Get started for free",
            prices: { month: 0, year: 0 },
            features: [
                `${formatBytes(basic.limits.storageBytes)} of storage`,
                `${formatBytes(basic.limits.maxUploadBytes)} maximum file size`,
                "Unlimited upload and download",
                "Private files",
            ],
            isSecondary: true,
        },
        {
            name: "Pro",
            description: "More storage for teams that want more",
            prices: pro.prices,
            features: [
                "Everything in the Basic plan",
                `${formatBytes(pro.limits.storageBytes)} of storage`,
                `${formatBytes(pro.limits.maxUploadBytes)} maximum file size`,
            ],
            isSecondary: false,
        },
    ];
}

/** Whole months saved by paying yearly, or 0. */
function monthsFree(prices: { month: number; year: number } | null): number {
    if (!prices || prices.month <= 0) return 0;
    return Math.max(
        0,
        Math.round((prices.month * 12 - prices.year) / prices.month),
    );
}

function PricingPane({
    plan,
    interval,
    currency,
    checkoutAvailable,
    user,
}: {
    plan: Plan;
    interval: Interval;
    currency: string;
    checkoutAvailable: boolean;
    user: Subscriber;
}) {
    const { name, description, prices, features, isSecondary } = plan;
    const current = user.plan === name.toLowerCase();

    return (
        <Card
            className={`${isSecondary ? "border-muted" : "border-primary"} flex flex-col h-full`}
        >
            <CardHeader>
                <CardTitle className="text-2xl font-bold">{name}</CardTitle>
                <CardDescription>{description}</CardDescription>
                <div className="py-2">
                    {prices ? (
                        <>
                            <span className="text-3xl font-bold">
                                {formatPrice(prices[interval], currency)}
                            </span>
                            <span className="text-muted-foreground">
                                /{interval}
                            </span>
                        </>
                    ) : (
                        <span className="text-muted-foreground">
                            Not available right now
                        </span>
                    )}
                </div>
            </CardHeader>
            <CardContent className="flex-grow">
                <div className="space-y-2">
                    {features.map((feature) => (
                        <div
                            key={feature}
                            className="flex items-center gap-2 text-foreground text-sm"
                        >
                            <CheckIcon className="h-4 w-4 text-primary" />
                            <p>{feature}</p>
                        </div>
                    ))}
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 mt-auto">
                {name === "Basic" && current && (
                    <Button
                        disabled
                        variant="secondary"
                        className="w-full justify-center"
                    >
                        Current plan
                    </Button>
                )}
                {name === "Pro" &&
                    user.plan === "basic" &&
                    checkoutAvailable && (
                        <BillingButton
                            mode="checkout"
                            interval={interval}
                            className="w-full"
                        >
                            {interval === "year"
                                ? "Subscribe yearly"
                                : "Subscribe monthly"}
                        </BillingButton>
                    )}
                {name === "Pro" && user.subscription && (
                    <BillingButton mode="portal" className="w-full">
                        Manage billing
                    </BillingButton>
                )}
                {name === "Pro" &&
                    user.subscription &&
                    user.subscription.status !== "cancelling" && (
                        <CancelSubscriptionButton className="w-full" />
                    )}
                {name === "Pro" &&
                    user.subscription?.status === "cancelling" && (
                        <ResumeSubscriptionButton
                            paidThroughAt={user.subscription.paidThroughAt}
                            className="w-full"
                        />
                    )}
            </CardFooter>
        </Card>
    );
}

export default function PricingPlans({
    user,
    billing,
}: {
    user: Subscriber;
    billing: BillingPlans;
}) {
    const [interval, setBillingInterval] = useState<Interval>("month");
    const plans = plansFrom(billing);
    const currency = billing.currency ?? "USD";
    const yearlySaving = monthsFree(billing.plans.pro.prices);

    return (
        <>
            {billing.plans.pro.prices && (
                <Tabs
                    value={interval}
                    onValueChange={(value) =>
                        setBillingInterval(value as Interval)
                    }
                    className="mb-4"
                >
                    <TabsList>
                        <TabsTrigger value="month">Monthly</TabsTrigger>
                        <TabsTrigger value="year">
                            Yearly
                            {yearlySaving > 0 && (
                                <span className="ml-2 text-xs text-primary">
                                    {yearlySaving === 1
                                        ? "1 month free"
                                        : `${yearlySaving} months free`}
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plans.map((plan) => (
                    <PricingPane
                        key={plan.name}
                        plan={plan}
                        interval={interval}
                        currency={currency}
                        checkoutAvailable={billing.checkoutAvailable}
                        user={user}
                    />
                ))}
            </div>
        </>
    );
}
