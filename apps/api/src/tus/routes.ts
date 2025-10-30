import express from "express";
import cors from "cors";
import { server } from "./tus-server";

const router = express.Router();

router.all("/create/resumable{*splat}", cors(), server.handle.bind(server));

export default router;
