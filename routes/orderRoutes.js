// routes/orderRoutes.js

import express from "express";
import {
  getMenu,
  processChat,
  createOrder,
  getOrders,
} from "../controllers/orderController.js";

const router = express.Router();

router.get("/menu", getMenu);
router.post("/chat", processChat);
router.post("/", createOrder);
router.get("/", getOrders);

export default router;
