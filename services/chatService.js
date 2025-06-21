// services/chatService.js
import { OpenAI } from "openai";
import dotenv from "dotenv";
import MenuItem from "../models/MenuItem.js";
import Fuse from "fuse.js";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


export const handleChatQuery = async (message, lang = "en") => {
  const menuItems = await MenuItem.find().lean();

  const fuse = new Fuse(menuItems, {
    keys: ["name"],
    threshold: 0.4, // adjust sensitivity
  });

  // Extract possible item names from user message (optional: use LLM or regex)
  const results = fuse.search(message);
  let clarificationPrompt = "";

  if (results.length > 0) {
    const topMatch = results[0].item.name;
    clarificationPrompt = `
      IMPORTANT: The user mentioned an item which seems to match "${topMatch}". If this looks correct, suggest it like:
      "Did you mean '${topMatch}'?"
      Otherwise proceed normally.
      `;
  }

  const menuText = menuItems.map((item) => `- ${item.name}`).join("\n");
  try {
    const systemPrompt =
      lang === "hi"
        ? "आप एक रेस्टोरेंट बॉट हैं जो मेनू समझाते हैं और ऑर्डर लेते हैं।"
        : `
You are a smart restaurant assistant for Shrimaya. You help users with food menu queries and orders.

Here is the menu:
${menuText}

${clarificationPrompt}

Your tasks:
1. Detect intent from user input.
2. Provide reply based on the intent.
3. Format your response as:
{
  "intent": "order_item" | "cancel_order" | "ask_price" | "other",
  "items": [ { "name": "Paneer Tikka", "quantity": 2, "specialInstructions": "extra spicy" } ],
  "reply": "Sure! I've added 2 Paneer Tikkas to your order. Anything else?"
}
`;

    const userPrompt = `User says: ${message}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // or "gpt-4" if available
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `user says: ${userPrompt}` },
      ],
      temperature: 0.2,
    });

    return completion.choices[0].message.content;
  } catch (err) {
    console.error("AI error:", err);
    res.status(500).json({ message: "Something went wrong" });
    return {
      intent: "other",
      reply: response,
    };
  }
};

export const detectIntentAndEntities = async (message, lang = "en") => {
  const prompt = `
You are a restaurant assistant. Detect the user's intent and extract structured details and entities from the user message related to restaurant ordering.

User message: "${message}"

Return JSON in this format:
{
  "intent": "order_item" | "cancel_order" | "ask_price" | "customize_order" | "greet" | "bye",
  "entities": {
    "items": [{ "name": "Item Name", "quantity": 2 }],
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
