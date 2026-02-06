// DOM Elements
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearch");
const resultsList = document.getElementById("resultsList");
const resultsMeta = document.getElementById("resultsMeta");
const searchHint = document.getElementById("searchHint");
const cartToggle = document.getElementById("cartToggle");
const cartPanel = document.getElementById("cartPanel");
const closeCartBtn = document.getElementById("closeCart");
const cartItems = document.getElementById("cartItems");
const cartBadge = document.getElementById("cartBadge");
const cartTotal = document.getElementById("cartTotal");
const totalAmount = document.getElementById("totalAmount");
const sendOrderBtn = document.getElementById("sendOrderBtn");
const sendEmailBtn = document.getElementById("sendEmailBtn");
const clearCartBtn = document.getElementById("clearCart");
const toastContainer = document.getElementById("toastContainer");

// ==========================================
// CONFIGURATION
// ==========================================
const API_URL = window.location.origin + "/search";
const HEALTH_URL = window.location.origin + "/health";
const WHATSAPP_NUMBER = "393355994614";
const EMAIL_ADDRESS = "m.ballicu@sp-electric.it";
const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 150;
const MAX_RETRIES = 2;

// ==========================================
// APPLICATION STATE
// ==========================================
let appState = {
  cart: [],
  currentQuery: "",
  debounceTimer: null,
  searchInProgress: false,
  backendHealthy: null
};

// ==========================================
// DOM ELEMENTS (CACHED)
// ==========================================
const DOM = {
  searchInput: document.getElementById("searchInput"),
  clearSearchBtn: document.getElementById("clearSearch"),
  resultsList: document.getElementById("resultsList"),
  resultsMeta: document.getElementById("resultsMeta"),
  searchHint: document.getElementById("searchHint"),
  cartToggle: document.getElementById("cartToggle"),
  cartPanel: document.getElementById("cartPanel"),
  closeCartBtn: document.getElementById("closeCart"),
  cartItems: document.getElementById("cartItems"),
  cartBadge: document.getElementById("cartBadge"),
  cartTotal: document.getElementById("cartTotal"),
  totalAmount: document.getElementById("totalAmount"),
  sendOrderBtn: document.getElementById("sendOrderBtn"),
  sendEmailBtn: document.getElementById("sendEmailBtn"),
  clearCartBtn: document.getElementById("clearCart"),
  toastContainer: document.getElementById("toastContainer")
};

// ==========================================
// INITIALIZATION
// ==========================================
function init() {
  appState.cart = loadCartFromStorage();
  renderCart();
  setupEventListeners();
  checkBackendHealth();
}

// ==========================================
// BACKEND HEALTH CHECK (Fail-fast detection)
// ==========================================
async function checkBackendHealth() {
  try {
    const response = await fetch(HEALTH_URL, { 
      method: 'GET',
      timeout: 5000 
    });
    
    if (response.ok) {
      const health = await response.json();
      appState.backendHealthy = health.status === "ok";
      
      if (!appState.backendHealthy) {
        showToast("⚠️ Sistema in modalità degradata", "warning");
        console.warn("Backend degraded:", health);
      }
    } else {
      appState.backendHealthy = false;
    }
  } catch (error) {
    appState.backendHealthy = false;
    console.error("Health check failed:", error);
  }
}

// Local storage (Fail-safe)
function saveCartToStorage() {
  try {
    localStorage.setItem("cart", JSON.stringify(appState.cart));
  } catch (error) {
    console.error("Errore salvataggio carrello:", error);
    showToast("Errore salvataggio carrello", "error");
  }
}

function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem("cart");
    if (!saved) return [];
    
    const items = JSON.parse(saved);
    
    // Validazione e migrazione dati
    if (!Array.isArray(items)) {
      console.warn("Carrello corrotto, reset");
      return [];
    }
    
    return items.map(item => {
      // Validazione item
      if (!item.code || !item.description) {
        console.warn("Item invalido rimosso:", item);
        return null;
      }
      
      // Aggiungi campi mancanti
      if (typeof item.quantity !== 'number' || item.quantity < 1) {
        item.quantity = 1;
      }
      
      if (typeof item.priceValue !== 'number') {
        item.priceValue = parseFloat(item.price?.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
      }
      
      return item;
    }).filter(Boolean); // Rimuovi item null
    
  } catch (error) {
    console.error("Errore caricamento carrello:", error);
    showToast("Carrello ripristinato", "warning");
    return [];
  }
}

// Toast notifications
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ"
  };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;
  
  DOM.toastContainer.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

// Build grouped results
function buildGroupedResults(items) {
  const categoryOrder = [];
  const grouped = new Map();

  items.forEach((item) => {
    const category = item.category || "Senza categoria";
    const productName = item.name || "";

    if (!grouped.has(category)) {
      grouped.set(category, new Map());
      categoryOrder.push(category);
    }

    const productMap = grouped.get(category);
    if (!productMap.has(productName)) {
      productMap.set(productName, []);
    }

    productMap.get(productName).push(item);
  });

  return { categoryOrder, grouped };
}

// Evidenziazione testo cercato
function highlightText(text, query) {
  if (!query || !text) return text;
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

// Render results
function renderResults(items) {
  DOM.resultsList.innerHTML = "";

  if (!items.length) {
    DOM.resultsMeta.textContent = "Nessun risultato trovato";
    DOM.resultsList.innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">🔍</div>
        <p style="color:var(--gray-600);font-size:16px;margin:0;">Nessun prodotto corrisponde alla tua ricerca</p>
        <p style="color:var(--gray-500);font-size:14px;margin-top:8px;">Prova con altri termini</p>
      </div>
    `;
    return;
  }

  DOM.resultsMeta.textContent = `${items.length} ${items.length === 1 ? 'prodotto trovato' : 'prodotti trovati'}`;

  const { categoryOrder, grouped } = buildGroupedResults(items);

  categoryOrder.forEach((category) => {
    const categoryItem = document.createElement("div");
    categoryItem.className = "category-block";

    const categoryHeader = document.createElement("div");
    categoryHeader.className = "category-header";
    categoryHeader.textContent = category;

    categoryItem.appendChild(categoryHeader);

    const productMap = grouped.get(category);
    productMap.forEach((rows, productName) => {
      const productBlock = document.createElement("div");
      productBlock.className = "product-block";

      const productTitle = document.createElement("div");
      productTitle.className = "product-title";
      productTitle.innerHTML = highlightText(productName, appState.currentQuery);

      const productList = document.createElement("div");
      productList.className = "product-rows";

      rows.forEach((row) => {
        const rowEl = document.createElement("div");
        rowEl.className = "product-row";
        
        // Evidenziazione codice e descrizione
        const highlightedCode = highlightText(row.code || "", appState.currentQuery);
        const highlightedName = highlightText(row.name || "", appState.currentQuery);
        
        rowEl.innerHTML = `
          <span class="row-code">${highlightedCode}</span>
          <span class="row-desc">${highlightedName}</span>
          <span class="row-serial">${row.serial || ""}</span>
          <span class="row-price">${row.price || ""}</span>
          <button class="add-to-cart-btn" data-code="${row.code}" data-desc="${row.name}" data-price="${row.price}">➕ Aggiungi</button>
        `;
        productList.appendChild(rowEl);
      });

      productBlock.appendChild(productTitle);
      productBlock.appendChild(productList);
      categoryItem.appendChild(productBlock);
    });

    DOM.resultsList.appendChild(categoryItem);
  });
}

// ==========================================
// SEARCH (Fail-safe with retry)
// ==========================================
async function performSearch(query, retryCount = 0) {
  if (query.length < SEARCH_MIN_LENGTH) {
    DOM.resultsList.innerHTML = "";
    DOM.resultsMeta.textContent = "Inizia a cercare";
    DOM.searchHint.textContent = `Digita almeno ${SEARCH_MIN_LENGTH} caratteri per cercare`;
    DOM.clearSearchBtn.style.display = "none";
    appState.currentQuery = "";
    return;
  }

  appState.currentQuery = query;
  appState.searchInProgress = true;
  DOM.clearSearchBtn.style.display = "block";
  DOM.searchHint.textContent = "🔍 Ricerca in corso...";
  DOM.resultsMeta.textContent = "Caricamento...";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const response = await fetch(`${API_URL}?q=${encodeURIComponent(query)}`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Handle 503 (service unavailable)
      if (response.status === 503) {
        const error = await response.json();
        throw new Error(error.message || "Servizio temporaneamente non disponibile");
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    renderResults(data.results || []);
    DOM.searchHint.textContent = "";
    appState.searchInProgress = false;
    
  } catch (error) {
    console.error("Search failed:", error);
    appState.searchInProgress = false;
    
    // Retry logic (only for network errors, not 503)
    if (retryCount < MAX_RETRIES && error.name !== "AbortError") {
      console.log(`Retrying search (${retryCount + 1}/${MAX_RETRIES})...`);
      setTimeout(() => performSearch(query, retryCount + 1), 1000);
      return;
    }
    
    // Final failure
    DOM.resultsMeta.textContent = "Errore di connessione";
    DOM.searchHint.innerHTML = `<span style="color:var(--danger);">❌ ${error.message || "Impossibile connettersi al server"}</span>`;
    DOM.resultsList.innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <p style="color:var(--danger);font-size:16px;margin:0;font-weight:600;">Errore di connessione</p>
        <p style="color:var(--gray-600);font-size:14px;margin-top:8px;">${error.message || "Verifica la tua connessione internet"}</p>
        <button onclick="performSearch('${query.replace(/'/g, "\\'")}', 0)" style="margin-top:20px;padding:12px 24px;background:var(--primary);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Riprova</button>
      </div>
    `;
    showToast("Errore di ricerca", "error");
  }
}

// Cart functions
function addToCart(code, description, price) {
  // Validazione input
  if (!code || !description) {
    showToast("Errore: dati prodotto non validi", "error");
    return;
  }
  
  const existingItem = appState.cart.find(item => item.code === code);
  if (existingItem) {
    existingItem.quantity += 1;
    showToast(`Quantità aggiornata: ${code}`, "success");
  } else {
    // Estrai il prezzo numerico dalla stringa
    const priceValue = parseFloat(price.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    appState.cart.push({ 
      code, 
      description, 
      price: price,
      priceValue: priceValue,
      quantity: 1 
    });
    showToast(`Prodotto aggiunto: ${code}`, "success");
  }
  
  saveCartToStorage();
  renderCart();
}

function removeFromCart(index) {
  const removed = appState.cart[index];
  appState.cart.splice(index, 1);
  saveCartToStorage();
  renderCart();
  showToast(`${removed.code} rimosso`, "info");
}

function updateQuantity(index, change) {
  const item = appState.cart[index];
  item.quantity += change;
  
  if (item.quantity <= 0) {
    removeFromCart(index);
  } else {
    saveCartToStorage();
    renderCart();
  }
}

function calculateTotal() {
  return appState.cart.reduce((total, item) => {
    return total + (item.priceValue * item.quantity);
  }, 0);
}

function renderCart() {
  const totalQuantity = appState.cart.reduce((total, item) => total + item.quantity, 0);
  DOM.cartBadge.textContent = totalQuantity;

  if (appState.cart.length === 0) {
    DOM.cartItems.innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;margin-bottom:12px;opacity:0.3;">🛒</div>
        <p style="color:var(--gray-600);font-size:15px;margin:0;">Il carrello è vuoto</p>
        <p style="color:var(--gray-500);font-size:13px;margin-top:8px;">Aggiungi prodotti per iniziare</p>
      </div>
    `;
    DOM.cartTotal.style.display = 'none';
    return;
  }

  DOM.cartItems.innerHTML = appState.cart.map((item, index) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div style="font-weight: 600; color: #1f2937; font-family: 'Courier New', monospace; font-size: 13px;">${item.code}</div>
        <div style="font-size: 0.875rem; color: #6b7280; margin-top: 2px;">${item.description}</div>
        <div style="color: #10b981; font-weight: 600; margin-top: 4px; font-size: 14px;">${item.price}</div>
      </div>
      <div class="cart-item-controls">
        <div class="quantity-control">
          <button class="qty-btn" onclick="updateQuantity(${index}, -1)" ${item.quantity <= 1 ? 'title="Rimuovi prodotto"' : ''}>-</button>
          <span class="qty-display">${item.quantity}</span>
          <button class="qty-btn" onclick="updateQuantity(${index}, 1)">+</button>
        </div>
        <button class="remove-btn" onclick="removeFromCart(${index})" title="Rimuovi prodotto">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  `).join("");
  
  const total = calculateTotal();
  if (total > 0) {
    DOM.totalAmount.textContent = `€ ${total.toFixed(2).replace('.', ',')}`;
    DOM.cartTotal.style.display = 'flex';
  } else {
    DOM.cartTotal.style.display = 'none';
  }
}

// Toggle cart panel
function openCart() {
  DOM.cartPanel.classList.add("open");
}

function closeCart() {
  DOM.cartPanel.classList.remove("open");
}

// Send via WhatsApp
function sendOrderViaWhatsApp() {
  if (appState.cart.length === 0) {
    showToast("Il carrello è vuoto", "warning");
    return;
  }

  const items = appState.cart.map((item) => 
    `- Codice: ${item.code} | Descrizione: ${item.description} | Q.tà: ${item.quantity}`
  ).join("\n");
  
  const message = `Ciao Marco,\nquesti sono i prodotti che desidero ordinare:\n\n${items}\n\nGrazie.`;
  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;

  window.open(url, "_blank");
  showToast("Apertura WhatsApp in corso...", "success");
}

// Send via Email
function sendEmail() {
  if (appState.cart.length === 0) {
    showToast("Il carrello è vuoto", "warning");
    return;
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString('it-IT', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });

  const items = appState.cart.map((item) => 
    `- Codice: ${item.code} | Descrizione: ${item.description} | Q.tà: ${item.quantity}`
  ).join("\n");
  
  const subject = `Ordine prodotti – ${dateStr}`;
  const body = `Ciao Marco,\nquesti sono i prodotti che desidero ordinare:\n\n${items}\n\nGrazie.`;
  
  const mailtoLink = `mailto:${EMAIL_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoLink;
  showToast("Apertura email in corso...", "success");
}

// Event Listeners
function setupEventListeners() {
  // Cart toggle
  DOM.cartToggle.addEventListener("click", () => {
    openCart();
    if (appState.cart.length === 0) {
      showToast("Aggiungi prodotti per creare un ordine", "info");
    }
  });
  DOM.closeCartBtn.addEventListener("click", closeCart);

  // Search
  DOM.searchInput.addEventListener("input", (event) => {
    const value = event.target.value.trim();
    clearTimeout(appState.debounceTimer);
    appState.debounceTimer = setTimeout(() => performSearch(value), SEARCH_DEBOUNCE_MS);
  });

  // Clear search
  DOM.clearSearchBtn.addEventListener("click", () => {
    DOM.searchInput.value = "";
    appState.currentQuery = "";
    DOM.resultsList.innerHTML = "";
    DOM.resultsMeta.textContent = "Inizia a cercare";
    DOM.searchHint.textContent = "Digita almeno 2 caratteri per cercare";
    DOM.clearSearchBtn.style.display = "none";
    DOM.searchInput.focus();
  });

  // Add to cart
  DOM.resultsList.addEventListener("click", (event) => {
    if (event.target.classList.contains("add-to-cart-btn")) {
      const code = event.target.dataset.code;
      const desc = event.target.dataset.desc;
      const price = event.target.dataset.price;
      addToCart(code, desc, price);
      
      // Feedback visivo immediato
      const originalText = event.target.innerHTML;
      event.target.innerHTML = "✓ Aggiunto";
      event.target.style.background = "var(--secondary)";
      event.target.disabled = true;
      
      setTimeout(() => {
        event.target.innerHTML = originalText;
        event.target.style.background = "";
        event.target.disabled = false;
      }, 1500);
    }
  });

  // Actions
  DOM.sendOrderBtn.addEventListener("click", sendOrderViaWhatsApp);
  DOM.sendEmailBtn.addEventListener("click", sendEmail);
  DOM.clearCartBtn.addEventListener("click", () => {
    if (appState.cart.length === 0) {
      showToast("Il carrello è già vuoto", "info");
      return;
    }
    
    const itemCount = appState.cart.reduce((total, item) => total + item.quantity, 0);
    if (confirm(`Vuoi svuotare il carrello?\n${itemCount} ${itemCount === 1 ? 'prodotto' : 'prodotti'} ${itemCount === 1 ? 'sarà rimosso' : 'saranno rimossi'}.`)) {
      appState.cart = [];
      localStorage.removeItem("cart");
      renderCart();
      showToast("Carrello svuotato", "success");
    }
  });
}

// Start app
init();
