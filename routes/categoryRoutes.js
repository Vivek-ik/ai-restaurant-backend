import express from "express";
import Category from "../models/Category.js";

const router = express.Router();

// GET /api/categories - fetch all categories
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find({});
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

export default router;
