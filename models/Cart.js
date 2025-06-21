import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MenuItem",
    required: true,
  },
  quantity: { type: Number, default: 1 },
  customizations: [String], // optional, for "No Onion", "Spicy", etc.
});

const CartSchema = new mongoose.Schema({
  tableId: String,
  items: [
    {
      menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItem",
      },
      quantity: Number,
      customizations: [String],
    },
  ],
});

export default mongoose.model("Cart", CartSchema);
