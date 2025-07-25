import mongoose from "mongoose";
const MenuItemSchema = new mongoose.Schema(
  {
    id: Number,
    itemName: {
      en: String,
      hi: String,
    },
    price: Number,
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    tags: [String],
    description: {
      en: { type: String, required: true },
      hi: { type: String },
    },
    image: String,
    available: Boolean,
    customizableOptions: [String],
    ingredients: [String],
    allergens: [String],
  },
  { timestamps: true }
);

const MenuItem = mongoose.model("MenuItem", MenuItemSchema);
export default MenuItem;
