// services/chatService.js
import { OpenAI } from "openai";
import dotenv from "dotenv";
import MenuItem from "../models/MenuItem.js";
import Fuse from "fuse.js";
import { ingredientKnowledge } from "../constants.js";
import Category from "../models/Category.js";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handleChatQuery = async (
  message,
  lang = "en",
  previousMessages = [],
  suggestedItems = []
) => {
  const menuItems = await MenuItem.find().populate("category").lean();

  const fuse = new Fuse(menuItems, {
    keys:
      lang === "hi"
        ? ["itemName.hi", "itemName.en"]
        : ["itemName.en", "itemName.hi"],
    threshold: 0.4,
  });
  // console.log("suggestedItems", suggestedItems);

  const results = fuse.search(message);
  let clarificationPrompt = "";

  if (results.length > 0) {
    const topMatch = results[0].item.itemName.en;
    clarificationPrompt = `The user might be referring to "${topMatch}". If correct, suggest it.`;
  }

  const categories = await Category.find();

  const menuText = categories
    .map((cat) => {
      const itemsInCat = menuItems
        .filter((item) => item.category?.name === cat.name)
        .map((item) => `- ${item.itemName.en} (₹${item.price})`)
        .join("\n");

      return `${cat.name}\n${itemsInCat}`;
    })
    .join("\n\n");

  // 🔄 Track previously mentioned dishes or categories
  const lastAIResponse = [...previousMessages];

  let lastSuggestedItems = [];

  if (lastAIResponse?.text) {
    // First try extracting via regex
    const itemMatches = [
      ...lastAIResponse.text.matchAll(
        /(?:includes|have|offers|dishes like|such as|here are|We have|in the|category|yah|order).*?((?:\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b)(?:,? ?(?:and)? ?\b[A-Z][a-z]+)*)/gi
      ),
    ];

    console.log("itemMatches", itemMatches);

    // 🔄 Track previously mentioned dishes or categories
    const lastAIMessage = [...previousMessages]
      .reverse()
      .find((m) => m.from === "ai" && m.items?.length > 0);

    if (lastAIMessage?.items?.length) {
      lastSuggestedItems = lastAIMessage.items
        .map((i) => i.itemName?.en)
        .filter(Boolean);
    } else if (suggestedItems?.length > 0) {
      lastSuggestedItems = suggestedItems;
    }
  }

  // ✅ Emoji cleanup - remove spelled-out emoji names (e.g., ":waving_hand:")
  const cleanedMessage = message.replace(/:[^:\s]*(?:::[^:\s]*)*:/g, "");

  // Detect excluded ingredients
  const exclusionRegex = new RegExp(
    [
      "\\b(?:without|no|skip|avoid|exclude|hat(?:a)?\\s*do|nahin\\s*chahiye|nahi\\s*ho|mat\\s*ho|bina|binna|बिना)\\s+(onion|garlic|lehsun|lahsun|pyaaz|pyaz)\\b",
      "\\b(onion|garlic|lehsun|lahsun|pyaaz|pyaz)\\s+(nahin\\s*chahiye|nahi\\s*ho|mat\\s*ho|avoid\\s*karo|hat(?:a)?\\s*do)\\b",
    ].join("|"),
    "gi"
  );

  const ingredientQueryRegex = new RegExp(
    [
      "\\b(?:mein|me|contains|have|has|hai|kya\\s*hai|hai\\s*ya\\s*nahi)\\b\\s*(onion|garlic|lehsun|lahsun|pyaaz|pyaz|बिना)",
      "(onion|garlic|lehsun|lahsun|pyaaz|pyaz)\\s*(hai|kya\\s*hai|hai\\s*ya\\s*nahi)",
    ].join("|"),
    "gi"
  );

  const exclusions = [];
  let match;
  while ((match = exclusionRegex.exec(cleanedMessage)) !== null) {
    exclusions.push(match[1]?.toLowerCase());
  }

  let ingredientQuery = "";
  let ingredientMatch;
  while (
    (ingredientMatch = ingredientQueryRegex.exec(cleanedMessage)) !== null
  ) {
    ingredientQuery =
      ingredientMatch[1]?.toLowerCase() || ingredientMatch[2]?.toLowerCase();
  }

  // 📌 Language instruction for response
  const responseLanguageNote =
    lang === "hi"
      ? `⚠️ Reply in Hindi language (Devanagari), but wrap it in proper JSON containing the following fields: "intent", "items", "ingredient", and "reply". Wrap the full response in a JSON block exactly like shown below. Do not add anything outside the JSON and "reply" should be in Hindi.`
      : `⚠️ Reply in English. You MUST respond with a valid JSON object containing the following fields: "intent", "items", "ingredient", and "reply". Wrap the full response in a JSON block exactly like shown below. Do not add anything outside the JSON.`;
  const systemPrompt = `
  You are a smart restaurant assistant for Bob's cafe. You help users with food menu queries and orders.

  ${responseLanguageNote}

  Here are the valid food categories in this restaurant:
  - South Indian
  - Chinese
  - Main Course
  - Breads
  - Dessert
  - Beverages
  - Appetizers

  Only use the above categories for answering category-based queries.
  Here are ingredients used in some menu items:
  ${ingredientKnowledge}

  Here is the menu:
  ${menuText}

  ${clarificationPrompt}

  Your tasks:

You are a smart restaurant assistant for Bob's Cafe. You help users with food menu queries and orders.

${responseLanguageNote}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📘 Restaurant Info:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Valid categories (use only these):
- South Indian
- Chinese
- Main Course
- Breads
- Dessert
- Beverages
- Appetizers

🧠 Ingredient Knowledge:
${ingredientKnowledge}

📋 Menu:
${menuText}

📢 Clarification Prompt (if needed):
${clarificationPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 Instructions for AI:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✔️ Understand and detect the user's **intent** from their message.

✔️ User can speak in Hinglish or English. Be friendly and concise.

✔️ You must respond in a **valid JSON format** like this:

{
  "intent": "order_item" | "cancel_order" | "ask_price" | "filter_by_ingredients" | "customize_order" | "greet" | "bye" | "ingredient_query" | "menu_browsing" | "ask_discount" | "check_order_status" | "place_order" | "fallback",
  "items": [{ 
    "name": "Item Name", 
    "quantity": 2, 
    "specialInstructions": "without onion, less spicy",  
    "price": 180  
  }],
  "ingredient": "onion",
  "category": ["South Indian", "Chinese"],
  "reply": "Sure, I've added Masala Dosa and Paneer Tikka to your cart. Please tap Add to Cart to proceed."
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧾 Response Rules:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔸 INTENT DETECTION:
- “mujhe yeh order karna hai”, “order this”, or “get me this” (as a follow-up): refer to last suggested item like "${lastSuggestedItems?.[0]}" and treat as "order_item".
- If dish name is mentioned without clear ordering phrase, treat it as "ingredient_query" or "menu_browsing".

🔸 MENU BROWSING:
- If user asks for categories like "South Indian", "desserts", return "intent: menu_browsing" and set \`category\` to the matched string or array from the valid list.
- DO NOT invent new categories.

🔸 INGREDIENT QUERIES:
- "Bina lahsun pyaaz ke options dikhaiye" → 
  {
    "intent": "filter_by_ingredients",
    "ingredient": "onion, garlic",
    "mode": "exclude"
  }

- "Tamatar wali dish dikhao" → 
  {
    "intent": "filter_by_ingredients",
    "ingredient": "tomato",
    "mode": "include"
  }

🔸 ORDER ITEMS:
- Only set intent to "order_item" if user clearly says “I want”, “get me”, “add”, “2 plates of”, “order”, “mujhe yeh chahiye”.
- DO NOT confirm the order — assume user will tap Add to Cart manually.
- Include "specialInstructions" such as "less spicy", "without onion", etc.

🔸 INGREDIENT QUERY:
- If user asks “What is in Paneer Butter Masala?”, respond with intent: "ingredient_query", and return:
  {
    "intent": "ingredient_query",
    "items": [{ 
      "name": "Paneer Butter Masala",
      "ingredients": ["paneer", "onion", "tomatoes", ...] 
    }],
    "ingredient": "",
    "reply": "Paneer Butter Masala includes paneer, onion, tomato, butter..."
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 Examples:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. User: I want 2 masala dosa less spicy and 1 paneer tikka without onion.
→ 
{
  "intent": "order_item",
  "items": [
    { "name": "Masala Dosa", "quantity": 2, "specialInstructions": "less spicy" },
    { "name": "Paneer Tikka", "quantity": 1, "specialInstructions": "without onion" }
  ],
  "reply": "Added Masala Dosa and Paneer Tikka as requested.",
  ...
}

2. User: बिना लहसुन प्याज़ के ऑप्शंस दिखाओ
→ 
{
  "intent": "filter_by_ingredients",
  "ingredient": "onion, garlic",
  "mode": "exclude",
  "reply": "यह रहे बिना लहसुन और प्याज के विकल्प: Idli, Veg Biryani..."
}

3. User: What is in Paneer Butter Masala?
→ 
{
  "intent": "ingredient_query",
  "items": [{ "name": "Paneer Butter Masala", "ingredients": [...] }],
  "reply": "It includes paneer, tomato, cashew paste, onion, garlic..."
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Goal: Always return a clean JSON matching user intent using real menu items and ingredients. Never hallucinate or add categories not listed.

  
  
  
  - Understand user intent.
  - If the user asks about a category (like South Indian, dessert, starters), filter the menu by that.
  - Include special instructions like “less spicy”, “without onion”, “extra cheese” for each item **under item.specialInstructions** when mentioned.
  + For ingredient queries, use the dish name as item field and list the ingredients under ingredients as an array of strings.
  + Example: If user asks "What are the ingredients in Paneer Butter Masala?", respond as:
  - Do NOT assume the user wants to order just because they mention a dish name.
  - Only extract an item under "items" if the user clearly shows intent to order — e.g. uses phrases like “I want”, “get me”, “order”, “2 plates of”, “add”, “mujhe yeh chahiye”, “mujhe yeh order karna hai”, etc.
  - In case the user says "mujhe yeh order karna hai" or "Mujhe yah order kar do" or "get me this" **as a follow-up**, refer to the previously suggested dish (like "${lastSuggestedItems?.[0]}") and treat it as the intended order item.
  - If the user is just naming a dish or asking about it (e.g., "Masala Dosa" or "What is Masala Dosa"), do not treat it as an order. Instead, detect it as an ingredient_query or menu_browsing.
  + "Bina lahsun pyaaz ke options dikhaiye" → intent: filter_by_ingredients, ingredient: "onion, garlic", mode: "exclude"
  + "Tamatar wali dish dikhao" → intent: filter_by_ingredients, ingredient: "tomato", mode: "include"

  Important:
  - For \`order_item\` intent, return structured items with item name, quantity, and special instructions. DO NOT confirm the order directly — assume user will add it to cart manually, ut if you don't find the item then reply with please mention the dish name to order or ask mujhe menuu dikhao.
  - Include special instructions like “less spicy”, “without onion”, “extra cheese” for each item **under item.specialInstructions** when mentioned.
  - If the user asks about a category (like "South Indian", "Chinese", etc), return it in the field \`category\` as a string or array of strings **exactly matching the list above**.
  - If the user asks for multiple categories, return them in an array: ["South Indian", "Chinese"]
  - Do not invent or guess categories beyond this list.

  Example:
  - User: I want 2 masala dosa less spicy and 1 paneer tikka without onion.
  - "Bina lahsun pyaaz ke options dikhaiye" → intent: filter_by_ingredients, ingredient: "onion, garlic"

  - Respond in JSON format as:
  {
    "intent": "order_item" | "cancel_order" | "ask_price" | "filter_by_ingredients" | "customize_order" | "greet" | "bye" | "ingredient_query" | "menu_browsing" | ask_discount | check_order_status | place_order | fallback,
    "items": [{ "name": "Item Name", "quantity": 2, "specialInstructions": "without onion, less spicy",  "price": 180  }],
    "ingredient": "onion",
    "category": ["South Indian", "Chinese"],
    "reply": "Sure, I've added Masala Dosa and Paneer Tikka to your cart. Please tap Add to Cart to proceed."
  }

  User can speak Hinglish or English. Be friendly and concise.
  `;

  const messageHistory = previousMessages
    .filter((msg) => !!msg.text) // ✅ only keep messages with valid text
    .slice(-4)
    .map((msg) => ({
      role: msg.from === "user" ? "user" : "assistant",
      content: msg.text,
    }));

  console.log("messageHistory", messageHistory);

  // ✨ Add last suggested item in context if applicable

  if (lastSuggestedItems.length === 1) {
    messageHistory.push({
      role: "system",
      content: `Only one item was suggested earlier: "${lastSuggestedItems[0]}". If the user says "mujhe yeh, yeh, yah", assume they mean this.`,
    });
  } else if (lastSuggestedItems.length > 1) {
    messageHistory.push({
      role: "system",
      content: `Multiple items were suggested earlier: ${lastSuggestedItems.join(
        ", "
      )}. If the user says "yeh", ask them to clarify which one.`,
    });
  }

  // Add this BEFORE sending to OpenAI
  let finalUserMessage = cleanedMessage;

  if (exclusions.length > 0) {
    finalUserMessage =
      `User wants dishes without: ${exclusions.join(", ")}. ` +
      finalUserMessage;
  }

  if (ingredientQuery) {
    console.log("here is ingredient query", ingredientQuery);

    finalUserMessage =
      `User is asking if a dish contains: ${ingredientQuery}. ` +
      finalUserMessage;
  }

  // If user message is vague and contains "yeh", "this", "ye item", etc. — inject clarification
  const vagueOrderRegex =
    /\b(yeh|ye|this|ye item|ye wala|isse|isko|isey|order karo|mujhe yeh chahiye|mujhe yeh order karna hai)\b/i;
  const isVagueOrder = vagueOrderRegex.test(cleanedMessage);
  console.log("previuoss mess:", previousMessages);

  // later can be used
  if (isVagueOrder && lastSuggestedItems.length === 1) {
    finalUserMessage += ` (User is referring to: "${lastSuggestedItems[0]}")`;
  } else if (isVagueOrder && lastSuggestedItems.length > 1) {
    finalUserMessage += ` (User said 'yeh' but multiple items were suggested: ${lastSuggestedItems.join(
      ", "
    )}. Ask them to specify.)`;
  }

  if (isVagueOrder) {
    finalUserMessage += ` (User gave a vague order using "yeh". Ask them to clearly mention the dish name to proceed.)`;
  }
  console.log("lastSuggestedItem", lastSuggestedItems);

  if (exclusions.length > 0) {
    finalUserMessage =
      `User wants dishes without: ${exclusions.join(", ")}. ` +
      finalUserMessage;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...messageHistory,
    { role: "user", content: finalUserMessage },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages,
    temperature: 0.2,
  });

  const rawReply = completion.choices[0].message.content;
  console.log("rawReply", rawReply);

  console.log("LLM Chat Response:", rawReply);

  // ✅ Add a try/catch with a proper check before parsing
  try {
    const jsonReply = JSON.parse(rawReply);

    console.log("exclusions", exclusions);

    // Optional fix for ingredient_query intent fallback:
    if (exclusions.length > 0 && jsonReply.intent === "menu_browsing") {
      jsonReply.intent = "ingredient_query";
      jsonReply.ingredient = exclusions.join(", ");
      jsonReply.reply = `Here are dishes that do not contain: ${exclusions.join(
        ", "
      )}`;
    }

    return jsonReply;
  } catch (err) {
    console.log("LLM Chat Response (non-JSON):", rawReply);
    return {
      intent: "fallback",
      items: [],
      reply: rawReply,
      specialInstructions: "",
      tableId: "1",
    };
  }
};

export const detectIntentAndEntities = async (message, lang = "en") => {
  const prompt = `
You are a restaurant assistant. Detect the user's intent and extract structured details and entities from the user message related to food preferences or orders.

User message: "${message}"

Your goal:
- If the user says phrases like "bina pyaaz", "without onion", "no garlic", or "jain food", treat it as an \`ingredient_query\`.
- If they are browsing or asking what is available, it’s \`menu_browsing\`.
- Only use \`customize_order\` if the user wants to modify items already in cart or placed.
- If user shows order intent ("I want 2 dosa", "Add paneer tikka"), it’s \`order_item\`.
- "filter_by_ingredients" – user wants to browse dishes that do NOT include specific ingredients (e.g., onion, garlic, Jain food)


Return this JSON:
{
  "intent": "order_item" | "cancel_order" | "ask_price" | "customize_order" | "greet" | "bye" | "ingredient_query" | "menu_browsing",
  "entities": {
    "items": [{ "name": "Item Name", "quantity": 2, "price": 180 }],
    "ingredient": "onion",
    "category": "South Indian",
    "specialInstructions": "without garlic"
  }
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: message },
    ],
    temperature: 0.2,
  });

  const rawText = response.choices[0].message.content;
  console.log("Intent Entity Extraction Response:", rawText);

  const json = JSON.parse(rawText);
  return json;
};
