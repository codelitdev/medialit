import { auth } from "@/auth";
import { getAppsDashboard } from "./actions";
import AppsDashboard from "./apps-dashboard";
import { redirect } from "next/navigation";

export default async function Home() {
    const session = await auth();
    if (!session) redirect("/login");

    const dashboard = await getAppsDashboard();
    if (!dashboard) {
        return (
            <div className="inline-error" role="alert">
                Could not load the app overview. Refresh to try again.
            </div>
        );
    }

    return <AppsDashboard data={dashboard} />;
}
