import express from "express";
import apikey from "../apikey/middleware";
import { getPresignedUrl, getPresignedTusUrl } from "./handlers";

const router = express.Router();
router.post("/create", apikey, getPresignedUrl);
router.post("/tus/create", apikey, getPresignedTusUrl);

export default router;
