import mediaQueries from "../media/queries";
import {
    resolveAccountPlan,
    storageLimitFor,
    type PlanUser,
} from "./entitlements";
import { minutesSummary } from "./processing-minutes";

/** An app's storage, the account's storage limit and its processing minutes,
 * as REST, MCP and the dashboard return them. */
export async function storageStats(user: PlanUser, appId: string) {
    const plan = await resolveAccountPlan(user);
    return {
        storage: await mediaQueries.getTotalSpace({ userId: user.id, appId }),
        maxStorage: storageLimitFor(plan),
        processingMinutes: await minutesSummary(user.id, plan),
    };
}
