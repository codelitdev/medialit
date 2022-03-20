"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var mongoose_1 = __importDefault(require("mongoose"));
var UserSchema = new mongoose_1.default.Schema({
    email: { type: String, required: true, unique: true },
    active: { type: Boolean, required: true, default: true },
    name: { type: String, required: false },
}, {
    timestamps: true
});
exports.default = mongoose_1.default.models.User || mongoose_1.default.model("User", UserSchema);
