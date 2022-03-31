import { config as loadDotFile } from 'dotenv';
loadDotFile();

import express from 'express';
import connectToDatabase from './config/db';
import passport from 'passport';
import userRoutes from './user/routes';
import jwt from './user/passport-strategies/jwt';
import apikeyRoutes from './apikey/routes';
import mediaRoutes from './media/routes';
import mediaSettingsRoutes from './media-settings/routes';

connectToDatabase();
const app = express();

passport.use(jwt);
// passport.use(apikey);
app.use(passport.initialize());
app.use(express.json());

app.use('/user', userRoutes(passport));
app.use('/settings/media', mediaSettingsRoutes(passport));
app.use('/settings/apikey', apikeyRoutes(passport));
app.use('/media', mediaRoutes);

app.listen(8000);