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
  const {
    message,
    lang = "en",
    tableId,
    previousMessages,
    suggestedItems,
  } = req.body;
  console.log("➡️ Received request:", {
    message,
    lang,
    tableId,
    previousMessages,
  });

  if (!message) {
    return res.status(400).json({ message: "Message is required." });
  }

  try {
    const chatResult = await handleChatQuery(
      message,
      lang,
      previousMessages,
      suggestedItems
    );
    const {
      intent,
      items,
      ingredient,
      category,
      reply,
      specialInstructions,
      mode,
    } = chatResult;

    console.log(
      "chatResult",
      intent,
      items,
      ingredient,
      category,
      reply,
      specialInstructions,
      mode
    );

    // ✅ Order Item Intent
    if (intent === "order_item") {
      const allMenuItems = await MenuItem.find().populate("category").lean();
      const enrichedItems = [];

      for (const item of items || []) {
        console.log("item2222", item);

        const searchName = item.name?.trim().toLowerCase();

        const matchedMenuItem = allMenuItems.find((menuItem) => {
          const enName = menuItem.itemName?.en?.trim().toLowerCase();
          const hiName = menuItem.itemName?.hi?.trim().toLowerCase();
          return (
            enName === searchName ||
            hiName === searchName ||
            enName.includes(searchName) || // fuzzy match fallback
            hiName?.includes(searchName)
          );
        });

        if (matchedMenuItem) {
          enrichedItems.push({
            id: matchedMenuItem._id,
            name: matchedMenuItem.itemName,
            quantity: item.quantity || 1,
            price: matchedMenuItem.price,
            specialInstructions: item.specialInstructions || "",
          });
        } else {
          enrichedItems.push(item); // fallback if no match
        }
      }

      console.log("Enriched Items:", specialInstructions);

      return res.json({
        reply: reply || "Please mention the name of the dish to order.",
        intent,
        items: enrichedItems,
        tableId: tableId || "",
        specialInstructions: specialInstructions || "",
      });
    }

    // ✅ Ingredient Query intent

    if (intent === "filter_by_ingredients" && ingredient) {
      // const ingredientsToMatch = ingredient
      //   .split(",")
      //   .map((i) => i.trim().toLowerCase());

      // const allMenuItems = await MenuItem.find().populate("category").lean();

      // const filteredItems = allMenuItems.filter((item) => {
      //   const itemName = item.itemName.en.trim().toLowerCase();

      //   const matchedKey = Object.keys(ingredientKnowledge).find(
      //     (key) => key.trim().toLowerCase() === itemName
      //   );

      //   const ingredients =
      //     matchedKey && ingredientKnowledge[matchedKey]
      //       ? ingredientKnowledge[matchedKey].map((ing) => ing.toLowerCase())
      //       : [];

      //   const isNonVeg = item.tags?.some((tag) =>
      //     tag.toLowerCase().includes("non-veg")
      //   );

      //   const hasMatch = ingredientsToMatch.some((ing) =>
      //     ingredients.includes(ing)
      //   );

      //   if (mode === "exclude") {
      //     return !hasMatch && !isNonVeg;
      //   } else if (mode === "include") {
      //     return hasMatch;
      //   }

      //   return true; // fallback
      // });

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

        console.log("items1111", items);
        
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
            name: menuItem.itemName.en || menuItem.itemName.hi,
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

      if (filteredItems.length === 0) {
        return res.status(404).json({
          reply: `Sorry, no dishes found ${
            mode === "exclude" ? "without" : "with"
          } ${ingredient}.`,
          items: [],
          intent,
          ingredient,
          mode,
          tableId,
        });
      }

      return res.json({
        reply: `Here are dishes ${
          mode === "exclude" ? "without" : "with"
        } ${ingredient}: ${filteredItems.map((i) => i.itemName.en).join(", ")}`,
        intent,
        ingredient,
        mode,
        tableId,
        items: filteredItems,
      });
    }

    // menu browsing and veg non veg
    const cleanedMessage = message
      .replace(/:[^:\s]*(?:::[^:\s]*)*:/g, "")
      .toLowerCase();

    const cleanedLowerMessage = cleanedMessage.toLowerCase();

    // ✅ Add Hindi and Hinglish patterns
    const isLookingForVeg =
      /(veg|vegetarian|वेज|शाकाहारी)/i.test(cleanedLowerMessage) &&
      !/(non[- ]?veg|non[- ]?vegetarian|नॉन[- ]?वेज|मांसाहारी)/i.test(
        cleanedLowerMessage
      );

    const isLookingForNonVeg =
      /(non[- ]?veg|non[- ]?vegetarian|नॉन[- ]?वेज|मांसाहारी)/i.test(
        cleanedLowerMessage
      );

    let filteredItems;

    if (isLookingForVeg || isLookingForNonVeg) {
      const allMenuItems = await MenuItem.find().populate("category").lean();

      filteredItems = allMenuItems.filter((item) => {
        const tags = item.tags?.map((t) => t.toLowerCase()) || [];

        if (isLookingForVeg) return !tags.includes("non-veg");
        if (isLookingForNonVeg) return tags.includes("non-veg");
        return true;
      });

      const replyText = isLookingForVeg
        ? "Here are today's vegetarian options:"
        : isLookingForNonVeg
        ? "Here are today's non-vegetarian options:"
        : "Here are today's menu items:";

      if (filteredItems?.length === 0) {
        return res.status(404).json({
          reply: `Sorry, no ${
            isLookingForVeg ? "vegetarian" : "non-vegetarian"
          } dishes found.`,
          items: [],
          intent,
          tableId,
        });
      }

      return res.json({
        reply: `${replyText} ${filteredItems
          .map((i) => i.itemName.en)
          .join(", ")}`,
        intent,
        tableId,
        items: filteredItems,
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

      console.log("items", items);
      
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
