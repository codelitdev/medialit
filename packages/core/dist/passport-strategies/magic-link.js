"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var passport_magic_link_1 = require("passport-magic-link");
var constants_1 = require("../config/constants");
var path_1 = __importDefault(require("path"));
var pug_1 = __importDefault(require("pug"));
var mail_1 = require("../services/mail");
var user_1 = __importDefault(require("../models/user"));
exports.default = new passport_magic_link_1.Strategy({
    secret: constants_1.jwtSecret,
    userFields: ["email"],
    tokenField: "token",
    passReqToCallbacks: true,
}, function (req, user, token) { return __awaiter(void 0, void 0, void 0, function () {
    var magiclink, signInTemplate, emailBody, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                magiclink = "".concat(req.protocol, "://").concat(req.get('Host'), "/auth/login?token=").concat(token);
                signInTemplate = path_1.default.resolve(__dirname, "../templates/signin.pug");
                emailBody = pug_1.default.renderFile(signInTemplate, { magiclink: magiclink });
                if (!(process.env.NODE_ENV === "production")) return [3 /*break*/, 2];
                return [4 /*yield*/, (0, mail_1.send)({
                        to: user.email,
                        subject: "Sign in to ".concat(constants_1.appName),
                        body: emailBody,
                    })];
            case 1:
                _a = _b.sent();
                return [3 /*break*/, 3];
            case 2:
                _a = console.log("Login link: ".concat(magiclink));
                _b.label = 3;
            case 3: return [2 /*return*/, _a];
        }
    });
}); }, function (req, user) { return __awaiter(void 0, void 0, void 0, function () {
    var dbUser, newUser;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, user_1.default.findOne({
                    email: user.email,
                })];
            case 1:
                dbUser = _a.sent();
                if (!!dbUser) return [3 /*break*/, 3];
                newUser = {
                    email: user.email,
                    active: true,
                };
                return [4 /*yield*/, user_1.default.create(newUser)];
            case 2:
                dbUser = _a.sent();
                _a.label = 3;
            case 3: return [2 /*return*/, dbUser.active ? dbUser : null];
        }
    });
}); });
