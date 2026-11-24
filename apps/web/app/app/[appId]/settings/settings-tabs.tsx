"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface SettingsTab {
    value: string;
    label: string;
    icon: ReactNode;
    content: ReactNode;
}

/* The settings page's tabs. The open tab follows the URL hash, so links
   such as `settings#webhooks` open their tab, and a reload keeps it.
   Every panel stays mounted, so unsaved edits survive a tab switch. */
export default function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
    const [value, setValue] = useState(tabs[0].value);

    useEffect(() => {
        const fromHash = () => {
            const id = decodeURIComponent(window.location.hash.slice(1));
            if (tabs.some((tab) => tab.value === id)) setValue(id);
        };
        fromHash();
        window.addEventListener("hashchange", fromHash);
        return () => window.removeEventListener("hashchange", fromHash);
    }, [tabs]);

    const select = (next: string) => {
        setValue(next);
        window.history.replaceState(null, "", `#${next}`);
    };

    return (
        <Tabs value={value} onValueChange={select} className="w-full">
            <TabsList className="mb-[18px] flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 shadow-[inset_0_-1px_0_var(--border)] text-muted-foreground">
                {tabs.map((tab) => (
                    <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="gap-2 rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-1.5 text-[13px] font-semibold hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none [&>svg]:size-4"
                    >
                        {tab.icon}
                        {tab.label}
                    </TabsTrigger>
                ))}
            </TabsList>
            {tabs.map((tab) => (
                <TabsContent
                    key={tab.value}
                    value={tab.value}
                    forceMount
                    className="mt-0 data-[state=inactive]:hidden"
                >
                    <div className="settings-stack">{tab.content}</div>
                </TabsContent>
            ))}
        </Tabs>
    );
}
