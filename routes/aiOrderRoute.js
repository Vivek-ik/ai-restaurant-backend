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
  const { message, lang = "en", tableId } = req.body;
  console.log("➡️ Received request:", { message, lang, tableId });

  if (!message) {
    return res.status(400).json({ message: "Message is required." });
  }

  try {
    const { intent, items, ingredient, category, reply, specialInstructions } =
      await handleChatQuery(message, lang);

    // Ingredient Query
    if (intent === "ingredient_query" && ingredient) {
      const ingredientsArray = Array.isArray(ingredient)
        ? ingredient.map((i) => i.toLowerCase())
        : [ingredient.toLowerCase()];

      const Fuse = (await import("fuse.js")).default;
      const fuse = new Fuse(Object.keys(ingredientKnowledge), {
        includeScore: true,
        threshold: 0.4,
      });

      const result = fuse.search(ingredientsArray[0]);
      if (result.length > 0) {
        const matchedDish = result[0].item;
        return res.json({
          reply: `${matchedDish} includes the following ingredients: ${ingredientKnowledge[
            matchedDish
          ].join(", ")}`,
          intent,
          items: [],
        });
      }

      return res.json({
        reply: `Sorry, I don't have the ingredient details for "${ingredientsArray.join(
          ", "
        )}".`,
        intent,
        items: [],
      });
    }
    // Menu Browsing
    if (intent === "menu_browsing") {
      console.log("📖 Browsing menu for category:", category);

      try {
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
          // If no category provided, return all categories
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

        console.log("📋 Found items:", items);

        return res.json({
          reply,
          intent,
          items,
          tableId,
        });
      } catch (err) {
        console.error("🔥 AI Order Error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    }

    // Normal Order Flow
    console.log("🛒 Processing order items...");
    const enrichedItems = [];

    for (const item of items || []) {
      const searchName = item.name.trim().toLowerCase();
      console.log(`🔎 Searching for menu item: "${searchName}"`);

      const menuItem = await MenuItem.findOne({
        $or: [
          { "itemName.en": { $regex: searchName, $options: "i" } },
          { "itemName.hi": { $regex: searchName, $options: "i" } },
        ],
      });

      if (menuItem) {
        console.log(`✅ Found menu item: ${menuItem.itemName.en}`);
        enrichedItems.push({
          id: menuItem._id,
          name: menuItem.itemName,
          quantity: item.quantity || 1,
          price: menuItem.price,
          specialInstructions: item.specialInstructions || "",
        });
      } else {
        console.warn(`⚠️ Menu item not found for: ${item.name}`);
        enrichedItems.push(item);
      }
    }

    console.log("📝 Final enrichedItems:", enrichedItems);

    res.json({
      reply: reply || "Order processed.",
      intent,
      items: enrichedItems,
      tableId: tableId || "",
      specialInstructions: specialInstructions || "",
    });
  } catch (error) {
    console.error("🔥 AI Order Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
export default router;
