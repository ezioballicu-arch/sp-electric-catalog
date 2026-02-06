const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

const { searchProducts } = require("./search/searchEngine");

// ==========================================
// CONFIGURATION (Production-safe)
// ==========================================
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const DATA_PATH = path.resolve(__dirname, "data", "products.json");

// ==========================================
// APPLICATION STATE
// ==========================================
let appState = {
  products: [],
  isReady: false,
  loadError: null,
  loadedAt: null,
  productCount: 0
};

// ==========================================
// STRUCTURED LOGGING
// ==========================================
const log = {
  info: (msg, data = {}) => console.log(`[INFO] ${msg}`, JSON.stringify(data)),
  error: (msg, error) => console.error(`[ERROR] ${msg}`, error?.message || error),
  warn: (msg, data = {}) => console.warn(`[WARN] ${msg}`, JSON.stringify(data)),
  debug: (msg, data = {}) => NODE_ENV === "development" && console.log(`[DEBUG] ${msg}`, JSON.stringify(data))
};

// ==========================================
// BOOTSTRAP: LOAD PRODUCTS (FAIL-SAFE)
// ==========================================
function loadProducts() {
  const startTime = Date.now();
  
  try {
    log.info("🔍 Loading products from disk", { path: DATA_PATH });
    
    // 1. Verify file exists
    if (!fs.existsSync(DATA_PATH)) {
      throw new Error(`File not found: ${DATA_PATH}`);
    }
    
    // 2. Check file size
    const stats = fs.statSync(DATA_PATH);
    log.info("📦 File size", { bytes: stats.size, mb: (stats.size / 1024 / 1024).toFixed(2) });
    
    if (stats.size === 0) {
      throw new Error("products.json is empty");
    }
    
    // 3. Read and parse JSON
    const rawData = fs.readFileSync(DATA_PATH, "utf8");
    const data = JSON.parse(rawData);
    
    // 4. Validate structure
    if (!Array.isArray(data)) {
      throw new Error("products.json must be an array");
    }
    
    if (data.length === 0) {
      log.warn("⚠️ products.json is empty array");
    }
    
    // 5. Update app state
    appState.products = data;
    appState.isReady = true;
    appState.loadedAt = new Date().toISOString();
    appState.productCount = data.length;
    appState.loadError = null;
    
    const loadTime = Date.now() - startTime;
    log.info("✅ Products loaded successfully", { 
      count: data.length, 
      loadTimeMs: loadTime 
    });
    
    return true;
    
  } catch (error) {
    log.error("❌ Failed to load products", error);
    
    appState.products = [];
    appState.isReady = false;
    appState.loadError = error.message;
    appState.productCount = 0;
    
    // CRITICAL: App continues but in degraded mode
    return false;
  }
}

// ==========================================
// EXPRESS APP SETUP
// ==========================================
const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// Request logging (production-safe)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    log.debug("HTTP Request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration
    });
  });
  next();
});

// ==========================================
// API ROUTES (BEFORE STATIC)
// ==========================================

/**
 * Health Check Endpoint
 * Returns: 200 if ready, 503 if degraded
 */
app.get("/health", (req, res) => {
  const health = {
    status: appState.isReady ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    products: {
      count: appState.productCount,
      loadedAt: appState.loadedAt,
      error: appState.loadError
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      env: NODE_ENV
    }
  };
  
  const statusCode = appState.isReady ? 200 : 503;
  res.status(statusCode).json(health);
  
  log.info("Health check", { status: health.status });
});

/**
 * Search Endpoint (Fail-safe)
 */
app.get("/search", (req, res) => {
  const query = String(req.query.q || "").trim();
  
  // Guard: Check if app is ready
  if (!appState.isReady) {
    log.warn("Search attempted while app not ready", { query });
    return res.status(503).json({
      error: "Service temporarily unavailable",
      message: "Product database is not loaded. Please try again in a moment.",
      query,
      count: 0,
      results: []
    });
  }
  
  // Guard: Validate query
  if (query.length < 2) {
    return res.json({
      query,
      count: 0,
      results: [],
      message: "Query too short (minimum 2 characters)"
    });
  }
  
  try {
    const startTime = Date.now();
    const results = searchProducts(appState.products, query);
    const searchTime = Date.now() - startTime;
    
    log.info("Search completed", { 
      query, 
      resultsCount: results.length,
      searchTimeMs: searchTime 
    });
    
    res.json({
      query,
      count: results.length,
      results,
      searchTimeMs: searchTime
    });
    
  } catch (error) {
    log.error("Search failed", error);
    res.status(500).json({
      error: "Search failed",
      message: "An error occurred while searching. Please try again.",
      query,
      count: 0,
      results: []
    });
  }
});

/**
 * Admin: Reload products (for maintenance)
 */
app.post("/admin/reload", (req, res) => {
  log.info("Manual reload requested");
  const success = loadProducts();
  res.json({
    success,
    productCount: appState.productCount,
    error: appState.loadError
  });
});

// ==========================================
// STATIC FILES (AFTER API)
// ==========================================
app.use(express.static(path.join(__dirname, "..")));

// ==========================================
// CATCH-ALL: SERVE INDEX.HTML
// ==========================================
app.get("*", (req, res) => {
  const indexPath = path.join(__dirname, "..", "index.html");
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    log.error("index.html not found", { path: indexPath });
    res.status(404).send("Application not found");
  }
});

// ==========================================
// ERROR HANDLER (LAST MIDDLEWARE)
// ==========================================
app.use((err, req, res, next) => {
  log.error("Unhandled error", err);
  res.status(500).json({
    error: "Internal server error",
    message: NODE_ENV === "development" ? err.message : "Something went wrong"
  });
});

// ==========================================
// BOOTSTRAP & START SERVER
// ==========================================
function startServer() {
  log.info("🚀 Starting SP Electric Catalog Server", {
    port: PORT,
    env: NODE_ENV,
    nodeVersion: process.version,
    dataPath: DATA_PATH
  });
  
  // Load products BEFORE starting server
  const loaded = loadProducts();
  
  if (!loaded) {
    log.warn("⚠️ Server starting in DEGRADED mode (products not loaded)");
  }
  
  // Start listening
  app.listen(PORT, () => {
    log.info("✅ Server is running", {
      url: `http://localhost:${PORT}`,
      productsLoaded: appState.isReady,
      productCount: appState.productCount
    });
    
    // Log health check URL
    log.info("💚 Health check available at", {
      url: `http://localhost:${PORT}/health`
    });
  });
}

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on("SIGTERM", () => {
  log.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  log.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

// ==========================================
// START APPLICATION
// ==========================================
startServer();

