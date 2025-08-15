import mongoose from "mongoose";

const MenuSchema = new mongoose.Schema(
  {
    itemName: {
      en: { type: String, required: true },
      hi: { type: String },
    },
    description: {
      en: { type: String },
      hi: { type: String },
    },
    category: { type: String, required: true }, // Consider referencing another model if needed
    cuisine: { type: String },
    recipe: { type: String },

    jainOption: [{ type: String }], // e.g., ['Jain', 'Non Jain']

    ingredients: {
      en: { type: String },
      hi: { type: String },
    },

    allergies: [{ type: String }], // e.g., ['Fish', 'gluten']
    vegNonVeg: { type: String, enum: ["Veg", "Non Veg", "Egg"] },
    available: { type: Boolean, default: true },

    price: { type: Number, required: true },
    spiceLevel: { type: String, enum: ["Mild", "Medium", "Spicy", "None"] },
    prepTime: { type: String }, // e.g., '15 min'
    servingSize: { type: String }, // e.g., 'Serves 1 person'

    dietaryNotes: [{ type: String }], // e.g., ['High protein']
    calories: { type: Number },

    embedding: { type: [Number], index: "2dsphere" }, // store embedding
  },
  { timestamps: true }
);

export const Menu = mongoose.model("Menu", MenuSchema);
export default Menu;
