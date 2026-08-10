import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
} from "@/components/ui/sidebar";
import { NavMain, type NavMainItem } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { AppSwitcher } from "@/components/app-switcher";
import { getApiKeys, getUser } from "@/app/actions";
import { resolveCurrentKeyId } from "@/lib/current-app";
import { navlinks } from "@/components/nav-links";

const NAV: NavMainItem[] = [{ url: "/", title: "Home", icon: "home" }];

const RESOURCE_NAV: NavMainItem[] = navlinks.map((link) => ({
    url: link.href,
    title: link.text,
    icon: "book",
    external: true,
}));

export async function AppSidebar() {
    const [user, apiKeys] = await Promise.all([getUser(), getApiKeys()]);
    const apps = apiKeys ?? [];
    const currentKeyId = await resolveCurrentKeyId(apps);

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <AppSwitcher apps={apps} currentKeyId={currentKeyId} />
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={NAV} />
                {RESOURCE_NAV.length > 0 && (
                    <NavMain label="Resources" items={RESOURCE_NAV} />
                )}
            </SidebarContent>

            <SidebarFooter>
                <NavUser user={user} />
            </SidebarFooter>

            <SidebarRail />
        </Sidebar>
    );
}
