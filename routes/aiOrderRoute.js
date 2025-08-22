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
  message
    .replace(/:[^:\s]*(?:::[^:\s]*)*:/g, "")
    .trim()
    .toLowerCase();

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
  return items.map((item) => {
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
  const excludedIngredients = [
    "onion",
    "garlic",
    "pyaz",
    "lasun",
    "lasoon",
    "pyaaz",
  ];

  const jainItems = allMenuItems.filter((item) => {
    const isJain =
      Array.isArray(item.jainOption) &&
      item.jainOption.some((opt) => opt.toLowerCase() === "jain");
    const isVeg = item.vegNonVeg
      ? item.vegNonVeg.toLowerCase() === "veg"
      : true;
    const hasExcluded =
      Array.isArray(item.ingredients) &&
      item.ingredients.some((ing) =>
        excludedIngredients.includes(ing.trim().toLowerCase())
      );
    return isJain && isVeg && !hasExcluded;
  });

  return {
    intent: "filter_by_jain",
    items: jainItems.map((item) => ({
      name: item.itemName.en,
      price: item.price,
      category: item.category?.name?.en || "",
    })),
    reply:
      lang === "hi"
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
  ingredient,
  mode,
  reply,
  intent,
  tableId,
  specialInstructions
) => {
  try {
    console.log("ingredient123", ingredient);

    // extract ingredients + mode from rawReply (pass it in or store in session)
    const ingredientArray = Array.isArray(ingredient)
      ? ingredient.map((i) => i.toLowerCase().trim())
      : [ingredient.toLowerCase().trim()];

    // extract ingredients + mode from rawReply
    const ingredientList = (items?.length ? items : [])
      .map((i) => i.toLowerCase().trim())
      .filter(Boolean);

      
    console.log("ingredientListingredientList", ingredientList);
    console.log("ingredientArray", ingredientArray);

    // Build query dynamically
    let query = {};
    if (intent === "filter_by_ingredients" && ingredient.length > 0) {
      query =
        mode === "exclude"
          ? { ingredients: { $nin: ingredient } }
          : { ingredients: { $all: ingredient } };
    }

    // Fetch menu items
    const dbItems = await MenuItem.find(query)
      .populate("category", "name")
      .select("itemName price category ingredients")
      .lean();

    // // Convert DB items to FE-ready shape
    const enrichedItems = dbItems.map((item) => ({
      name: item.itemName?.en || "",
      price: item.price || 0,
      category: item.category?.name || "",
      ingredients: item.ingredients || [],
    }));

    // If no dishes match
    // if (enrichedItems.length === 0) {
    //   return {
    //     reply: `Sorry, we don’t have any dishes without ${ingredientArray.join(
    //       " and "
    //     )}.`,
    //     intent,
    //     items: [],
    //     tableId: tableId || "",
    //     specialInstructions: specialInstructions || "",
    //   };
    // }

    // Natural reply text
    const responseText = `Here are some dishes without ${ingredientArray.join(
      " and "
    )}: ${enrichedItems
      .map((i) => `${i.name} (₹${i.price})`)
      .slice(0, 5)
      .join(", ")}.`;

    return {
      reply: reply,
      intent,
      items: enrichedItems,
      tableId: tableId || "",
      specialInstructions: specialInstructions || "",
    };
  } catch (err) {
    console.error("handleIngredientFilter error:", err);
    return {
      reply: "Something went wrong while filtering dishes.",
      intent,
      items: [],
      tableId: tableId || "",
      specialInstructions: specialInstructions || "",
    };
  }
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
      reply: `Sorry, no ${
        isVeg ? "vegetarian" : "non-vegetarian"
      } dishes found.`,
      items: [],
    };
  }

  return {
    reply: `Here are today's ${
      isVeg ? "vegetarian" : "non-vegetarian"
    } options: ${filteredItems.map((i) => i.itemName.en).join(", ")}`,
    items: filteredItems,
  };
};

// 5. Menu Browsing by Category
const handleMenuBrowsing = async (category, reply, intent, tableId) => {
  const categoriesToSearch = category
    ? Array.isArray(category)
      ? category
      : [category]
    : [];

  const categoryDocs =
    categoriesToSearch.length > 0
      ? await Category.find({
          name: {
            $in: categoriesToSearch.map((cat) => new RegExp(`^${cat}$`, "i")),
          },
        })
      : await Category.find({});

  if (categoryDocs.length === 0) {
    return {
      reply: `Sorry, we couldn’t find anything under ${
        categoriesToSearch.join(", ") || "menu"
      }.`,
      items: [],
      intent,
      category,
      tableId,
    };
  }

  const categoryIds = categoryDocs.map((doc) => doc._id);
  const items = await MenuItem.find({
    category: { $in: categoryIds },
  }).populate("category");

  return { reply, intent, items, tableId };
};

/* ───────────────
   🔹 Main Route
   ─────────────── */
router.post("/ai-order", async (req, res) => {
  const {
    message,
    lang = "en",
    tableId,
    previousMessages,
    suggestedItems,
  } = req.body;

  if (!message)
    return res.status(400).json({ message: "Message is required." });

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

    const cleanedLowerMessage = cleanMessage(message);

    // Handle each intent
    if (intent === "filter_by_jain") {
      return res.json(await handleJainFilter(lang));
    }

    if (intent === "order_item") {
      return res.json(
        await handleOrderItem(items, reply, tableId, specialInstructions)
      );
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

    if (intent === "greeting") {
      return res.json({ items, reply, intent });
    }

    if (
      /(veg|vegetarian|वेज|शाकाहारी)/i.test(cleanedLowerMessage) &&
      !/(non[- ]?veg|non[- ]?vegetarian|नॉन[- ]?वेज|मांसाहारी)/i.test(
        cleanedLowerMessage
      )
    ) {
      return res.json(await handleVegNonVegFilter(true));
    }

    if (
      /(non[- ]?veg|non[- ]?vegetarian|नॉन[- ]?वेज|मांसाहारी)/i.test(
        cleanedLowerMessage
      )
    ) {
      return res.json(await handleVegNonVegFilter(false));
    }

    if (intent === "menu_browsing") {
      return res.json(
        await handleMenuBrowsing(category, reply, intent, tableId)
      );
    }

    // Fallback handler
    if (intent === "fallback") {
      // Try matching category or items manually
      const allMenuItems = await MenuItem.find().populate("category").lean();

      const matchedCategory =
        (await Category.findOne({
          "name.en": { $regex: message, $options: "i" },
        })) ||
        (await Category.findOne({
          "name.hi": { $regex: message, $options: "i" },
        }));

      if (matchedCategory) {
        const categoryItems = allMenuItems.filter(
          (item) =>
            item.category?._id.toString() === matchedCategory._id.toString()
        );

        if (categoryItems.length > 0) {
          return res.json({
            intent: "menu_browsing",
            category: [matchedCategory.name.en || matchedCategory.name.hi],
            reply:
              lang === "hi"
                ? `हमारी ${
                    matchedCategory.name.hi || matchedCategory.name.en
                  } की विशेषता:\n- ${categoryItems
                    .map(
                      (i) => `${i.itemName.hi || i.itemName.en} (₹${i.price})`
                    )
                    .join("\n- ")}`
                : `Our ${
                    matchedCategory.name.en
                  } specials are:\n- ${categoryItems
                    .map((i) => `${i.itemName.en} (₹${i.price})`)
                    .join("\n- ")}`,
            items: categoryItems,
            tableId,
            specialInstructions: "",
          });
        }
      }

      // If no match found, standard friendly fallback
      return res.json({
        intent: "fallback",
        reply:
          lang === "hi"
            ? "माफ़ करें, मैं पूरी तरह समझ नहीं पाया। क्या आप मेन्यू से कुछ देखना चाहेंगे?"
            : "Sorry, I didn’t quite get that. Would you like to check the menu?",
        items: [],
        tableId,
        specialInstructions: "",
      });
    }
  } catch (error) {
    console.error("🔥 AI Order Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
