"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/codelit/dropdown-menu";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar";
import NewApp from "@/components/new-app-button";

export interface AppSummary {
    keyId: string;
    name: string;
    default?: boolean;
}

export function AppSwitcher({
    apps,
    currentKeyId,
}: {
    apps: AppSummary[];
    currentKeyId: string | null;
}) {
    const { isMobile } = useSidebar();
    const [newAppOpen, setNewAppOpen] = useState(false);
    const currentApp = apps.find((app) => app.keyId === currentKeyId);

    const title = currentApp?.name ?? "Choose an app";
    const initial = (currentApp?.name ?? "M").slice(0, 1).toUpperCase();

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-medium text-sidebar-primary-foreground">
                                {initial}
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">
                                    {title}
                                </span>
                                <span className="truncate text-xs">
                                    {apps.length}{" "}
                                    {apps.length === 1 ? "app" : "apps"}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-auto" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-64 rounded-lg"
                        align="start"
                        side={isMobile ? "bottom" : "right"}
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Your apps
                        </DropdownMenuLabel>
                        {apps.map((app) => (
                            <form
                                key={app.keyId}
                                action="/api/app-switch"
                                method="POST"
                                className="contents"
                            >
                                <input
                                    type="hidden"
                                    name="keyId"
                                    value={app.keyId}
                                />
                                <DropdownMenuItem asChild>
                                    <button
                                        type="submit"
                                        className="w-full gap-2 p-2 text-left"
                                    >
                                        <div className="flex size-6 items-center justify-center rounded-md border text-xs font-medium">
                                            {app.name.slice(0, 1).toUpperCase()}
                                        </div>
                                        <span className="min-w-0 flex-1 truncate">
                                            {app.name}
                                        </span>
                                        {app.keyId === currentKeyId && (
                                            <Check className="size-4" />
                                        )}
                                    </button>
                                </DropdownMenuItem>
                            </form>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="gap-2"
                            onSelect={(event) => {
                                event.preventDefault();
                                setNewAppOpen(true);
                            }}
                        >
                            <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                                <Plus className="size-4" />
                            </div>
                            <div className="font-medium text-muted-foreground">
                                Add app
                            </div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
            <NewApp
                open={newAppOpen}
                onOpenChange={setNewAppOpen}
                trigger={null}
            />
        </SidebarMenu>
    );
}
