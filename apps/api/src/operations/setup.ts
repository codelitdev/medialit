import type { Executor } from "../jobs/queue";
import logger, { captureEvent, captureException } from "../services/log";
import { emailOperators, operatorRecipients } from "../services/mail";
import type { PageDeps } from "./alerts";

/** Pages through this process's telemetry and the `EMAIL_*` settings. */
export function pageDeps(db: Executor): PageDeps {
    return {
        db,
        logger,
        captureException,
        captureEvent,
        email: emailOperators,
        recipients: () => operatorRecipients(),
    };
}
