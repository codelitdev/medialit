import type { PlanRow } from "../db/types";
import getRepositories from "../config/repositories";

export type Plan = PlanRow;

export async function getPlan(planId: string): Promise<Plan | null> {
    return await getRepositories().plans.findById(planId);
}
