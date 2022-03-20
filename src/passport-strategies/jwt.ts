import { Strategy, ExtractJwt, StrategyOptions } from "passport-jwt";
import { jwtExpire, jwtSecret } from "../config/constants";
import UserModel, { User } from "../models/user";

const jwtStrategyOptions: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: jwtSecret,
  jsonWebTokenOptions: {
    // @ts-ignore: VerifyOptions does not have the expiresIn option
    expiresIn: jwtExpire,
  },
  passReqToCallback: true,
};

export default new Strategy(jwtStrategyOptions, function (
  _: any,
  jwtToken: { email: string; domain: string },
  done: any
) {
  const { email } = jwtToken;

  UserModel.findOne(
    { email, active: true },
    function (err: Error, user: User) {
      if (err) {
        return done(err, false);
      }

      if (user) {
        return done(null, user);
      } else {
        return done(null, false);
      }
    }
  );
});
