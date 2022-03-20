import { Strategy } from 'passport-magic-link';
import { appName, jwtSecret } from '../config/constants';
import path from 'path';
import pug from 'pug';
import { send } from '../services/mail';
import UserModel, { User } from '../models/user';

export default new Strategy(
  {
    secret: jwtSecret,
    userFields: ["email"],
    tokenField: "token",
    passReqToCallbacks: true,
  },
  async (req: any, user: any, token: string) => {
    const magiclink = `${req.protocol}://${req.get('Host')}/auth/login?token=${token}`;
    const signInTemplate = path.resolve(
      __dirname,
      "../templates/signin.pug"
    );
    const emailBody = pug.renderFile(signInTemplate, { magiclink });
    return process.env.NODE_ENV === "production" ? await send({
      to: user.email,
      subject: `Sign in to ${appName}`,
      body: emailBody,
    })
    : console.log(`Login link: ${magiclink}`);
  },
  async (req: any, user: User) => {
    let dbUser = await UserModel.findOne({
      email: user.email,
    });

    if (!dbUser) {
      const newUser = {
        email: user.email,
        active: true,
      };
      dbUser = await UserModel.create(newUser);
    }

    return dbUser.active ? dbUser : null;
  }
)