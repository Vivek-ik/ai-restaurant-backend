// services/chatService.js
import { OpenAI } from "openai";
import dotenv from "dotenv";
import MenuItem from "../models/MenuItem.js";
import Fuse from "fuse.js";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});



export const handleChatQuery = async (message, lang = "en", intent = "", entities = {}) => {
const menuItems = await MenuItem.find().populate('category').lean();

  const fuse = new Fuse(menuItems, {
    keys: ["itemName.en", "itemName.hi"],
    threshold: 0.4,
  });

  const results = fuse.search(message);
  let clarificationPrompt = "";

  if (results.length > 0) {
    const topMatch = results[0].item.itemName.en;
    clarificationPrompt = `The user might be referring to "${topMatch}". If correct, suggest it.`;
  }

  const menuText = menuItems.map((item) => `- ${item.itemName.en}`).join("\n");

  const systemPrompt = `
You are a smart restaurant assistant for Shrimaya. You help users with food menu queries and orders.

Here is the menu:
${menuText}

${clarificationPrompt}

Your tasks:
- Understand user intent
- If user asks ingredient query, check if the ingredient exists in menu item ingredients.
- If user asks to browse the menu, list available items.
- For ordering, extract item names, quantity, and special instructions.
- Respond in JSON format as:
{
  "intent": "order_item" | "cancel_order" | "ask_price" | "customize_order" | "greet" | "bye" | "ingredient_query" | "menu_browsing",
  "items": [{ "name": "Item Name", "quantity": 2 }],
  "ingredient": "onions",
  "category": "pizza",
  "reply": "Your response to the user."
}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
    temperature: 0.2,
  });

  const rawReply = completion.choices[0].message.content;
  console.log("LLM Chat Response:", rawReply);
  const jsonReply = JSON.parse(rawReply);
  return jsonReply;
};

export const detectIntentAndEntities = async (message, lang = "en") => {
  const prompt = `
You are a restaurant assistant. Detect the user's intent and extract structured details and entities from the user message related to restaurant ordering.

User message: "${message}"

Return JSON in this format:
{
  "intent": "order_item" | "cancel_order" | "ask_price" | "customize_order" | "greet" | "bye" | "ingredient_query" | "menu_browsing",
  "entities": {
    "items": [{ "name": "Item Name", "quantity": 2 }],
    "ingredient": "onions",
    "category": "pizza",
    "specialInstructions": "less spicy"
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
