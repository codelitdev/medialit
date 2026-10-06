import logger from "../services/log";
import { getBillingEngine } from "./engine";

const HOUR_MS = 60 * 60 * 1000;

/** Starts the billing timers and returns a function that stops them. */
export function startBillingMaintenance(): () => void {
    const billing = getBillingEngine();
    const workerId = `billing-${process.pid}`;
    void billing.recordRequestedCatalog().catch((error) => {
        logger.error({ err: error }, "Failed to record billing catalog");
    });
    const batches = setInterval(() => {
        void billing
            .verifyRequestedCatalog()
            .catch((error) =>
                logger.error(
                    { err: error },
                    "Billing catalog verification failed",
                ),
            );
        void billing
            .runWebhookInboxBatch({ workerId })
            .catch((error) =>
                logger.error({ err: error }, "Billing webhook batch failed"),
            );
        void billing
            .runReconciliationBatch({ workerId: `${workerId}-reconcile` })
            .catch((error) =>
                logger.error({ err: error }, "Billing reconciliation failed"),
            );
        void billing
            .runDeadlineBatch()
            .catch((error) =>
                logger.error({ err: error }, "Billing deadline batch failed"),
            );
    }, 60 * 1000);
    const retention = setInterval(() => {
        void billing
            .purgeExpiredSensitiveValues({
                before: new Date(Date.now() - 30 * 24 * HOUR_MS),
            })
            .catch((error) =>
                logger.error({ err: error }, "Billing retention failed"),
            );
    }, HOUR_MS);
    return () => {
        clearInterval(batches);
        clearInterval(retention);
    };
}
