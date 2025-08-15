// routes/aiOrderRoute.js
import express from "express";
import { handleChatQuery } from "../services/chatService.js";
import Order from "../models/Order.js";
import MenuItem from "../models/MenuItem.js";
import Category from "../models/Category.js";

const router = express.Router();

/* ───────────────
   🔹 Helper Functions
   ─────────────── */
const cleanMessage = (message) =>
  message.replace(/:[^:\s]*(?:::[^:\s]*)*:/g, "").trim().toLowerCase();

const findMenuItem = (allItems, searchName) =>
  allItems.find((menuItem) => {
    const en = menuItem.itemName?.en?.trim().toLowerCase();
    const hi = menuItem.itemName?.hi?.trim().toLowerCase();
    return (
      en === searchName ||
      hi === searchName ||
      en?.includes(searchName) ||
      hi?.includes(searchName)
    );
  });

const enrichItemsFromMenu = async (items) => {
  const allMenuItems = await MenuItem.find().populate("category").lean();
  return items?.map((item) => {
    const searchName = item.name?.trim().toLowerCase();
    const matched = findMenuItem(allMenuItems, searchName);
    return matched
      ? {
          id: matched._id,
          name: matched.itemName,
          quantity: item.quantity || 1,
          price: matched.price,
          specialInstructions: item.specialInstructions || "",
        }
      : item;
  });
};

/* ───────────────
   🔹 Intent Handlers
   ─────────────── */

// 1. Jain Filter
const handleJainFilter = async (lang) => {
  const allMenuItems = await MenuItem.find().populate("category").lean();
  const excludedIngredients = ["onion", "garlic", "pyaz", "lasun", "lasoon", "pyaaz"];

  const jainItems = allMenuItems.filter((item) => {
    const isJain = Array.isArray(item.jainOption) &&
      item.jainOption.some((opt) => opt.toLowerCase() === "jain");
    const isVeg = item.vegNonVeg ? item.vegNonVeg.toLowerCase() === "veg" : true;
    const hasExcluded = Array.isArray(item.ingredients) &&
      item.ingredients.some((ing) => excludedIngredients.includes(ing.trim().toLowerCase()));
    return isJain && isVeg && !hasExcluded;
  });

  return {
    intent: "filter_by_jain",
    items: jainItems.map((item) => ({
      name: item.itemName.en,
      price: item.price,
      category: item.category?.name?.en || "",
    })),
    reply: lang === "hi"
      ? "यहाँ आपके लिए जैन-फ्रेंडली डिशेस हैं:"
      : "Here are the Jain-friendly dishes:",
  };
};

// 2. Order Item
const handleOrderItem = async (items, reply, tableId, specialInstructions) => {
  const enrichedItems = await enrichItemsFromMenu(items || []);
  return {
    reply: reply || "Please mention the name of the dish to order.",
    intent: "order_item",
    items: enrichedItems,
    tableId: tableId || "",
    specialInstructions: specialInstructions || "",
  };
};

// 3. Filter by Ingredients
const handleIngredientFilter = async (
  items,
  ingredients,
  mode,
  reply,
  intent,
  tableId,
  specialInstructions
) => {
  const enrichedItems = await enrichItemsFromMenu(items || []);
  return {
    reply,
    intent,
    items: enrichedItems,
    tableId: tableId || "",
    specialInstructions: specialInstructions || "",
  };
};

// 4. Veg/Non-Veg Filter
const handleVegNonVegFilter = async (isVeg) => {
  const allMenuItems = await MenuItem.find().populate("category").lean();
  const filteredItems = allMenuItems.filter((item) => {
    const tags = item.tags?.map((t) => t.toLowerCase()) || [];
    return isVeg ? !tags.includes("non-veg") : tags.includes("non-veg");
  });

  if (filteredItems.length === 0) {
    return {
      reply: `Sorry, no ${isVeg ? "vegetarian" : "non-vegetarian"} dishes found.`,
      items: [],
    };
  }

  return {
    reply: `Here are today's ${isVeg ? "vegetarian" : "non-vegetarian"} options: ${filteredItems
      .map((i) => i.itemName.en)
      .join(", ")}`,
    items: filteredItems,
  };
};

// 5. Menu Browsing by Category
const handleMenuBrowsing = async (category, reply, intent, tableId) => {
  const categoriesToSearch = category
    ? Array.isArray(category) ? category : [category]
    : [];

  const categoryDocs = categoriesToSearch.length > 0
    ? await Category.find({
        name: { $in: categoriesToSearch.map((cat) => new RegExp(`^${cat}$`, "i")) },
      })
    : await Category.find({});

  if (categoryDocs.length === 0) {
    return {
      reply: reply,
      items: [],
      intent,
      category,
      tableId,
    };
  }

  const categoryIds = categoryDocs.map((doc) => doc._id);
  const items = await MenuItem.find({ category: { $in: categoryIds } }).populate("category");

  return { reply, intent, items, tableId };
};

/* ───────────────
   🔹 Main Route
   ─────────────── */
router.post("/ai-order", async (req, res) => {
  const { message, lang = "en", tableId, previousMessages, suggestedItems } = req.body;

  if (!message) return res.status(400).json({ message: "Message is required." });

  try {
    const chatResult = await handleChatQuery(message, lang, previousMessages, suggestedItems);
    const { intent, items, ingredient, category, reply, specialInstructions, mode } = chatResult;

    console.log("chatResult", chatResult);
    
    const cleanedLowerMessage = cleanMessage(message);

    // Handle each intent
    if (intent === "filter_by_jain") {
      return res.json(await handleJainFilter(lang));
    }

    if (intent === "order_item") {
      return res.json(await handleOrderItem(items, reply, tableId, specialInstructions));
    }

    if (intent === "filter_by_ingredients" && ingredient) {
      return res.json(
        await handleIngredientFilter(
          items,
          ingredient,
          mode,
          reply,
          intent,
          tableId,
          specialInstructions
        )
      );
    }

    if (/(veg|vegetarian|वेज|शाकाहारी)/i.test(cleanedLowerMessage) &&
        !/(non[- ]?veg|non[- ]?vegetarian|नॉन[- ]?वेज|मांसाहारी)/i.test(cleanedLowerMessage)) {
      return res.json(await handleVegNonVegFilter(true));
    }

    if (/(non[- ]?veg|non[- ]?vegetarian|नॉन[- ]?वेज|मांसाहारी)/i.test(cleanedLowerMessage)) {
      return res.json(await handleVegNonVegFilter(false));
    }

    if (intent === "menu_browsing") {
      return res.json(await handleMenuBrowsing(category, reply, intent, tableId));
    }

    // Default fallback
    return res.json({
      reply,
      intent,
      items: await enrichItemsFromMenu(items || []),
      tableId: tableId || "",
      specialInstructions: specialInstructions || "",
    });

  } catch (error) {
    console.error("🔥 AI Order Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
