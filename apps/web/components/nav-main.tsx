"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FolderOpen, Home } from "lucide-react";
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar";

export interface NavMainItem {
    title: string;
    url: string;
    icon: "book" | "folder" | "home";
    external?: boolean;
}

const icons = { book: BookOpen, folder: FolderOpen, home: Home };

export function NavMain({
    label,
    items,
}: {
    label?: string;
    items: NavMainItem[];
}) {
    const pathname = usePathname();
    const { isMobile, setOpenMobile } = useSidebar();

    return (
        <SidebarGroup>
            {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
            <SidebarMenu>
                {items.map((item) => {
                    const Icon = icons[item.icon];
                    const isActive =
                        !item.external &&
                        (pathname === item.url ||
                            pathname.startsWith(`${item.url}/`));
                    return (
                        <SidebarMenuItem key={item.url}>
                            <SidebarMenuButton
                                asChild
                                tooltip={item.title}
                                isActive={isActive}
                            >
                                <Link
                                    href={item.url}
                                    target={
                                        item.external ? "_blank" : undefined
                                    }
                                    rel={
                                        item.external
                                            ? "noopener noreferrer"
                                            : undefined
                                    }
                                    onClick={() =>
                                        isMobile && setOpenMobile(false)
                                    }
                                >
                                    <Icon />
                                    <span>{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}
