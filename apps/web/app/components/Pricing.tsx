"use client";

import React, { ReactNode } from "react";
import { CheckIcon } from "@radix-ui/react-icons";
import Button from "./Button";

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

const PricingPane = ({
    name,
    description,
    price,
    icon,
    features,
    isSecondary = false,
}: PricingPaneProps) => {
    return (
        <div className=" p-4 w-1/2 h-80 border border-[#8B8B8B] rounded flex flex-col justify-between">
           <div>
            <h6 className="text-primary text-lg font-bold">{name}</h6>
            <p className="text-secondary">{description}</p>
            <div className="py-4">
                <span className="text-primary font-bold">&#36;{price}</span>
                <span className="text-[#6B6666] font-bold"> /month</span>
            </div>
            <div>
                {features.map((feature) => (
                    <div key={feature} className="flex gap-2 items-center mb-1">
                        {icon}
                        <p>{feature}</p>
                    </div>
                ))}
            </div>
           </div>

            <Button
                className={
                    isSecondary
                        ? " w-full bg-white hover:bg-white !text-primary border border-secondary mt-6 justify-center"
                        : "w-full"
                }
            >
                Get started for free
            </Button>
        </div>
    );
};

const Pricing = () => {
    return (
        <section id="pricing" className="mb-2">
            <h4 className="text-primary text-xl font-extrabold">Pricing</h4>
            <p className="text-secondary">
                Leave all your upload woes to us! We take care of your file
                uploads so that you focus on your users.
            </p>

            <div className="flex items-center gap-3 mt-5">
                {pricingPlans.map((pricingPlan) => (
                    <PricingPane key={pricingPlan.name} {...pricingPlan} />
                ))}
            </div>
        </section>
    );
};

export default Pricing;
