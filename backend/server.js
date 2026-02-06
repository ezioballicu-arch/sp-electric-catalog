const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

const { searchProducts } = require("./search/searchEngine");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "*" }));

const dataPath = path.join(__dirname, "data", "products.json");

console.log("🔍 Products file path:", dataPath);

function loadProducts() {
  console.log("📦 Loading products.json...");
  const raw = fs.readFileSync(dataPath, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error("products.json must be an array");
  }
  console.log(`✅ Loaded ${data.length} products`);
  return data;
}

let products = [];

function refreshProducts() {
  try {
    products = loadProducts();
  } catch (error) {
    console.error("❌ Failed to load products.json:", error.message);
    console.error("📁 Attempted path:", dataPath);
    products = [];
  }
}

refreshProducts();

// ==========================================
// API ROUTES (DEVONO ESSERE PRIMA DI STATIC)
// ==========================================

app.get("/search", (req, res) => {
  console.log("🔍 Search request:", req.query.q);
  const query = String(req.query.q || "").trim();
  const results = searchProducts(products, query);
  console.log(`✅ Found ${results.length} results for "${query}"`);
  res.json({ query, count: results.length, results });
});

app.get("/health", (_req, res) => {
  console.log("💚 Health check");
  res.json({ 
    status: "ok", 
    products: products.length,
    dataPath: dataPath,
    nodeEnv: process.env.NODE_ENV || "development"
  });
});

// ==========================================
// STATIC FILES (DOPO LE API)
// ==========================================

app.use(express.static(path.join(__dirname, "..")));

// ==========================================
// CATCH-ALL (ULTIMA ROUTE)
// ==========================================

app.get("*", (_req, res) => {
  console.log("📄 Serving index.html for:", _req.path);
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Smart Search backend listening on http://localhost:${PORT}`);
  console.log(`📊 Products loaded: ${products.length}`);
  console.log(`📁 Data path: ${dataPath}`);
});
