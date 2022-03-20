"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var passport_jwt_1 = require("passport-jwt");
var constants_1 = require("../config/constants");
var user_1 = __importDefault(require("../models/user"));
var jwtStrategyOptions = {
    jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: constants_1.jwtSecret,
    jsonWebTokenOptions: {
        // @ts-ignore: VerifyOptions does not have the expiresIn option
        expiresIn: constants_1.jwtExpire,
    },
    passReqToCallback: true,
};
exports.default = new passport_jwt_1.Strategy(jwtStrategyOptions, function (_, jwtToken, done) {
    var email = jwtToken.email;
    user_1.default.findOne({ email: email, active: true }, function (err, user) {
        if (err) {
            return done(err, false);
        }
        if (user) {
            return done(null, user);
        }
        else {
            return done(null, false);
        }
    });
});
