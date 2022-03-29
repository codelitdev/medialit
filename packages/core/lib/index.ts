import { config as loadDotFile } from 'dotenv';
loadDotFile();

import express from 'express';
import connectToDatabase from './config/db';
import passport from 'passport';
import userRoutes from './user/routes';
import jwt from './user/passport-strategies/jwt';
import settingsRoutes from './apikey/routes';
import mediaRoutes from './media/routes';

connectToDatabase();
const app = express();

passport.use(jwt);
// passport.use(apikey);
app.use(passport.initialize());
app.use(express.json());

app.use('/user', userRoutes(passport));
app.use('/settings/media', userRoutes(passport));
app.use('/settings', settingsRoutes(passport));
app.use('/media', mediaRoutes);

app.listen(8000);