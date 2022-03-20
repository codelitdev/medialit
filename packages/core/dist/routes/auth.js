"use strict";
/**
 * This route handles everything related to signing users in.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
var constants_1 = require("../config/constants");
exports.default = (function (passport) {
    var router = express_1.default.Router();
    router.post("/login", passport.authenticate("magiclink", { action: "requestToken" }), function (req, res) {
        res.status(200).json({ message: "Success" });
    });
    router.get("/login", passport.authenticate("magiclink", {
        action: "acceptToken",
        session: false,
    }), function (req, res) {
        var token = jsonwebtoken_1.default.sign({ email: req.user.email }, constants_1.jwtSecret, { expiresIn: constants_1.jwtExpire });
        return res.status(200).json({ "access_token": token });
    });
    return router;
});
