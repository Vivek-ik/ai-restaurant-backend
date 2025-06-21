// app.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import orderRoutes from "./routes/orderRoutes.js";
import menuRoutes from "./routes/menuItem.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import cartRoutes from "./routes/cart.js";
import aiOrderRoute from './routes/aiOrderRoute.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/orders", orderRoutes);
app.use("/api/menu-items", menuRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use('/api', aiOrderRoute); // Add this


const uri =
  "mongodb+srv://devviveklodhi:KZNTDD8ayWlYW2Mv@ai-restraunt-app.n33cgjv.mongodb.net/?retryWrites=true&w=majority&appName=ai-restraunt-app";

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI || uri)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error(err));
