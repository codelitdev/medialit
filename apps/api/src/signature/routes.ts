import express from "express";
import apikey from "../apikey/middleware";
import { getSignature } from "./handlers";

const router = express.Router();
router.post("/create", apikey, getSignature);

export default router;
