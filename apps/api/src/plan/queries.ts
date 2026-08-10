import type { PlanRow } from "@medialit/db";
import getRepositories from "../config/repositories";

export type Plan = PlanRow;

export async function getPlan(planId: string): Promise<Plan | null> {
    return await getRepositories().plans.findById(planId);
}
