import mongoose from 'mongoose';
import logger from '../services/log';
import { dbConnectionString } from './constants';

export default async () => {
    if (!dbConnectionString) {
        logger.error("DB_CONNECTION_STRING is not defined");
        process.exit(1);
    }

    try {
        await mongoose.connect(dbConnectionString, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
        } as mongoose.ConnectOptions);
        logger.info("Database connected");
    } catch (err: any) {
        logger.error(err.message)
        process.exit(1);
    }
};
