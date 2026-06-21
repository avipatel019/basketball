/* =========================================================
   Ember & Oak — interactivity
   ========================================================= */

// ---------- Product data ----------
const products = [
  {
    name: "Vanilla Bean & Amber",
    family: "warm",
    tag: "Bestseller",
    wax: "#d99a4e",
    scene: "linear-gradient(160deg,#f5e6cb,#eccfa1)",
    price: 32,
    burn: "55 hr burn",
    top: "Bergamot",
    heart: "Vanilla Orchid",
    base: "Amber, Tonka",
  },
  {
    name: "Sea Salt & Sage",
    family: "fresh",
    tag: "New",
    wax: "#7fa8a0",
    scene: "linear-gradient(160deg,#e3efeb,#c5ddd6)",
    price: 30,
    burn: "50 hr burn",
    top: "Sea Salt",
    heart: "Garden Sage",
    base: "Driftwood",
  },
  {
    name: "Smoked Cedar & Leather",
    family: "woody",
    tag: "Bestseller",
    wax: "#9c6b4a",
    scene: "linear-gradient(160deg,#e6d6c4,#cbb098)",
    price: 36,
    burn: "60 hr burn",
    top: "Black Pepper",
    heart: "Cedarwood",
    base: "Leather, Vetiver",
  },
  {
    name: "Lavender & Eucalyptus",
    family: "fresh",
    tag: "Spa",
    wax: "#9a8fc4",
    scene: "linear-gradient(160deg,#e8e4f1,#cfc6e6)",
    price: 30,
    burn: "52 hr burn",
    top: "Eucalyptus",
    heart: "French Lavender",
    base: "Chamomile",
  },
  {
    name: "Spiced Pumpkin & Clove",
    family: "warm",
    tag: "Seasonal",
    wax: "#c87f43",
    scene: "linear-gradient(160deg,#f3ddbf,#e6b985)",
    price: 34,
    burn: "55 hr burn",
    top: "Clove",
    heart: "Pumpkin",
    base: "Nutmeg, Maple",
  },
  {
    name: "Fresh Linen & Cotton",
    family: "fresh",
    tag: "Everyday",
    wax: "#aab9c4",
    scene: "linear-gradient(160deg,#eaf0f3,#d2dde4)",
    price: 28,
    burn: "50 hr burn",
    top: "Aloe",
    heart: "Cotton Flower",
    base: "White Musk",
  },
  {
    name: "Bergamot & Black Tea",
    family: "woody",
    tag: "Refined",
    wax: "#b89a5a",
    scene: "linear-gradient(160deg,#eee2c8,#dcc69a)",
    price: 32,
    burn: "55 hr burn",
    top: "Bergamot",
    heart: "Black Tea",
    base: "Smoked Wood",
  },
  {
    name: "Rose & Oud",
    family: "floral",
    tag: "Luxe",
    wax: "#c27b8e",
    scene: "linear-gradient(160deg,#f2dde3,#e2bcc9)",
    price: 40,
    burn: "60 hr burn",
    top: "Saffron",
    heart: "Damask Rose",
    base: "Oud, Amber",
  },
  {
    name: "Wild Fig & Cassis",
    family: "floral",
    tag: "New",
    wax: "#8a6b9c",
    scene: "linear-gradient(160deg,#e9def0,#d3bee2)",
    price: 34,
    burn: "52 hr burn",
    top: "Cassis",
    heart: "Fig Leaf",
    base: "Cedar, Musk",
  },
];

// ---------- Render products ----------
const productsEl = document.getElementById("products");

function productCard(p) {
  const el = document.createElement("article");
  el.className = "product reveal";
  el.dataset.family = p.family;
  el.style.setProperty("--scene", p.scene);
  el.innerHTML = `
    <div class="product__visual" style="--scene:${p.scene}">
      <span class="product__tag">${p.tag}</span>
      <div class="candle" style="--wax:${p.wax}">
        <span class="candle__flame"></span>
        <span class="candle__jar"></span>
      </div>
    </div>
    <div class="product__body">
      <h3 class="product__name">${p.name}</h3>
      <p class="product__notes">
        <b>Top:</b> ${p.top} · <b>Heart:</b> ${p.heart} · <b>Base:</b> ${p.base}
      </p>
      <div class="product__meta">
        <span class="product__price">$${p.price}</span>
        <span class="product__burn">${p.burn}</span>
      </div>
      <button class="add-btn" data-name="${p.name}">Add to cart</button>
    </div>
  `;
  return el;
}

products.forEach((p) => productsEl.appendChild(productCard(p)));

// ---------- Filtering ----------
const filterBar = document.getElementById("filters");
const allProductEls = () => Array.from(document.querySelectorAll(".product"));

function applyFilter(family) {
  allProductEls().forEach((el) => {
    const match = family === "all" || el.dataset.family === family;
    el.classList.toggle("hide", !match);
  });
}

filterBar.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter");
  if (!btn) return;
  filterBar.querySelectorAll(".filter").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  applyFilter(btn.dataset.filter);
});

// Collection cards jump to shop + filter
document.querySelectorAll(".collection-card").forEach((card) => {
  card.addEventListener("click", () => {
    const family = card.dataset.filter;
    filterBar.querySelectorAll(".filter").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.filter === family)
    );
    applyFilter(family);
    document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
  });
});

// ---------- Cart ----------
let cartCount = 0;
const cartCountEl = document.getElementById("cartCount");

function addToCart(name) {
  cartCount += 1;
  cartCountEl.textContent = cartCount;
  cartCountEl.classList.add("show");
  cartCountEl.animate(
    [{ transform: "scale(1.5)" }, { transform: "scale(1)" }],
    { duration: 300, easing: "ease-out" }
  );
  showToast(`Added “${name}” to your cart 🕯️`);
}

productsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".add-btn");
  if (btn) addToCart(btn.dataset.name);
});

document.getElementById("cartBtn").addEventListener("click", () => {
  showToast(
    cartCount === 0
      ? "Your cart is empty — go find your scent!"
      : `You have ${cartCount} candle${cartCount > 1 ? "s" : ""} ready to glow.`
  );
});

// ---------- Scent finder ----------
const moodMap = {
  relax: "Lavender & Eucalyptus",
  cozy: "Vanilla Bean & Amber",
  focus: "Bergamot & Black Tea",
  romance: "Rose & Oud",
  energize: "Sea Salt & Sage",
};
const moodBlurb = {
  relax: "Soft, herbal calm to melt the day away.",
  cozy: "Sweet, golden warmth for slow nights in.",
  focus: "Crisp and grounding — perfect for deep work.",
  romance: "Lush, velvety florals for candlelit evenings.",
  energize: "Bright, coastal freshness to wake the room.",
};

const moodsEl = document.getElementById("moods");
const resultEl = document.getElementById("finderResult");

moodsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".mood");
  if (!btn) return;
  moodsEl.querySelectorAll(".mood").forEach((m) => m.classList.remove("is-active"));
  btn.classList.add("is-active");

  const mood = btn.dataset.mood;
  const product = products.find((p) => p.name === moodMap[mood]);

  resultEl.innerHTML = `
    <div class="finder-card">
      <span class="mini-candle" style="--wax:${product.wax}"></span>
      <div>
        <p>We'd light…</p>
        <h3>${product.name}</h3>
        <p>${moodBlurb[mood]}</p>
        <a href="#shop" data-jump="${product.family}">Shop this scent →</a>
      </div>
    </div>
  `;
});

resultEl.addEventListener("click", (e) => {
  const link = e.target.closest("a[data-jump]");
  if (!link) return;
  e.preventDefault();
  const family = link.dataset.jump;
  filterBar.querySelectorAll(".filter").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.filter === family)
  );
  applyFilter(family);
  document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
});

// ---------- Nav: scroll state + mobile toggle ----------
const nav = document.getElementById("nav");
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 20);
});

navToggle.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  navToggle.classList.toggle("open", open);
  navToggle.setAttribute("aria-expanded", String(open));
});

navLinks.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    navLinks.classList.remove("open");
    navToggle.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  })
);

// ---------- Newsletter ----------
const form = document.getElementById("newsletterForm");
const note = document.getElementById("newsletterNote");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!valid) {
    note.style.color = "var(--terracotta)";
    note.textContent = "Please enter a valid email address.";
    return;
  }
  note.style.color = "var(--amber-deep)";
  note.textContent = "You're in! Check your inbox for 15% off ✨";
  form.reset();
});

// ---------- Toast ----------
const toast = document.getElementById("toast");
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// ---------- Scroll reveal ----------
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// ---------- Footer year ----------
document.getElementById("year").textContent = new Date().getFullYear();
