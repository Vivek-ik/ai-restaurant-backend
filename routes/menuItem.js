import express from "express";
import mongoose from "mongoose";
import MenuItem from "../models/MenuItem.js";
import Category from "../models/category.js";
// import Category from "../models/Category.js";
// import { MenuItem } from "../models/MenuItem";
// import { Category } from "../models/Category";

const router = express.Router();

router.post("/bulk-insert", async (req, res) => {
  try {
    const items = req.body;
    console.log("itemsitems", items);

    const categoriesMap = {};

    // Find or create categories
    for (const item of items) {
      const catName = item.category.trim();
      if (!categoriesMap[catName]) {
        let categoryDoc = await Category.findOne({ name: catName });
        if (!categoryDoc) {
          categoryDoc = await Category.create({ name: catName });
        }
        categoriesMap[catName] = categoryDoc._id;
      }
    }

    const menuDocs = items.map((item) => ({
      itemName: {
        en: item.itemName.en,
        hi: item.itemName.hi, // fallback or localization
      },
      price: item.price,
      category: categoriesMap[item.category],
      tags: item.tags,
      description: {
        en: item.description.en,
        hi: item.description.hi,
      },
      image: item.image,
      available: item.available,
      customizableOptions: item.customizableOptions,
      allergens: item.allergens,
    }));

    const insertedItems = await MenuItem.insertMany(menuDocs);
    res
      .status(201)
      .json({ message: "Menu items inserted", data: insertedItems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Bulk insert failed", error: err });
  }
});

export default router;
