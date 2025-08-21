// services/chatService.js
import { OpenAI } from "openai";
import dotenv from "dotenv";
import MenuItem from "../models/MenuItem.js";
import Fuse from "fuse.js";
import { ingredientKnowledge } from "../constants.js";
import Category from "../models/Category.js";
import XLSX from "xlsx";
import path from "path";
import fs from "fs";

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
  
  const menuFilePath = path.join(process.cwd(), "Menu (1).xlsx");
  const workbook = XLSX.readFile(menuFilePath);
  
  // Get first sheet
  const sheetName = workbook.SheetNames[0];
  const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  console.log("sheetData", sheetData);

  // Example structure
  const menuText = categories
    .map((cat) => {
      const itemsInCat = menuItems
        .filter((item) => item.category?.name === cat.name)
        .map((item) => `- ${item.itemName.en} (₹${item.price})`)
        .join("\n");

      return `${cat.name}\n${itemsInCat}`;
    })
    .join("\n\n");

  console.log("menuTextmenuText", menuText);

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📘 Restaurant Info
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Valid Categories (use only these — exact match required):
- South Indian
- Chinese
- Main Course
- Breads
- Dessert
- Beverages
- Appetizers
- Specials

🧠 Ingredient Knowledge:
${ingredientKnowledge}

📋 Menu:
${menuText}

📢 Clarification Prompt (if needed):
${clarificationPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 Instructions for AI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ **General Rules**
- Understand and detect the user's **intent** from their message.
- User can speak in Hinglish, Hindi, or English.
- Always return a **valid JSON object** exactly like:

2️⃣ **Intent Detection**
- Greetings ("hi", "hello", "hey", "namaste", "good morning", "good evening")  
  → intent: "greeting"
- “mujhe yeh order karna hai”, “order this”, “get me this”  
  → If follow-up, use last suggested item ("${lastSuggestedItems?.[0]}")  
  → intent: "order_item"
- Dish name without order phrase  
  → intent: "menu_browsing"
- If dish availability is asked ("X hai kya", "do you have X", "X available")  
  → intent: "menu_browsing", ingredient: "X"

3️⃣ **Menu Browsing**
- If user asks for category (e.g., "South Indian", "desserts")  
  → intent: "menu_browsing", category: matched string or array from valid list.
- DO NOT invent new categories.
- If multiple categories → return as array: ["South Indian", "Chinese"]

4️⃣ **Ingredient Queries**
- If asking "What is in X?"  
  → intent: "ingredient_query"
- Example:
  {
    "intent": "ingredient_query",
    "items": [{ "name": "Paneer Butter Masala", "ingredients": [...] }],
    "ingredient": "",
    "reply": "Paneer Butter Masala includes paneer, onion, tomato, butter..."
  }

5️⃣ **Filter by Ingredients**
- "Bina lahsun pyaaz ke options dikhaiye" →  
  { "intent": "filter_by_ingredients", "ingredient": "onion, garlic", "mode": "exclude" }
- "Tamatar wali dish dikhao" →  
  { "intent": "filter_by_ingredients", "ingredient": "tomato", "mode": "include" }
- Jain food or “without onion and garlic” → ingredient: "onion, garlic", mode: "exclude"
- Vegetarian → ingredient: "non-veg", mode: "exclude"
- Vegan → ingredient: "dairy, meat, egg", mode: "exclude"

6️⃣ **Special Keyword-based Filters**
- **Spicy dishes** ("masaledar khana", "spicy sabji") → ingredient: "spicy", mode: "include"
- **Mild dishes** ("simple khana", "कम मसालेदार") → ingredient: "mild", mode: "include"
- **Gravy dishes** ("gravy wali sabji") → ingredient: "gravy", mode: "include"
- **Dry dishes** ("sukhi sabji", "dry khana") → ingredient: "dry", mode: "include"
- **Vegetable dishes** ("veg options dikhao") → intent: "menu_browsing", category: ["Main Course"]

7️⃣ **Dish Availability / Ingredient-based Search**
- If user asks "X ki sabji dikhao" → intent: "menu_browsing", ingredient: "X"
- If they ask "What is in X" → intent: "ingredient_query"

8️⃣ **Specials & Recommendations**
If the user asks about:
- the restaurant's speciality,
- best dish here,
- recommended dishes,
- chef's special,
- "mujhe yahan ki speciality btao",
- "special dish kya hai",
- "yahan ka best food kya hai",
- "what is the most popular dish here",
- "recommend me something"

then:
  - Set intent to "menu_browsing"
  - Set category to ["Specials"] or to the relevant category containing the restaurant’s top dishes
  - Reply with a friendly message listing those dishes with their prices

9️⃣ **Examples**
1. User: I want 2 masala dosa less spicy and 1 paneer tikka without onion.  
→ {
  "intent": "order_item",
  "items": [...],
  "ingredient": "",
  "reply": "Added Masala Dosa and Paneer Tikka as requested."
}

2. User: बिना लहसुन प्याज़ के ऑप्शंस दिखाओ  
→ {
  "intent": "filter_by_ingredients",
  "ingredient": "onion, garlic",
  "mode": "exclude",
  "reply": "Here are the dishes without onion and garlic."
}

3. User: What is in Paneer Butter Masala?  
→ {
  "intent": "ingredient_query",
  "items": [...], 
  "ingredient": "",
  "reply": "It includes paneer, tomato, cashew paste, onion, garlic..."
}

4. User: "पनीर की सब्जी है क्या"  
→ {
  "intent": "menu_browsing",
  "items": [{ "name": "Paneer Butter Masala", "ingredients": [...] }],
  "ingredient": "paneer",
  "reply": "Yes, we have Paneer Butter Masala. Do you want to order it?"
}

5. User: "hi"  
→ {
  "intent": "greeting",
  "items": [],
  "ingredient": "",
  "reply": "Hello! Welcome to Bob's Cafe 👋. How can I help you today?"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 **Final Goal**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Always return clean JSON matching user intent.
- Use only real menu items & valid categories.
- No hallucinated categories, or menu  item.
- Preserve special instructions.
- Be concise & friendly.
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
