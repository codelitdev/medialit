import mongoose from "mongoose";
import logger from "../services/log";
import { dbConnectionString } from "./constants";

interface ConnectionProps {
    isConnected?: number;
}

const connection: ConnectionProps = {};

export default async function (): Promise<void> {
    if (!dbConnectionString) {
        logger.error("DB_CONNECTION_STRING is not defined");
        process.exit(1);
    }

    if (connection.isConnected) {
        return;
    }

    const options: mongoose.ConnectOptions = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
    } as mongoose.ConnectOptions;

    try {
        const dbConnection = await mongoose.connect(
            dbConnectionString,
            options
        );
        connection.isConnected = dbConnection.connections[0].readyState;
        logger.info("Database connected");
    } catch (err) {
        if (err instanceof Error) {
            logger.error({ err }, err.message);
        }
        process.exit(1);
    }
}

export async function disconnect(): Promise<void> {
    return await mongoose.disconnect();
}
