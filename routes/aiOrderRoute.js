// routes/aiOrderRoute.js
import express from "express";
import {
  handleChatQuery,
  detectIntentAndEntities,
} from "../services/chatService.js";
import Order from "../models/Order.js";
import MenuItem from "../models/MenuItem.js";

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
    if (intent === "ingredient_query") {
      console.log(`🔎 Checking ingredient: ${ingredient}`);
      const itemsWithIngredient = await MenuItem.find({
        ingredients: { $in: [ingredient.toLowerCase()] },
      });
      console.log(
        `🔍 Found ${itemsWithIngredient.length} items containing "${ingredient}"`
      );

      if (itemsWithIngredient.length > 0) {
        return res.json({
          reply: `Yes, these items contain ${ingredient}: ${itemsWithIngredient
            .map((i) => i.itemName.en)
            .join(", ")}`,
          intent,
          items: [],
        });
      } else {
        return res.json({
          reply: `No menu items contain ${ingredient}.`,
          intent,
          items: [],
        });
      }
    }

    // Menu Browsing
    if (intent === "menu_browsing") {
      console.log(`📖 Browsing menu for category: ${category || "ALL"}`);
      let menuItems = [];

      if (category) {
        const normalizedCategory = category.trim().toLowerCase();
        menuItems = await MenuItem.find({
          category: { $regex: new RegExp(normalizedCategory, "i") },
        });
      } else {
        menuItems = await MenuItem.find();
      }

      console.log(`📄 Found ${menuItems.length} items`);
      return res.json({
        reply: `Here are the ${category || ""} items: ${menuItems
          .map((i) => i.itemName.en)
          .join(", ")}`,
        intent,
        items: [],
      });
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
