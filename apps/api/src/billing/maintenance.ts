import logger from "../services/log";
import { getBillingEngine } from "./engine";

const HOUR_MS = 60 * 60 * 1000;

export function startBillingMaintenance(): void {
    const billing = getBillingEngine();
    if (!billing) return;
    const workerId = `billing-${process.pid}`;
    void billing.recordRequestedCatalog().catch((error) => {
        logger.error({ err: error }, "Failed to record billing catalog");
    });
    setInterval(() => {
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
    setInterval(() => {
        void billing
            .purgeExpiredSensitiveValues({
                before: new Date(Date.now() - 30 * 24 * HOUR_MS),
            })
            .catch((error) =>
                logger.error({ err: error }, "Billing retention failed"),
            );
    }, HOUR_MS);
}
