import { config as loadDotFile } from 'dotenv';
loadDotFile();

import express from 'express';
import connectToDatabase from './config/db';
import passport from 'passport';
import authRoutes from './routes/auth';
import magicLink from './passport-strategies/magic-link';
import jwt from './passport-strategies/jwt';
import settingsRoutes from './routes/settings';
import mediaRoutes from './routes/media';
import apikey from './passport-strategies/apikey';

connectToDatabase();
const app = express();

passport.use(magicLink);
passport.use(jwt);
passport.use(apikey);
app.use(passport.initialize());
app.use(express.json());

app.use('/auth', authRoutes(passport));
app.use('/settings', settingsRoutes(passport));
app.use('/media', mediaRoutes(passport));

app.listen(8000);