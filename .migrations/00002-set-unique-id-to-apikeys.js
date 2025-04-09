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
        const collection = client.db(process.env.DB_NAME).collection("apikeys"); // replace with your DB and collection name

        const cursor = collection.find({});
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            await collection.updateOne(
                { _id: doc._id },
                { $set: { keyId: nanoid() } },
            );
        }
    } finally {
        await client.close();
    }
}

updateCollection().catch(console.error);
