"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
    Check,
    ChevronRight,
    ChevronsUpDown,
    CircleHelp,
    CreditCard,
    FolderOpen,
    LayoutGrid,
    LogOut,
    Plus,
    Search,
    Settings2,
    TerminalSquare,
    UserRound,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import NewApp from "@/components/new-app-button";
import { logOut } from "@/components/nav-bar/action";
import { formatAppStorage } from "@/lib/media-format";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import medialitLogo from "@codelitdev/design-system/assets/logo-medialit.svg";

type DashboardApp = {
    keyId: string;
    name: string;
    default?: boolean;
    count?: number;
    storage?: number;
};

type DashboardUser = {
    name?: string | null;
    email?: string | null;
} | null;

const docsUrl = "https://docs.medialit.cloud/quick-start";

export default function DashboardShell({
    children,
    apps,
    user,
}: {
    children: ReactNode;
    apps: DashboardApp[];
    user: DashboardUser;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [newAppOpen, setNewAppOpen] = useState(false);
    const [appSearch, setAppSearch] = useState("");
    const [accountOpen, setAccountOpen] = useState(false);

    const isPublicRoute = ["/login", "/terms", "/privacy", "/docs"].some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
    const dashboardMode = Boolean(user) && !isPublicRoute;
    const appKey = pathname.match(/^\/app\/([^/]+)/)?.[1];
    const activeApp =
        apps.find((app) => app.keyId === appKey) ??
        apps.find((app) => app.default) ??
        apps[0];
    const section = pathname.includes("/connect")
        ? "Connect"
        : pathname.includes("/settings")
          ? "App settings"
          : pathname.startsWith("/account")
            ? "Account settings"
            : pathname.startsWith("/app/")
              ? "Files"
              : "All apps";

    const filteredApps = useMemo(() => {
        const query = appSearch.trim().toLowerCase();
        if (!query) return apps;
        return apps.filter((app) => app.name.toLowerCase().includes(query));
    }, [appSearch, apps]);

    const navItems = [
        {
            label: "Files",
            href: activeApp ? `/app/${activeApp.keyId}/files` : "/",
            icon: FolderOpen,
            active: pathname.startsWith("/app/") && section === "Files",
        },
        {
            label: "Connect",
            href: activeApp ? `/app/${activeApp.keyId}/connect` : "/",
            icon: TerminalSquare,
            active: pathname.includes("/connect"),
        },
        {
            label: "App settings",
            href: activeApp ? `/app/${activeApp.keyId}/settings` : "/",
            icon: Settings2,
            active:
                pathname.includes("/settings") &&
                !pathname.startsWith("/account"),
        },
    ];

    if (!dashboardMode) {
        return (
            <div className="public-shell">
                <header className="public-topbar">
                    <Link href="/" className="public-brand">
                        <Image
                            src={medialitLogo}
                            alt=""
                            width={30}
                            height={30}
                        />
                        <span>MediaLit</span>
                        <span className="workspace-beta">Beta</span>
                    </Link>
                    <nav className="public-links" aria-label="Main navigation">
                        <a href={docsUrl} target="_blank" rel="noreferrer">
                            Docs
                        </a>
                        <Link href="/terms">Terms</Link>
                        <Link href="/privacy">Privacy</Link>
                        {user ? (
                            <Link href="/" className="workspace-button">
                                Dashboard
                            </Link>
                        ) : (
                            <Link href="/login" className="workspace-button">
                                Sign in
                            </Link>
                        )}
                    </nav>
                </header>
                <main className="public-content">{children}</main>
            </div>
        );
    }

    return (
        <SidebarProvider
            className="workspace-shell"
            open={!collapsed}
            onOpenChange={(open) => setCollapsed(!open)}
            openMobile={mobileOpen}
            onOpenMobileChange={setMobileOpen}
        >
            <>
                <Sidebar id="workspace-sidebar" className="workspace-sidebar">
                    <SidebarHeader className="workspace-sidebar-header">
                        <PopoverPrimitive.Root
                            open={switcherOpen}
                            onOpenChange={(open) => {
                                setSwitcherOpen(open);
                                if (open) setAccountOpen(false);
                            }}
                        >
                            <PopoverPrimitive.Trigger asChild>
                                <button
                                    type="button"
                                    className={`workspace-app-switcher${switcherOpen ? " is-open" : ""}`}
                                    aria-label={`Switch app, current: ${activeApp?.name ?? "No apps"}`}
                                >
                                    <span className="workspace-app-avatar">
                                        <Image
                                            src={medialitLogo}
                                            alt=""
                                            width={28}
                                            height={28}
                                        />
                                    </span>
                                    <span className="workspace-app-copy">
                                        <strong>
                                            {activeApp?.name ?? "Create an app"}
                                        </strong>
                                        <span>
                                            {activeApp?.count !== undefined
                                                ? `${activeApp.count} files · ${formatAppStorage(activeApp.storage ?? 0)}`
                                                : activeApp?.default
                                                  ? "Default app"
                                                  : "Media library"}
                                        </span>
                                    </span>
                                    <ChevronsUpDown
                                        size={15}
                                        aria-hidden="true"
                                    />
                                </button>
                            </PopoverPrimitive.Trigger>
                            <PopoverPrimitive.Portal>
                                <PopoverPrimitive.Content
                                    side={mobileOpen ? "bottom" : "right"}
                                    align="start"
                                    sideOffset={4}
                                    collisionPadding={12}
                                    aria-labelledby="workspace-switcher-title"
                                    aria-describedby="workspace-switcher-description"
                                    className="z-50 flex max-h-[min(calc(100dvh_-_24px),var(--radix-popover-content-available-height,calc(100dvh_-_24px)))] w-72 max-w-[calc(100vw_-_24px)] origin-[var(--radix-popover-content-transform-origin)] flex-col overflow-hidden rounded-[var(--radius)] border bg-popover p-1 text-popover-foreground shadow-[var(--shadow-popover)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=right]:slide-in-from-left-2 data-[side=left]:slide-in-from-right-2 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none"
                                >
                                    <h2
                                        id="workspace-switcher-title"
                                        className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground"
                                    >
                                        Apps
                                    </h2>
                                    <p
                                        id="workspace-switcher-description"
                                        className="visually-hidden"
                                    >
                                        Choose an app to open its files, or go
                                        to all apps.
                                    </p>
                                    {apps.length > 7 ? (
                                        <label className="mx-1 mb-1 flex h-8 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] border border-input px-2.5 text-muted-foreground focus-within:ring-1 focus-within:ring-ring">
                                            <Search
                                                className="size-4 shrink-0"
                                                aria-hidden="true"
                                            />
                                            <input
                                                aria-label="Find an app"
                                                placeholder="Find an app"
                                                className="w-full border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                                                value={appSearch}
                                                onChange={(event) =>
                                                    setAppSearch(
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </label>
                                    ) : null}
                                    <div className="flex min-h-0 flex-col overflow-y-auto">
                                        {filteredApps.map((app) => {
                                            const isCurrent =
                                                activeApp?.keyId === app.keyId;
                                            return (
                                                <button
                                                    type="button"
                                                    key={app.keyId}
                                                    aria-current={
                                                        isCurrent
                                                            ? "true"
                                                            : undefined
                                                    }
                                                    className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted shrink-0"
                                                    onClick={() => {
                                                        setSwitcherOpen(false);
                                                        setMobileOpen(false);
                                                        router.push(
                                                            `/app/${app.keyId}/files`,
                                                        );
                                                    }}
                                                >
                                                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklch,var(--primary),transparent_88%)] text-xs font-semibold text-primary">
                                                        {app.name[0]?.toUpperCase() ??
                                                            "M"}
                                                    </span>
                                                    <span className="flex min-w-0 flex-1 flex-col">
                                                        <span className="flex min-w-0 items-center gap-2">
                                                            <span className="truncate font-medium">
                                                                {app.name ||
                                                                    "Untitled"}
                                                            </span>
                                                            {app.default ? (
                                                                <span className="cl-badge cl-badge--default shrink-0">
                                                                    Default
                                                                </span>
                                                            ) : null}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {`${app.count ?? 0} ${app.count === 1 ? "file" : "files"} · ${formatAppStorage(app.storage ?? 0)}`}
                                                        </span>
                                                    </span>
                                                    {isCurrent ? (
                                                        <Check
                                                            className="ml-auto size-4 shrink-0"
                                                            aria-hidden="true"
                                                        />
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                        {filteredApps.length === 0 ? (
                                            <p className="px-2.5 py-1.5 text-sm text-muted-foreground">
                                                No apps match that search.
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="-mx-1 my-1 h-px shrink-0 bg-border" />
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted shrink-0"
                                        onClick={() => {
                                            setSwitcherOpen(false);
                                            setMobileOpen(false);
                                            setNewAppOpen(true);
                                        }}
                                    >
                                        <span className="grid size-8 shrink-0 place-items-center rounded-md border text-muted-foreground">
                                            <Plus
                                                className="size-4"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <span className="font-medium">
                                            New app
                                        </span>
                                    </button>
                                    <Link
                                        href="/"
                                        className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted shrink-0"
                                        onClick={() => setSwitcherOpen(false)}
                                    >
                                        <span className="grid size-8 shrink-0 place-items-center rounded-md border text-muted-foreground">
                                            <LayoutGrid
                                                className="size-4"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <span className="flex flex-col">
                                            <span className="font-medium">
                                                All apps
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                Compare storage across apps
                                            </span>
                                        </span>
                                    </Link>
                                </PopoverPrimitive.Content>
                            </PopoverPrimitive.Portal>
                        </PopoverPrimitive.Root>
                    </SidebarHeader>

                    <SidebarContent className="workspace-sidebar-content">
                        <nav
                            className="workspace-nav"
                            aria-label="App navigation"
                        >
                            {navItems.map(
                                ({ label, href, icon: Icon, active }) => (
                                    <Link
                                        key={label}
                                        href={href}
                                        className={`workspace-rail-link${active ? " is-active" : ""}`}
                                        aria-current={
                                            active ? "page" : undefined
                                        }
                                        aria-label={
                                            collapsed ? label : undefined
                                        }
                                        title={collapsed ? label : undefined}
                                        onClick={() => setMobileOpen(false)}
                                    >
                                        <Icon aria-hidden="true" />
                                        <span>{label}</span>
                                        {label === "Files" &&
                                        activeApp?.count !== undefined ? (
                                            <span className="rail-count">
                                                {activeApp.count}
                                            </span>
                                        ) : null}
                                    </Link>
                                ),
                            )}
                        </nav>

                        <div className="workspace-sidebar-spacer" />
                    </SidebarContent>

                    <SidebarFooter className="workspace-sidebar-bottom">
                        <a
                            href={docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="workspace-rail-link"
                            aria-label={collapsed ? "Help" : undefined}
                            title={collapsed ? "Help" : undefined}
                        >
                            <CircleHelp aria-hidden="true" />
                            <span>Help</span>
                        </a>
                        <div className="workspace-user-menu">
                            <form
                                id="account-signout-form"
                                action={logOut}
                                hidden
                            />
                            <DropdownMenu
                                open={accountOpen}
                                onOpenChange={(open) => {
                                    setAccountOpen(open);
                                    if (open) setSwitcherOpen(false);
                                }}
                            >
                                <DropdownMenuTrigger asChild>
                                    <button
                                        type="button"
                                        className={`workspace-user workspace-user-menu-trigger${accountOpen ? " is-open" : ""}`}
                                        aria-label={`Open account menu for ${user?.name || user?.email || "your account"}`}
                                    >
                                        <span className="workspace-user-avatar">
                                            {(user?.name ||
                                                user?.email ||
                                                "M")[0].toUpperCase()}
                                        </span>
                                        <span className="workspace-user-copy">
                                            <strong>
                                                {user?.name || "Your account"}
                                            </strong>
                                            <span>{user?.email}</span>
                                        </span>
                                        <ChevronsUpDown
                                            className="workspace-user-chevron"
                                            aria-hidden="true"
                                        />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    className="account-menu"
                                    side={mobileOpen ? "top" : "right"}
                                    align="end"
                                    sideOffset={4}
                                >
                                    <DropdownMenuLabel className="account-menu-header">
                                        <span className="account-menu-avatar">
                                            {(user?.name ||
                                                user?.email ||
                                                "M")[0].toUpperCase()}
                                        </span>
                                        <span className="account-menu-copy">
                                            <strong>
                                                {user?.name || "Your account"}
                                            </strong>
                                            <span>{user?.email}</span>
                                        </span>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator className="account-menu-separator" />
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem asChild>
                                            <Link
                                                href="/account"
                                                className="account-menu-item"
                                            >
                                                <UserRound aria-hidden="true" />
                                                Account settings
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem asChild>
                                            <Link
                                                href="/account/billing"
                                                className="account-menu-item"
                                            >
                                                <CreditCard aria-hidden="true" />
                                                Billing and plan
                                            </Link>
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator className="account-menu-separator" />
                                    <DropdownMenuItem
                                        className="account-menu-item"
                                        onSelect={() =>
                                            (
                                                document.getElementById(
                                                    "account-signout-form",
                                                ) as HTMLFormElement | null
                                            )?.requestSubmit()
                                        }
                                    >
                                        <LogOut aria-hidden="true" />
                                        Sign out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </SidebarFooter>
                </Sidebar>

                <NewApp
                    showTrigger={false}
                    open={newAppOpen}
                    onOpenChange={setNewAppOpen}
                />

                <SidebarInset className="workspace-main">
                    <header className="workspace-topbar">
                        <SidebarTrigger className="icon-control workspace-sidebar-trigger" />
                        <span
                            className="workspace-topbar-divider"
                            aria-hidden="true"
                        />
                        <nav
                            className="workspace-breadcrumb"
                            aria-label="Breadcrumb"
                        >
                            {section === "All apps" ||
                            section === "Account settings" ? (
                                <strong aria-current="page">{section}</strong>
                            ) : (
                                <>
                                    <span className="workspace-breadcrumb-current-app">
                                        {activeApp?.name ?? "Your app"}
                                    </span>
                                    <ChevronRight
                                        size={14}
                                        aria-hidden="true"
                                    />
                                    <strong aria-current="page">
                                        {section}
                                    </strong>
                                </>
                            )}
                        </nav>
                    </header>
                    <main className="workspace-content">{children}</main>
                </SidebarInset>
            </>
        </SidebarProvider>
    );
}
