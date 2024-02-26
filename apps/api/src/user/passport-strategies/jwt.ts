import { Strategy, ExtractJwt, StrategyOptions } from "passport-jwt";
import { jwtExpire, jwtSecret } from "../../config/constants";
import UserModel from "../model";
import { User } from "@medialit/models";

const jwtStrategyOptions: StrategyOptions = {
    jwtFromRequest: ExtractJwt.fromBodyField("token"),
    secretOrKey: jwtSecret,
    jsonWebTokenOptions: {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore: VerifyOptions does not have the expiresIn option
        expiresIn: jwtExpire,
    },
    passReqToCallback: true,
};

export default new Strategy(jwtStrategyOptions, async function (
    _: any,
    jwtToken: { email: string },
    done: any
) {
    const { email } = jwtToken;
    const query = { email, active: true };
    try {
        const user = await UserModel.findOne(query);
        if (user) {
            return done(null, user);
        } else {
            return done(null, false);
        }
    } catch (err: any) {
        return done(err, false);
    }
});
