// models/Order.js
import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema({
  tableNumber: Number,
  items: [
    {
      itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItem",
      },
      quantity: Number,
      customizations: [String],
      note: String,
    },
  ],
  language: {
    type: String,
    enum: ["en", "hi", "hinglish"],
    default: "hinglish",
  },
  status: {
    type: String,
    // Todo in he next version: add more statuses
    // enum: ["pending", "received", "in_progress", "completed", "cancelled"],
    enum: ["pending", "in_progress", "completed"],
    default: "pending",
  },
  source: {
    type: String,
    enum: ["botpress", "manual"],
    default: "botpress",
  },
  botIntent: {
    type: String,
    default: "",
  },
  tableId: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Order = mongoose.model("Order", OrderSchema);
export default Order;
