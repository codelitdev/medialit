"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ButtonHTMLAttributes,
    type HTMLAttributes,
    type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { PanelLeftIcon } from "lucide-react";

type SidebarContextValue = {
    state: "expanded" | "collapsed";
    isMobile: boolean;
    openMobile: boolean;
    setOpenMobile: (open: boolean) => void;
    toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebar() {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error(
            "Sidebar components must be rendered inside SidebarProvider.",
        );
    }
    return context;
}

function joinClasses(...classes: Array<string | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export function SidebarProvider({
    children,
    className,
    open: controlledOpen,
    onOpenChange,
    openMobile: controlledOpenMobile,
    onOpenMobileChange,
}: {
    children: ReactNode;
    className?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    openMobile?: boolean;
    onOpenMobileChange?: (open: boolean) => void;
}) {
    const [internalOpen, setInternalOpen] = useState(true);
    const [internalOpenMobile, setInternalOpenMobile] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const open = controlledOpen ?? internalOpen;
    const openMobile = controlledOpenMobile ?? internalOpenMobile;

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 760px)");
        const updateIsMobile = () => setIsMobile(mediaQuery.matches);
        updateIsMobile();
        mediaQuery.addEventListener("change", updateIsMobile);
        return () => mediaQuery.removeEventListener("change", updateIsMobile);
    }, []);

    function setOpen(value: boolean | ((current: boolean) => boolean)) {
        const nextValue = typeof value === "function" ? value(open) : value;
        if (controlledOpen === undefined) setInternalOpen(nextValue);
        onOpenChange?.(nextValue);
    }

    function setOpenMobile(value: boolean | ((current: boolean) => boolean)) {
        const nextValue =
            typeof value === "function" ? value(openMobile) : value;
        if (controlledOpenMobile === undefined)
            setInternalOpenMobile(nextValue);
        onOpenMobileChange?.(nextValue);
    }

    function toggleSidebar() {
        if (isMobile) {
            setOpenMobile((value) => !value);
        } else {
            setOpen((value) => !value);
        }
    }

    return (
        <SidebarContext.Provider
            value={{
                state: open ? "expanded" : "collapsed",
                isMobile,
                openMobile,
                setOpenMobile,
                toggleSidebar,
            }}
        >
            <div
                data-slot="sidebar-provider"
                data-state={open ? "expanded" : "collapsed"}
                className={className}
            >
                {children}
            </div>
        </SidebarContext.Provider>
    );
}

export function Sidebar({
    children,
    className,
    ...props
}: HTMLAttributes<HTMLElement>) {
    const { state, isMobile, openMobile, setOpenMobile } = useSidebar();
    const sidebar = (
        <aside
            data-slot="sidebar"
            className={joinClasses(
                className,
                state === "collapsed" ? "is-collapsed" : undefined,
                openMobile ? "is-mobile-open" : undefined,
            )}
            aria-label="Primary navigation"
            {...props}
        >
            {isMobile ? (
                <>
                    <DialogPrimitive.Title className="visually-hidden">
                        Primary navigation
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="visually-hidden">
                        Navigate between your MediaLit apps and settings.
                    </DialogPrimitive.Description>
                </>
            ) : null}
            {children}
        </aside>
    );

    if (isMobile) {
        return (
            <DialogPrimitive.Root
                open={openMobile}
                onOpenChange={setOpenMobile}
            >
                <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay className="workspace-mobile-sidebar-overlay" />
                    <DialogPrimitive.Content
                        asChild
                        aria-label="Primary navigation"
                    >
                        {sidebar}
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
        );
    }

    return (
        <div
            data-slot="sidebar-wrapper"
            data-state={state}
            data-collapsible={state === "collapsed" ? "icon" : ""}
            data-variant="sidebar"
            data-side="left"
            className="workspace-sidebar-group"
        >
            <div
                data-slot="sidebar-gap"
                className="workspace-sidebar-gap"
                aria-hidden="true"
            />
            {sidebar}
        </div>
    );
}

export function SidebarInset({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return <div data-slot="sidebar-inset" className={className} {...props} />;
}

export function SidebarHeader({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return <div data-slot="sidebar-header" className={className} {...props} />;
}

export function SidebarContent({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return <div data-slot="sidebar-content" className={className} {...props} />;
}

export function SidebarFooter({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return <div data-slot="sidebar-footer" className={className} {...props} />;
}

export function SidebarTrigger({
    className,
    children,
    "aria-label": ariaLabel,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
    const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
    let defaultLabel: string;
    if (isMobile) {
        defaultLabel = openMobile ? "Close navigation" : "Open navigation";
    } else {
        defaultLabel =
            state === "expanded" ? "Collapse navigation" : "Expand navigation";
    }

    return (
        <button
            type="button"
            data-slot="sidebar-trigger"
            data-state={state}
            className={className}
            aria-label={ariaLabel ?? defaultLabel}
            aria-controls={
                !isMobile || openMobile ? "workspace-sidebar" : undefined
            }
            aria-expanded={isMobile ? openMobile : state === "expanded"}
            onClick={toggleSidebar}
            {...props}
        >
            {children ?? <PanelLeftIcon aria-hidden="true" />}
        </button>
    );
}
