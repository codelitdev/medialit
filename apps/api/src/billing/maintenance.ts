import { startBillingWorkers } from "@codelitdev/platform/billing";
import logger from "../services/log";
import { getBillingEngine } from "./engine";

/** Starts the billing maintenance batches and returns a function that stops them. */
export function startBillingMaintenance(): () => Promise<void> {
    const workers = startBillingWorkers({
        billing: getBillingEngine(),
        workerId: `billing-${process.pid}`,
        onError: (task, error) =>
            logger.error({ err: error, task }, "Billing maintenance failed"),
    });
    return workers.stop;
}
