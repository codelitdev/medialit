import express from "express";
import { server } from "./tus-server";

const router = express.Router();

router.all("/create/resumable*", server.handle.bind(server));

export default router;
