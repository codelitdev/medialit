import { Strategy } from 'passport-magic-link';
import { appName, jwtSecret } from '../../config/constants';
import pug from 'pug';
import { send } from '../../services/mail';
import { User } from '../model';
import signin from '../templates/signin';
import { createUser, findByEmail } from '../queries';
import createMagicLink from '../utils/create-magic-link';

export default new Strategy(
  {
    secret: jwtSecret,
    userFields: ["email"],
    tokenField: "token",
    passReqToCallbacks: true,
  },
  async (req: any, user: any, token: string) => {
    const magiclink = createMagicLink({
      protocol: req.protocol,
      host: req.get('Host'),
      token
    })
    const emailBody = pug.render(signin, { magiclink });
    return process.env.NODE_ENV === "production" ? await send({
      to: user.email,
      subject: `Sign in to ${appName}`,
      body: emailBody,
    })
    : console.log(`Login link: ${magiclink}`);
  },
  async (req: any, user: User) => {
    let dbUser: User | null = await findByEmail(user.email);

    if (!dbUser) {
      dbUser = await createUser(user.email);
    }

    return dbUser.active ? dbUser : null;
  }
)