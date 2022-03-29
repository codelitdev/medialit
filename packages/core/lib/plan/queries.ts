import PlanModel, { Plan } from "./model";

export async function getPlan(planId: string): Promise<Plan | null> {
    return await PlanModel.findById(planId);
}