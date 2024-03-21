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

const pricingPlans = [
    {
        name: "Basic",
        description: "Get started for free",
        price: 0,
        icon: <CheckIcon />,
        features: [
            "1 GB of storage",
            "Unlimited upload/download",
            "Private files",
            "500 MB maximum file size",
        ],
        isSecondary: true,
    },
    {
        name: "Pro",
        description: "More storage for teams that want more",
        price: 10,
        icon: <CheckIcon />,
        features: ["Everything in the Basic plan", "100 GB of storage"],
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
        <div className=" p-4 w-full md:w-[49%] h-80 border border-[#8B8B8B] rounded flex flex-col justify-between mb-[2%]">
            <div>
                <h6 className="text-primary text-lg font-semibold">{name}</h6>
                <p className="text-muted-foreground">{description}</p>
                <div className="py-4">
                    <span className="text-primary font-bold">&#36;{price}</span>
                    <span className="text-[#6B6666] font-bold"> /month</span>
                </div>
                <div>
                    {features.map((feature) => (
                        <div
                            key={feature}
                            className="flex gap-2 items-center mb-1"
                        >
                            {icon}
                            <p>{feature}</p>
                        </div>
                    ))}
                </div>
            </div>

            {name === "Basic"
                ? ["not-subscribed", "expired"].includes(
                      user.subscriptionStatus
                  ) && (
                      <>
                          {LEMONSQUEEZY_STORE_ID && LEMONSQUEEZY_PRODUCT_ID && (
                              <LemonSqueezyStartSubscriptionButton
                                  session={session}
                                  storeId={LEMONSQUEEZY_STORE_ID}
                                  productId={LEMONSQUEEZY_PRODUCT_ID}
                                  userId={user.userId}
                                  subscriptionStatus={user.subscriptionStatus}
                                  currentPlan={name}
                                  className={
                                      isSecondary
                                          ? " pointer-events-none w-full bg-white hover:bg-white !text-muted-foreground border border-muted-foreground mt-6 justify-center"
                                          : "w-full"
                                  }
                              >
                                  {user.subscriptionStatus === "not-subscribed"
                                      ? "Current plan "
                                      : "Downgrade to free"}
                              </LemonSqueezyStartSubscriptionButton>
                          )}
                      </>
                  )
                : ["not-subscribed", "expired"].includes(
                      user.subscriptionStatus
                  ) && (
                      <>
                          {LEMONSQUEEZY_STORE_ID && LEMONSQUEEZY_PRODUCT_ID && (
                              <LemonSqueezyStartSubscriptionButton
                                  session={session}
                                  storeId={LEMONSQUEEZY_STORE_ID}
                                  productId={LEMONSQUEEZY_PRODUCT_ID}
                                  userId={user.userId}
                                  subscriptionStatus={user.subscriptionStatus}
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
                />
            )}

            {user.subscriptionStatus === "cancelled" && (
                <ResumeSubscriptionButton
                    currentPlan={name}
                    subscriptionStatus={user.subscriptionStatus}
                    expiresAt={user.subscriptionEndsAfter}
                />
            )}
        </div>
    );
};

const Billing = async () => {
    return (
        <section id="pricing" className="mb-2">
            <h4 className="text-primary text-lg md:text-2xl font-bold py-2">
                Billing
            </h4>
            <p className="text-muted-foreground mb-4">
                Leave all your upload woes to us! We take care of your file
                uploads so that you focus on your users.
            </p>

            <div className="flex flex-wrap items-center gap-[2%]">
                {pricingPlans.map((pricingPlan) => (
                    <>
                        <PricingPane key={pricingPlan.name} {...pricingPlan} />
                    </>
                ))}
            </div>
        </section>
    );
};

export default Billing;
