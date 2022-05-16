import Plan from "../plan/model";
import User from "../user/model";
import Subscription from "../subscription/model";
import connectToDatabase, { disconnect } from "../config/db";
import { createApiKey } from "../apikey/queries";
import { Apikey } from "../apikey/model";

(async () => {
    try {
        await connectToDatabase();

        // Create a plan
        const plan = await Plan.create({
            maxFileSize: 10240,
            maxStorage: 1024000,
        });

        // Create a user
        const user = await User.create({
            email: "fake@email.com",
            active: true,
            name: "Admin",
        });

        // Create a subscription
        await Subscription.create({
            userId: user.id,
            planId: plan.id,
            endsAt: new Date(
                new Date().setFullYear(new Date().getFullYear() + 100)
            ),
        });

        // Create an API key
        const apikey: Apikey = await createApiKey(user.id);

        console.log(`\nSuccess! Your API key: ${apikey.key}\n`); // eslint-disable-line no-console
    } catch (e: any) {
        console.error(e); // eslint-disable-line no-console
    } finally {
        disconnect();
    }
})();
