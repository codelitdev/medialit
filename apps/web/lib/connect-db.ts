import mongoose from "mongoose";

export default async function connectToDatabase(): Promise<any> {
    if (mongoose.connection.readyState >= 1) {
        return mongoose.connection.getClient();
    }

    const options = {
        useNewUrlParser: true,
        serverSelectionTimeoutMS: 5000,
    };

    const dbConnection = await mongoose.connect(
        process.env.MONGODB_URI || "",
        options
    );
    return dbConnection.connection.getClient();
}
