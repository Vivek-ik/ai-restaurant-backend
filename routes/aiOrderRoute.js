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
  console.log("message, lang, tableNumber", message, lang, tableId);

  const lowerMsg = message.toLowerCase();

  try {
    // 1. Detect intent and entities (like items, quantity, instructions)
    const { intent, entities } = await detectIntentAndEntities(message, lang);
    // const aiReply = await handleChatQuery(message, lang, intent, entities);

    if (!message) {
      return res.status(400).json({ message: "Message is required." });
    }

    const aiReply = await handleChatQuery(message, lang, intent, entities);
    console.log("AI Reply:", aiReply);

    const enrichedItems = [];
    for (const item of entities.items || []) {
      const searchName = item.name.trim().toLowerCase();
      const menuItem = await MenuItem.findOne({
        $or: [
          { "itemName.en": { $regex: searchName, $options: "i" } },
          { "itemName.hi": { $regex: searchName, $options: "i" } },
          ],
      });
      console.log("menuItem", menuItem);

      if (menuItem) {
        enrichedItems.push({
          id: menuItem._id,
          name: menuItem.itemName,
          quantity: item.quantity || 1,
          price: menuItem.price,
          specialInstructions: item.specialInstructions || "",
        });
      } else {
        console.warn(`Menu item not found for: ${item.name}`);
        enrichedItems.push(item);
      }
    }

    console.log("enrichedItems", enrichedItems);

    // add customization from menu  so user can see what they ordered in detail
    res.json({
      reply: aiReply,
      intent,
      items: enrichedItems || [],
      enrichedItems,
      tableId: tableId || "",
      specialInstructions: entities?.specialInstructions || "",
    });
  } catch {
    (error) => {
      console.error("AI Order Error:", error.message);
      res.status(500).json({ message: "Internal Server Error from AI" });
    };
  }
});

export default router;
