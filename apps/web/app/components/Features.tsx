"use client";

import React, { ReactNode } from "react";
import {
    UploadIcon,
    VideoIcon,
    ImageIcon,
    MagicWandIcon,
} from "@radix-ui/react-icons";

const features = [
    {
        title: "Upload anything",
        description: `Upload any sort of file from anywhere using our easyto use REST API.`,
        icon: <UploadIcon />,
    },
    {
        title: "Fast delivery",
        description: `Experience fast delivery of your files using ourintegrated CDN.`,
        icon: <VideoIcon />,
    },
    {
        title: "Transform images",
        description: `Transform images to WEBP automatically upon upload.
        The WEBP format is good for the performance of your
        site.`,
        icon: <MagicWandIcon />,
    },
    {
        title: "Automatic thumbnails",
        description: `We generate thumbnails for images and videos
        automatically upon upload. Smaller file size boosts
        website speed.`,
        icon: <ImageIcon />,
    },
];

interface FeaturePaneProps {
    title: string;
    description: string;
    icon: ReactNode;
}

const FeaturePane = ({ title, description, icon }: FeaturePaneProps) => {
    return (
        <div className="w-1/2 p-1">
            <div className="p-4 border w-full border-secondary rounded">
                <div className="flex items-center gap-2 mb-2">
                    {icon}
                    <h6 className="text-primary text-lg font-bold">{title}</h6>
                </div>
                <p className="text-primary">{description}</p>
            </div>
        </div>
    );
};

const Features = () => {
    return (
        <section id="features" className="mb-5">
            <h4 className="text-primary text-2xl font-extrabold">Features</h4>
            <p className="text-secondary">
                Everything you need to deliver a flawless media experience to
                your users is here.
            </p>

            <div className="flex flex-wrap justify-center mt-5">
                {features.map((feature) => (
                    <FeaturePane {...feature} />
                ))}
            </div>
        </section>
    );
};

export default Features;
