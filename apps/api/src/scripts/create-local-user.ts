import User from "../user/model";
import connectToDatabase, { disconnect } from "../config/db";
import { createApiKey } from "../apikey/queries";
import { Apikey } from "@medialit/models";

const args = process.argv.slice(2);
const email = args[0];
if (!email) {
    console.error("Error: Please provide an email address to setup an account");
    process.exit(1);
}

(async () => {
    try {
        await connectToDatabase();

        // Create a user
        const user = await User.create({
            email,
            active: true,
            name: "Admin",
            subscriptionEndsAfter: new Date(
                new Date().setFullYear(new Date().getFullYear() + 100),
            ),
        });

        // Create an API key
        const apikey: Apikey = await createApiKey(user.id, "internal");

        console.log(`\nSuccess! Your API key: ${apikey.key}\n`);
    } catch (e: any) {
        console.error(e);
    } finally {
        disconnect();
    }
})();
