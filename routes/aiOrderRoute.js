// routes/aiOrderRoute.js
import express from "express";
import {
  handleChatQuery,
  detectIntentAndEntities,
} from "../services/chatService.js";
import Order from "../models/Order.js";
import MenuItem from "../models/MenuItem.js";
import Category from "../models/Category.js";
import { ingredientKnowledge } from "../constants.js";

const router = express.Router();

router.post("/ai-order", async (req, res) => {
  const { message, lang = "en", tableId, previousMessages } = req.body;
  console.log("➡️ Received request:", { message, lang, tableId, previousMessages });

  if (!message) {
    return res.status(400).json({ message: "Message is required." });
  }

  try {
    const chatResult = await handleChatQuery(message, lang, previousMessages);
    const { intent, items, ingredient, category, reply, specialInstructions } =
      chatResult;

    // ✅ Order Item Intent
    if (intent === "order_item") {
      const enrichedItems = [];

      for (const item of items || []) {
        const searchName = item.name.trim().toLowerCase();

        const menuItem = await MenuItem.findOne({
          $or: [
            { "itemName.en": { $regex: searchName, $options: "i" } },
            { "itemName.hi": { $regex: searchName, $options: "i" } },
          ],
        });

        if (menuItem) {
          enrichedItems.push({
            id: menuItem._id,
            name: menuItem.itemName,
            quantity: item.quantity || 1,
            price: menuItem.price,
            specialInstructions: item.specialInstructions || "",
          });
        } else {
          enrichedItems.push(item); // fallback if no exact match
        }
      }

      return res.json({
        reply:
          reply || "I've added it to your cart. You can confirm when ready.",
        intent,
        items: enrichedItems,
        tableId: tableId || "",
        specialInstructions: specialInstructions || "",
      });
    }

    // ✅ Ingredient Query intent
    if (intent === "filter_by_ingredients" && ingredient) {
      const excludedIngredients = ingredient
        .split(",")
        .map((i) => i.trim().toLowerCase());

      const allMenuItems = await MenuItem.find().populate("category").lean();

      const filteredItems = allMenuItems.filter((item) => {
        const itemName = item.itemName.en.trim().toLowerCase();

        // 🔎 Match ingredientKnowledge by normalized item name
        const matchedKey = Object.keys(ingredientKnowledge).find(
          (key) => key.trim().toLowerCase() === itemName
        );

        const ingredients = matchedKey
          ? ingredientKnowledge[matchedKey].map((ing) => ing.toLowerCase())
          : [];

        const hasExcludedIngredient = ingredients.some((ing) =>
          excludedIngredients.includes(ing)
        );

        const isNonVeg = item.tags?.some((tag) =>
          tag.toLowerCase().includes("non-veg")
        );

        // ❌ Exclude if it has any banned ingredient or is non-veg
        return !hasExcludedIngredient && !isNonVeg;
      });

      if (filteredItems.length === 0) {
        return res.status(404).json({
          reply: `Sorry, no dishes are available without ${ingredient}.`,
          items: [],
          intent,
          ingredient,
          tableId,
        });
      }

      return res.json({
        reply: `Here are dishes without ${ingredient}: ${filteredItems
          .map((i) => i.itemName.en)
          .join(", ")}`,
        intent,
        ingredient,
        tableId,
        items: filteredItems.map((i) => ({
          name: i.itemName.en,
          price: i.price,
          category: i.category?.name || "Uncategorized",
        })),
      });
    }

    // ✅ Menu Browsing
    if (intent === "menu_browsing") {
      const categoriesToSearch = category
        ? Array.isArray(category)
          ? category
          : [category]
        : [];

      let categoryDocs;

      if (categoriesToSearch.length > 0) {
        categoryDocs = await Category.find({
          name: {
            $in: categoriesToSearch.map((cat) => new RegExp(`^${cat}$`, "i")),
          },
        });
      } else {
        categoryDocs = await Category.find({});
      }

      if (categoryDocs.length === 0) {
        return res.status(404).json({
          reply: `Sorry, we couldn’t find anything under ${
            categoriesToSearch.join(", ") || "menu"
          }.`,
          items: [],
          intent,
          category,
          tableId,
        });
      }

      const categoryIds = categoryDocs.map((doc) => doc._id);

      const items = await MenuItem.find({
        category: { $in: categoryIds },
      }).populate("category");

      return res.json({
        reply,
        intent,
        items,
        tableId,
      });
    }

    // ✅ Order Items Flow
    const enrichedItems = [];

    for (const item of items || []) {
      const searchName = item.name.trim().toLowerCase();
      const menuItem = await MenuItem.findOne({
        $or: [
          { "itemName.en": { $regex: searchName, $options: "i" } },
          { "itemName.hi": { $regex: searchName, $options: "i" } },
        ],
      });

      if (menuItem) {
        enrichedItems.push({
          id: menuItem._id,
          name: menuItem.itemName,
          quantity: item.quantity || 1,
          price: menuItem.price,
          specialInstructions: item.specialInstructions || "",
        });
      } else {
        enrichedItems.push(item); // fallback
      }
    }

    return res.json({
      reply: reply,
      intent,
      items: enrichedItems,
      tableId: tableId || "",
      specialInstructions: specialInstructions || "",
    });
  } catch (error) {
    console.error("🔥 AI Order Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
