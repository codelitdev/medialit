import { Strategy } from "passport-custom";
import { APIKEY_HEADER_ID } from "../config/constants";
import { BAD_REQUEST, SUBSCRIPTION_NOT_VALID, UNAUTHORISED } from "../config/strings";
import { hasValidSubscription } from "../subscription/middleware";
import ApikeyModel, { Apikey } from "../apikey/model";
import UserModel from "../user/model";

export default new Strategy(async function (req, done) {
    const reqKey = req.headers[APIKEY_HEADER_ID];

    if (!reqKey) {
        return done(BAD_REQUEST, null);
    }

    const apiKey: Apikey | null = await ApikeyModel.findOne({ key: reqKey });
    if (!apiKey) {
        return done(UNAUTHORISED, null);
    }

    const isSubscriptionValid = await hasValidSubscription(apiKey!.userId.toString());
    if (!isSubscriptionValid) {
        return done(SUBSCRIPTION_NOT_VALID, null);
    }

    const user = await UserModel.findById(apiKey!.userId);

    done(null, user);
})