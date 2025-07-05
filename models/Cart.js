import mongoose from "mongoose";

const CartSchema = new mongoose.Schema({
  tableId: String,
  items: [
    {
      menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItem",
      },
      quantity: Number,
        customizations: {
          type: [String],
          default: [],
        },
    },
  ],
});

export default mongoose.model("Cart", CartSchema);
