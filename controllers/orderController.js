// controllers/orderController.js

import MenuItem from "../models/MenuItem.js";
import Order from "../models/Order.js";
import { detectLanguage } from "../services/languageService.js";
import { handleChatQuery } from "../services/chatService.js";
import Cart from "../models/Cart.js";

// GET /api/menu
export const getMenu = async (req, res) => {
  try {
    const items = await MenuItem.find();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/chat
export const processChat = async (req, res) => {
  try {
    const { message } = req.body;
    const lang = detectLanguage(message);
    const response = await handleChatQuery(message, lang);
    res.json({ response, language: lang });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/orders
export const createOrder = async (req, res) => {
  try {
    const { tableNumber, items } = req.body;
console.log("tableNumber", tableNumber);

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const newOrder = new Order({
      tableNumber,
      items,
    });

    await newOrder.save();

    // ✅ Clear cart after placing order
    await Cart.findOneAndUpdate(
      { tableId: tableNumber },
      { $set: { items: [] } } // you can also use deleteOne if you want to remove the cart completely
    );

    res
      .status(201)
      .json({ message: "Order placed successfully", order: newOrder });
  } catch (error) {
    console.error("Order placement failed:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/orders
export const getOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate("items.itemId");
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
