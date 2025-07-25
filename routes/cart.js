import express from "express";
import Cart from "../models/Cart.js";
const router = express.Router();

//// Add or Update item in cart
import MenuItem from "../models/MenuItem.js";

router.post("/add", async (req, res) => {
  const { tableId, menuItemId, itemName, quantity, customizations } = req.body;

  try {
    let finalMenuItemId = menuItemId;

    // If menuItemId not provided but itemName is provided, lookup menuItemId
    if (!menuItemId && itemName) {
      const menuItem = await MenuItem.findOne({
        $or: [
          { "itemName.en": { $regex: new RegExp(`^${itemName}$`, "i") } },
          { "itemName.hi": { $regex: new RegExp(`^${itemName}$`, "i") } },
        ],
      });

      if (!menuItem) {
        return res
          .status(404)
          .json({ message: "Menu item not found with provided name." });
      }

      finalMenuItemId = menuItem._id.toString();
      console.log(
        `Resolved itemName '${itemName}' to menuItemId: ${finalMenuItemId}`
      );
    }

    if (!finalMenuItemId) {
      return res
        .status(400)
        .json({ message: "Either menuItemId or valid itemName is required." });
    }

    // Populate menuItem fully to allow name-based matching
    let cart = await Cart.findOne({ tableId }).populate("items.menuItem");

    if (!cart) {
      console.log(
        `No existing cart found for tableId: ${tableId}. Creating new cart.`
      );
      cart = new Cart({ tableId, items: [] });
    } else {
      console.log(`Existing cart found for tableId: ${tableId}.`);
    }

    const existingItem = cart.items.find((item) => {
      // Match by menuItemId
      if (item.menuItem && item.menuItem._id.toString() === finalMenuItemId) {
        console.log("Matched existing item in cart");
        return true;
      }
      return false;
    });

    if (existingItem) {
      console.log(`Item already exists in cart. Updating quantity.`);
      existingItem.quantity += quantity;
      if (customizations?.length) {
        console.log("Updating customizations:", customizations);
        existingItem.customizations = customizations;
      }
    } else {
      console.log(
        `Adding new item to cart with menuItemId: ${finalMenuItemId}`
      );
      cart.items.push({
        menuItem: finalMenuItemId,
        quantity,
        customizations,
      });
    }

    await cart.save();
    console.log("Cart successfully updated:", cart);
    res.status(200).json({ message: "Cart updated", cart });
  } catch (err) {
    console.error("Failed to update cart:", err);
    res.status(500).json({ message: "Failed to update cart", error: err });
  }
});

// Get cart for user
router.get("/:tableId", async (req, res) => {
  try {
    console.log("Fetching cart for tableId:", req.params.tableId);

    let cart = await Cart.findOne({ tableId: req.params.tableId }).populate(
      "items.menuItem"
    );

    console.log("cart", cart);

    res.status(200).json(cart || { tableId: req.params.tableId, items: [] });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch cart", error: err });
  }
});
// remove cart item
router.post("/remove-cart-item", async (req, res) => {
  const { tableId, itemId } = req.body;

  if (!tableId || !itemId) {
    return res.status(400).json({ error: "tableId and itemId are required" });
  }

  try {
    const cart = await Cart.findOne({ tableId });

    if (!cart) {
      return res.status(404).json({ error: "Order not found" });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.menuItem.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({ error: "Item not in order" });
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();

    // Re-populate the saved cart to include full menuItem details
    const updatedCart = await Cart.findOne({ tableId }).populate("items.menuItem");

    res.json({ message: "Item removed", items: updatedCart.items });
  } catch (error) {
    console.error("Remove item error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


router.post("/remove", async (req, res) => {
  const { tableId, menuItemId } = req.body;

  try {
    const cart = await Cart.findOne({ tableId }).populate("items.menuItem");

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.menuItem._id.toString() === menuItemId.toString()
    );

    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not found in cart" });
    }

    if (cart.items[itemIndex].quantity > 1) {
      cart.items[itemIndex].quantity -= 1;
    } else {
      cart.items.splice(itemIndex, 1); // Remove item if quantity is 1
    }

    await cart.save(); // ✅ Save first

    // ✅ Return full updated cart
    return res.status(200).json({
      message: "Item updated",
      cart: {
        items: cart.items,
        tableId: cart.tableId,
      },
    });
  } catch (err) {
    console.error("❌ Error in /remove:", err);
    return res.status(500).json({ message: "Failed to update cart", error: err });
  }
});


export default router;
