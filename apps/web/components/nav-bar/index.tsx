import Link from "next/link";
import { auth, signOut } from "../../auth";
import { Button } from "@/components/ui/button";
import { BackpackIcon, GearIcon, PersonIcon } from "@radix-ui/react-icons";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { MobileNav } from "./mobile-nav";
import { logOut } from "./action";
import { navlinks } from "./links";
import { getUser } from "@/app/actions";
import { SITE_NAME } from "@/lib/constants";

export async function NavBar() {
    const session = await auth();
    const user = await getUser();

    return (
        <header className="sticky border-b top-0 z-50 bg-white/75 backdrop-blur">
            <div className="flex max-w-[1024px] m-auto p-2 justify-between items-center">
                <div className="flex gap-2 items-center">
                    <MobileNav />
                    <Link
                        href="/"
                        className="font-bold text-xl md:text-2xl pr-2"
                    >
                        {SITE_NAME}
                    </Link>
                    <ul className="hidden md:flex md:gap-4">
                        {navlinks.map((link) => (
                            <li key={link.href}>
                                <Link href={link.href}>{link.text}</Link>
                            </li>
                        ))}
                    </ul>
                </div>
                {session && session.user && (
                    <div className="flex gap-2 items-center">
                        <Link href="/dashboard">
                            <Button>Dashboard</Button>
                        </Link>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="relative h-8 w-8 rounded-full"
                                >
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage
                                            src="/avatars/01.png"
                                            alt="@shadcn"
                                        />
                                        <AvatarFallback>
                                            <PersonIcon />
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                className="w-[180px]"
                                align="end"
                                forceMount
                            >
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-3">
                                        <p className="text-sm font-medium leading-none">
                                            {session.user?.email}
                                        </p>
                                        <p className="text-[15px] flex gap-2 items-center leading-none text-muted-foreground">
                                            <GearIcon />
                                            Settings
                                        </p>
                                        <p className="text-[15px] flex gap-2 items-center leading-none text-muted-foreground">
                                            <BackpackIcon />
                                            Billing
                                        </p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {/* <DropdownMenuGroup>
                                    <DropdownMenuItem>
                                        Profile
                                        <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                        Billing
                                        <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                        Settings
                                        <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>New Team</DropdownMenuItem>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator /> */}
                                <DropdownMenuItem>
                                    <form action={logOut} className="w-full">
                                        <button
                                            type="submit"
                                            className="w-full text-start"
                                        >
                                            Sign out
                                        </button>
                                    </form>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
                {!session && (
                    <Link href="/login">
                        <Button>Login</Button>
                    </Link>
                )}
            </div>
        </header>
    );
}
