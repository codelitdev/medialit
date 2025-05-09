import Link from "next/link";
import { auth, signOut } from "../../auth";
import { Button } from "@/components/ui/button";
import {
    AvatarIcon,
    BackpackIcon,
    ExitIcon,
    GearIcon,
    PersonIcon,
} from "@radix-ui/react-icons";
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
import Image from "next/image";

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
                        className="flex gap-2 items-center font-bold text-xl md:text-2xl pr-2"
                    >
                        <Image
                            alt={`${SITE_NAME} icon`}
                            src="/icon.svg"
                            height={32}
                            width={32}
                        />
                        {SITE_NAME}
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-sm border border-gray-300 text-gray-500 leading-none inline-flex items-center">
                            Beta
                        </span>
                    </Link>
                    <ul className="hidden md:flex md:gap-4">
                        {navlinks.map((link) => (
                            <li key={link.href}>
                                <Link href={link.href} target="_blank">
                                    {link.text}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
                {session && session.user && (
                    <div className="flex gap-2 items-center">
                        {/* <Link href="/">
                            <Button>Dashboard</Button>
                        </Link> */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    // variant="ghost"
                                    className="relative h-10 w-10 rounded-full"
                                >
                                    <Avatar className="h-10 w-10">
                                        {/* <AvatarImage
                                            src="/avatars/01.png"
                                            alt="@shadcn"
                                        /> */}
                                        <AvatarFallback className="bg-primary text-white hover:bg-[#333333]">
                                            <AvatarIcon className="w-6 h-6" />
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
                                        <p className="text-sm text-muted-foreground font-medium truncate">
                                            {session.user?.email}
                                        </p>
                                        {/* <p className="text-[15px] flex gap-2 items-center text-primary">
                                            <GearIcon />
                                            Settings
                                        </p> */}
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuItem>
                                    <Link
                                        href="/account/billing"
                                        className="w-full"
                                    >
                                        <div className="flex items-center gap-2 w-full">
                                            <BackpackIcon />
                                            Billing
                                        </div>
                                    </Link>
                                </DropdownMenuItem>
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
                                            className="w-full text-start text-[15px] flex gap-2 items-center"
                                        >
                                            <ExitIcon />
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
