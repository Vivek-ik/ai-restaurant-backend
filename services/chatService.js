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
- Understand user intent.
- If the user asks about a category (like South Indian, dessert, starters), filter the menu by that.
- If the user gives customizations like "less spicy", "without onion", "extra cheese", extract them as special instructions or customizations.
- For ingredient queries, check if the ingredient exists in any menu items.
- For ordering, extract item names, quantity, and customizations.
- Include special instructions like “less spicy”, “without onion”, “extra cheese” for each item **under item.specialInstructions** when mentioned.

Example:
User: I want 2 masala dosa less spicy and 1 paneer tikka without onion.


- Respond in JSON format as:
{
  "intent": "order_item" | "cancel_order" | "ask_price" | "customize_order" | "greet" | "bye" | "ingredient_query" | "menu_browsing" | ask_discount | check_order_status | place_order | fallback,
  "items": [{ "name": "Item Name", "quantity": 2, "specialInstructions": "without onion, less spicy"  }], // optional: e.g., Cold Coffee
  "ingredient": "onion", // optional: ["less sugar"]
  "category": "Main Course", "South Indian", "Dessert", "Beverages", "Appetizers",
  "reply": "Your response to the user."
}
  User can speak Hinglish or English. Be friendly and concise.

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
