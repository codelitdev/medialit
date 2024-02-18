const { MongoClient } = require("mongodb");
const { nanoid } = require("nanoid");

if (!process.env.DB_CONNECTION_STRING) {
    console.error("DB_CONNECTION_STRING is not set");
    process.exit(1);
}

if (!process.env.DB_NAME) {
    console.error("DB_NAME is not set");
    process.exit(1);
}

async function updateCollection() {
    const uri = process.env.DB_CONNECTION_STRING;
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    try {
        await client.connect();
        const apikeyCollection = client
            .db(process.env.DB_NAME)
            .collection("apikeys");
        const userCollection = client
            .db(process.env.DB_NAME)
            .collection("users");

        const cursor = userCollection.find({});
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            const apikey = {
                keyId: nanoid(),
                name: "internal-apikey",
                key: nanoid(),
                userId: doc._id,
                internal: true,
            };
            await apikeyCollection.insertOne(apikey);
            console.log(`Added internal apikey for ${doc.email}`);
        }
    } finally {
        await client.close();
    }
}

updateCollection().catch(console.error);
