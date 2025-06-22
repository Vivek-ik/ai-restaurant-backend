import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import orderRoutes from "./routes/orderRoutes.js";
import menuRoutes from "./routes/menuItem.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import cartRoutes from "./routes/cart.js";
import aiOrderRoute from "./routes/aiOrderRoute.js";
import serverless from "serverless-http";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/orders", orderRoutes);
app.use("/api/menu-items", menuRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api", aiOrderRoute);

// Database connect
let isConnected = false;
const connectToDatabase = async () => {
  if (isConnected) return;
  const uri = process.env.MONGO_URI || "YOUR_FALLBACK_URI";
  await mongoose.connect(uri);
  isConnected = true;
  console.log("✅ MongoDB connected");
};

// Wrap serverless function
const handler = serverless(async (req, res, next) => {
  await connectToDatabase();
  return app(req, res, next);
});

export { handler };
