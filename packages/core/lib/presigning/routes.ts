import express from "express";
import apikey from "../apikey/middleware";
import { getPresignedUrl } from "./handlers";

const router = express.Router();
router.post("/create", apikey, getPresignedUrl);

export default router;
