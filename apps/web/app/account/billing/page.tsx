import React, { ReactNode } from "react";
import { CheckIcon } from "@radix-ui/react-icons";
import {
    LEMONSQUEEZY_STORE_ID,
    LEMONSQUEEZY_PRODUCT_ID,
} from "@/lib/constants";
import CancelSubscriptionButton from "./cancel-subscription-button";
import LemonSqueezyStartSubscriptionButton from "./lemonsqueezy-start-subscription-button";
import ResumeSubscriptionButton from "./resume-subscription-button";
import { auth } from "@/auth";
import { getSubscriber } from "@/app/actions";
import { redirect } from "next/navigation";
import { User } from "@medialit/models";
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
    icon: ReactNode;
    features: string[];
    isSecondary?: boolean;
}

const PricingPane = async ({
    name,
    description,
    price,
    icon,
    features,
    isSecondary = false,
}: PricingPaneProps) => {
    const session = await auth();
    const user: User | null = await getSubscriber();

    if (!user) {
        return redirect("/404");
    }

    return (
        <Card
            className={`${isSecondary ? "border-muted" : "border-primary"} flex flex-col h-full`}
        >
            <CardHeader>
                <CardTitle className="text-2xl font-bold">{name}</CardTitle>
                <CardDescription>{description}</CardDescription>
                <div className="py-2">
                    <span className="text-3xl font-bold">${price}</span>
                    <span className="text-muted-foreground">/month</span>
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
                {name === "Basic"
                    ? ["not-subscribed", "expired"].includes(
                          user.subscriptionStatus,
                      ) && (
                          <>
                              {LEMONSQUEEZY_STORE_ID &&
                                  LEMONSQUEEZY_PRODUCT_ID && (
                                      <LemonSqueezyStartSubscriptionButton
                                          session={session}
                                          storeId={LEMONSQUEEZY_STORE_ID}
                                          productId={LEMONSQUEEZY_PRODUCT_ID}
                                          userId={user.userId}
                                          subscriptionStatus={
                                              user.subscriptionStatus
                                          }
                                          currentPlan={name}
                                          className={
                                              isSecondary
                                                  ? "pointer-events-none w-full bg-white hover:bg-white !text-muted-foreground border border-muted-foreground justify-center"
                                                  : "w-full"
                                          }
                                      >
                                          {user.subscriptionStatus ===
                                          "not-subscribed"
                                              ? "Current plan"
                                              : "Downgrade to free"}
                                      </LemonSqueezyStartSubscriptionButton>
                                  )}
                          </>
                      )
                    : ["not-subscribed", "expired"].includes(
                          user.subscriptionStatus,
                      ) && (
                          <>
                              {LEMONSQUEEZY_STORE_ID &&
                                  LEMONSQUEEZY_PRODUCT_ID && (
                                      <LemonSqueezyStartSubscriptionButton
                                          session={session}
                                          storeId={LEMONSQUEEZY_STORE_ID}
                                          productId={LEMONSQUEEZY_PRODUCT_ID}
                                          userId={user.userId}
                                          subscriptionStatus={
                                              user.subscriptionStatus
                                          }
                                          className="w-full"
                                      >
                                          Subscribe
                                      </LemonSqueezyStartSubscriptionButton>
                                  )}
                          </>
                      )}

                {["subscribed", "paused"].includes(user.subscriptionStatus) && (
                    <CancelSubscriptionButton
                        currentPlan={name}
                        subscriptionStatus={user.subscriptionStatus}
                        className="w-full"
                    />
                )}

                {user.subscriptionStatus === "cancelled" && (
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
