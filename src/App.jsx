import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search, ScanBarcode, ShoppingCart, Package, Boxes, Users, BarChart3,
  Wallet, UserCog, Settings as Cog, Plus, Minus, X, Trash2, Printer,
  CreditCard, QrCode, Banknote, Percent, StickyNote, Pause, RotateCcw,
  ChevronDown, Check, AlertTriangle, Wifi, ArrowLeft, Loader2, ImageOff,
  Building2, ListChecks, Landmark, ClipboardCheck, ChevronRight, Pencil,
  Archive, RefreshCw, ShieldAlert
} from "lucide-react";

/* ============================================================
   OFFLINE STORAGE LAYER — IndexedDB only. No network calls.
   ============================================================ */
const DB_NAME = "ipos-db";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("products")) db.createObjectStore("products", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sales")) db.createObjectStore("sales", { keyPath: "id" });
      if (!db.objectStoreNames.contains("held")) db.createObjectStore("held", { keyPath: "id" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}
const dbGet = (db, store, key) => new Promise((res, rej) => {
  const r = db.transaction(store, "readonly").objectStore(store).get(key);
  r.onsuccess = () => res(r.result || null);
  r.onerror = () => rej(r.error);
});
const dbGetAll = (db, store) => new Promise((res, rej) => {
  const r = db.transaction(store, "readonly").objectStore(store).getAll();
  r.onsuccess = () => res(r.result || []);
  r.onerror = () => rej(r.error);
});
const dbPut = (db, store, value) => new Promise((res, rej) => {
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  tx.oncomplete = () => res(value);
  tx.onerror = () => rej(tx.error);
});
const dbDelete = (db, store, key) => new Promise((res, rej) => {
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
});
const dbClear = (db, store) => new Promise((res, rej) => {
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
});
async function factoryReset(db) {
  for (const s of ["meta", "products", "sales", "held"]) await dbClear(db, s);
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
const fmt = (n) => "Rs. " + Math.round(Number(n) || 0).toLocaleString("en-PK");
const nowStr = () => new Date().toLocaleString("en-PK", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const DEFAULT_CATEGORIES = ["Beverages", "Snacks", "Dairy", "Personal Care", "Household"];
const ALL_PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: Banknote, core: true },
  { id: "card", label: "Card", icon: CreditCard, core: true },
  { id: "qr", label: "QR", icon: QrCode, core: true },
  { id: "jazzcash", label: "JazzCash", icon: Wallet, core: false },
  { id: "easypaisa", label: "Easypaisa", icon: Wallet, core: false },
  { id: "bank", label: "Bank Transfer", icon: Landmark, core: false },
];

function emptyConfig() {
  return {
    business: {
      name: "", phone: "", email: "", address: "", city: "",
      currency: "PKR", receiptFooter: "Thank you for shopping with us!",
      registerName: "Register 1", receiptSize: "80mm",
      setupCompleted: false,
    },
    tax: { percent: 0 },
    categories: [...DEFAULT_CATEGORIES],
    paymentMethods: ["cash", "card", "qr"],
  };
}

/* ============================================================
   ROOT APP
   ============================================================ */
export default function App() {
  const [db, setDb] = useState(null);
  const [phase, setPhase] = useState("loading"); // loading | setup | app
  const [config, setConfig] = useState(emptyConfig());
  const [products, setProducts] = useState([]);
  const [view, setView] = useState("pos");
  const [wizardEditMode, setWizardEditMode] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const database = await openDB();
        setDb(database);
        const meta = await dbGet(database, "meta", "config");
        const prods = await dbGetAll(database, "products");
        setProducts(prods);
        if (meta && meta.business && meta.business.setupCompleted) {
          setConfig(meta);
          setPhase("app");
        } else {
          setConfig(meta || emptyConfig());
          setPhase("setup");
        }
      } catch (e) {
        console.error("Storage error", e);
        setPhase("setup");
      }
    })();
  }, []);

  const persistConfig = useCallback(async (cfg) => {
    if (!db) return;
    await dbPut(db, "meta", { key: "config", ...cfg });
  }, [db]);

  const finishSetup = useCallback(async (cfg, newProducts) => {
    const finalCfg = { ...cfg, business: { ...cfg.business, setupCompleted: true } };
    await persistConfig(finalCfg);
    if (newProducts && newProducts.length) {
      for (const p of newProducts) await dbPut(db, "products", p);
      setProducts(await dbGetAll(db, "products"));
    }
    setConfig(finalCfg);
    setWizardEditMode(false);
    setPhase("app");
    setView("pos");
  }, [db, persistConfig]);

  const runSetupAgain = useCallback(() => {
    setWizardEditMode(true);
    setPhase("setup");
  }, []);

  const doFactoryReset = useCallback(async () => {
    if (!db) return;
    await factoryReset(db);
    setConfig(emptyConfig());
    setProducts([]);
    setWizardEditMode(false);
    setPhase("setup");
  }, [db]);

  if (phase === "loading") {
    return (
      <div className="w-full h-full min-h-[600px] flex flex-col items-center justify-center bg-[#F7F8F7] text-gray-500 gap-3">
        <Loader2 className="animate-spin text-green-600" size={28} />
        <div className="font-medium text-sm tracking-wide">iPOS is starting…</div>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <SetupWizard
        initialConfig={config}
        initialProducts={products}
        editMode={wizardEditMode}
        onCancelEdit={wizardEditMode ? () => { setPhase("app"); } : null}
        onFinish={finishSetup}
      />
    );
  }

  return (
    <AppShell
      db={db}
      config={config}
      setConfig={setConfig}
      persistConfig={persistConfig}
      products={products}
      setProducts={setProducts}
      view={view}
      setView={setView}
      runSetupAgain={runSetupAgain}
      doFactoryReset={doFactoryReset}
    />
  );
}

/* ============================================================
   SETUP WIZARD
   ============================================================ */
function SetupWizard({ initialConfig, initialProducts, editMode, onCancelEdit, onFinish }) {
  const steps = ["Business Details", "Register & Receipt", "Products", "Payments", "Review"];
  const [step, setStep] = useState(0);
  const [biz, setBiz] = useState(initialConfig.business);
  const [tax, setTax] = useState(initialConfig.tax);
  const [categories, setCategories] = useState(initialConfig.categories);
  const [paymentMethods, setPaymentMethods] = useState(initialConfig.paymentMethods);
  const [wizardProducts, setWizardProducts] = useState(editMode ? initialProducts : []);
  const [pDraft, setPDraft] = useState({ name: "", barcode: "", category: categories[0] || "", price: "", cost: "", stock: "" });

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const addProduct = () => {
    if (!pDraft.name.trim() || !pDraft.price) return;
    const p = {
      id: uid(),
      name: pDraft.name.trim(),
      barcode: pDraft.barcode.trim(),
      sku: pDraft.barcode.trim() || ("SKU-" + Math.floor(1000 + Math.random() * 9000)),
      category: pDraft.category || "Uncategorized",
      price: Number(pDraft.price) || 0,
      cost: Number(pDraft.cost) || 0,
      stock: Number(pDraft.stock) || 0,
      lowStockThreshold: 5,
      archived: false,
      image: null,
    };
    setWizardProducts((arr) => [p, ...arr]);
    if (p.category && !categories.includes(p.category)) setCategories((c) => [...c, p.category]);
    setPDraft({ name: "", barcode: "", category: p.category, price: "", cost: "", stock: "" });
  };

  const finalCfg = { business: biz, tax, categories, paymentMethods };

  return (
    <div className="w-full min-h-[700px] bg-[#F7F8F7] flex flex-col font-sans text-gray-900" style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}>
      {/* header */}
      <div className="border-b border-gray-200 bg-white px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">iPOS</span>
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-sm text-gray-400 ml-2">{editMode ? "Edit business setup" : "First-time setup"}</span>
        </div>
        {onCancelEdit && (
          <button onClick={onCancelEdit} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1">
            <ArrowLeft size={15} /> Cancel
          </button>
        )}
      </div>

      {/* progress */}
      <div className="px-8 py-5 bg-white border-b border-gray-200">
        <div className="flex items-center max-w-3xl mx-auto">
          {steps.map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors
                  ${i < step ? "bg-green-600 border-green-600 text-white" : i === step ? "border-green-600 text-green-700 bg-green-50" : "border-gray-200 text-gray-400"}`}>
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                <span className={`text-[11px] font-medium ${i === step ? "text-gray-900" : "text-gray-400"}`}>{label}</span>
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-[2px] mx-2 mb-5 ${i < step ? "bg-green-600" : "bg-gray-200"}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-auto px-8 py-8">
        <div className="max-w-3xl mx-auto">
          {step === 0 && <BusinessStep biz={biz} setBiz={setBiz} />}
          {step === 1 && <RegisterStep biz={biz} setBiz={setBiz} tax={tax} setTax={setTax} />}
          {step === 2 && (
            <ProductsStep
              pDraft={pDraft} setPDraft={setPDraft} addProduct={addProduct}
              categories={categories} setCategories={setCategories}
              wizardProducts={wizardProducts} setWizardProducts={setWizardProducts}
            />
          )}
          {step === 3 && <PaymentsStep paymentMethods={paymentMethods} setPaymentMethods={setPaymentMethods} />}
          {step === 4 && <ReviewStep cfg={finalCfg} productCount={wizardProducts.length} />}
        </div>
      </div>

      {/* footer nav */}
      <div className="border-t border-gray-200 bg-white px-8 py-4 flex items-center justify-between">
        <button
          onClick={back}
          disabled={step === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
        >
          Back
        </button>
        {step < steps.length - 1 ? (
          <button
            onClick={next}
            disabled={step === 0 && !biz.name.trim()}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 flex items-center gap-1.5"
          >
            Continue <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={() => onFinish(finalCfg, wizardProducts)}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5"
          >
            <ClipboardCheck size={16} /> Finish Setup
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 bg-white";

function BusinessStep({ biz, setBiz }) {
  const set = (k, v) => setBiz((b) => ({ ...b, [k]: v }));
  return (
    <div>
      <div className="flex items-center gap-2 mb-1"><Building2 size={18} className="text-green-600" /><h2 className="text-lg font-semibold">Business details</h2></div>
      <p className="text-sm text-gray-500 mb-6">This appears on your receipts and inside the app. You can edit it anytime from Settings.</p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Store name *"><input className={inputCls} value={biz.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Al Rehman Store" /></Field>
        <Field label="City"><input className={inputCls} value={biz.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Lahore" /></Field>
        <Field label="Phone number"><input className={inputCls} value={biz.phone} onChange={(e) => set("phone", e.target.value)} placeholder="03XX-XXXXXXX" /></Field>
        <Field label="Email (optional)"><input className={inputCls} value={biz.email} onChange={(e) => set("email", e.target.value)} placeholder="store@example.com" /></Field>
        <div className="col-span-2">
          <Field label="Full address"><input className={inputCls} value={biz.address} onChange={(e) => set("address", e.target.value)} placeholder="Shop #, street, area" /></Field>
        </div>
        <Field label="Currency"><input className={inputCls} value="PKR — Rs." disabled /></Field>
      </div>
    </div>
  );
}

function RegisterStep({ biz, setBiz, tax, setTax }) {
  const set = (k, v) => setBiz((b) => ({ ...b, [k]: v }));
  return (
    <div>
      <div className="flex items-center gap-2 mb-1"><Cog size={18} className="text-green-600" /><h2 className="text-lg font-semibold">Register, tax &amp; receipt</h2></div>
      <p className="text-sm text-gray-500 mb-6">Configure this device and how receipts print. Printer connection can be finished later from Settings → Printers.</p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Register / device name"><input className={inputCls} value={biz.registerName} onChange={(e) => set("registerName", e.target.value)} /></Field>
        <Field label="Receipt paper size">
          <select className={inputCls} value={biz.receiptSize} onChange={(e) => set("receiptSize", e.target.value)}>
            <option value="58mm">58mm thermal</option>
            <option value="80mm">80mm thermal</option>
          </select>
        </Field>
        <Field label="Tax rate (%)"><input type="number" min="0" className={inputCls} value={tax.percent} onChange={(e) => setTax({ percent: Number(e.target.value) || 0 })} /></Field>
        <Field label="Receipt footer text"><input className={inputCls} value={biz.receiptFooter} onChange={(e) => set("receiptFooter", e.target.value)} /></Field>
      </div>
      <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 text-amber-800 text-xs px-3.5 py-2.5">
        Tax is never hardcoded — leave it at 0% if it doesn't apply to your business, and change it anytime in Settings → Taxes.
      </div>
    </div>
  );
}

function ProductsStep({ pDraft, setPDraft, addProduct, categories, setCategories, wizardProducts, setWizardProducts }) {
  const removeProduct = (id) => setWizardProducts((arr) => arr.filter((p) => p.id !== id));
  return (
    <div>
      <div className="flex items-center gap-2 mb-1"><Boxes size={18} className="text-green-600" /><h2 className="text-lg font-semibold">Add your products</h2></div>
      <p className="text-sm text-gray-500 mb-6">Scan a barcode or type it, fill in the details, and hit Add — the form stays open so you can keep scanning. You can also skip this and import a CSV later from Products.</p>

      <div className="grid grid-cols-6 gap-3 bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <input className={inputCls + " col-span-2"} placeholder="Product name" value={pDraft.name} onChange={(e) => setPDraft((d) => ({ ...d, name: e.target.value }))} />
        <input className={inputCls} placeholder="Barcode / SKU" value={pDraft.barcode} onChange={(e) => setPDraft((d) => ({ ...d, barcode: e.target.value }))} />
        <input className={inputCls} list="cat-list" placeholder="Category" value={pDraft.category} onChange={(e) => setPDraft((d) => ({ ...d, category: e.target.value }))} />
        <datalist id="cat-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <input type="number" className={inputCls} placeholder="Cost" value={pDraft.cost} onChange={(e) => setPDraft((d) => ({ ...d, cost: e.target.value }))} />
        <input type="number" className={inputCls} placeholder="Price *" value={pDraft.price} onChange={(e) => setPDraft((d) => ({ ...d, price: e.target.value }))} />
        <input type="number" className={inputCls} placeholder="Opening stock" value={pDraft.stock} onChange={(e) => setPDraft((d) => ({ ...d, stock: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addProduct()} />
        <button onClick={addProduct} className="col-span-6 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold py-2.5 flex items-center justify-center gap-1.5">
          <Plus size={16} /> Add product &amp; continue scanning
        </button>
      </div>

      <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">{wizardProducts.length} product{wizardProducts.length !== 1 ? "s" : ""} added</div>
      <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-auto bg-white">
        {wizardProducts.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No products yet — add some above, or skip and import later.</div>}
        {wizardProducts.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <div>
              <div className="font-medium text-gray-800">{p.name}</div>
              <div className="text-xs text-gray-400">{p.category} · {p.sku} · Stock {p.stock}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{fmt(p.price)}</span>
              <button onClick={() => removeProduct(p.id)} className="text-gray-300 hover:text-red-500"><X size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentsStep({ paymentMethods, setPaymentMethods }) {
  const toggle = (id, core) => {
    if (core && paymentMethods.includes(id) && id === "cash") return; // cash always required
    setPaymentMethods((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-1"><Wallet size={18} className="text-green-600" /><h2 className="text-lg font-semibold">Accepted payment methods</h2></div>
      <p className="text-sm text-gray-500 mb-6">Only enabled methods show up on the checkout screen. Cash is always available.</p>
      <div className="grid grid-cols-3 gap-3">
        {ALL_PAYMENT_METHODS.map(({ id, label, icon: Icon }) => {
          const active = paymentMethods.includes(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id, id === "cash")}
              className={`flex items-center gap-2.5 rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-colors
                ${active ? "border-green-500 bg-green-50 text-green-800" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
            >
              <Icon size={17} />
              {label}
              {active && <Check size={14} className="ml-auto" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReviewStep({ cfg, productCount }) {
  const enabledPay = ALL_PAYMENT_METHODS.filter((m) => cfg.paymentMethods.includes(m.id)).map((m) => m.label);
  return (
    <div>
      <div className="flex items-center gap-2 mb-1"><ListChecks size={18} className="text-green-600" /><h2 className="text-lg font-semibold">Review &amp; finish</h2></div>
      <p className="text-sm text-gray-500 mb-6">Everything below is saved to this device and can be changed later from Settings.</p>
      <div className="grid grid-cols-2 gap-4">
        <ReviewCard title="Business">
          <RRow k="Name" v={cfg.business.name || "—"} />
          <RRow k="City" v={cfg.business.city || "—"} />
          <RRow k="Phone" v={cfg.business.phone || "—"} />
          <RRow k="Address" v={cfg.business.address || "—"} />
        </ReviewCard>
        <ReviewCard title="Register &amp; tax">
          <RRow k="Register" v={cfg.business.registerName} />
          <RRow k="Receipt size" v={cfg.business.receiptSize} />
          <RRow k="Tax rate" v={cfg.tax.percent + "%"} />
        </ReviewCard>
        <ReviewCard title="Products">
          <RRow k="Products added" v={productCount} />
          <RRow k="Categories" v={cfg.categories.join(", ") || "—"} />
        </ReviewCard>
        <ReviewCard title="Payments">
          <RRow k="Enabled methods" v={enabledPay.join(", ") || "Cash"} />
        </ReviewCard>
      </div>
    </div>
  );
}
function ReviewCard({ title, children }) {
  return <div className="border border-gray-200 rounded-xl p-4 bg-white"><div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{title}</div><div className="space-y-1.5">{children}</div></div>;
}
function RRow({ k, v }) {
  return <div className="flex justify-between text-sm"><span className="text-gray-400">{k}</span><span className="font-medium text-gray-800 text-right ml-4">{v}</span></div>;
}

/* ============================================================
   APP SHELL
   ============================================================ */
const NAV_ITEMS = [
  { id: "pos", label: "POS", icon: ShoppingCart },
  { id: "products", label: "Products", icon: Package },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "customers", label: "Customers", icon: Users },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "staff", label: "Staff", icon: UserCog },
  { id: "settings", label: "Settings", icon: Cog },
];

function AppShell({ db, config, setConfig, persistConfig, products, setProducts, view, setView, runSetupAgain, doFactoryReset }) {
  const [lastSync] = useState(nowStr());

  const saveConfig = async (next) => {
    setConfig(next);
    await persistConfig(next);
  };

  const saveProduct = async (p) => {
    await dbPut(db, "products", p);
    setProducts(await dbGetAll(db, "products"));
  };

  return (
    <div className="w-full min-h-[760px] flex bg-[#F7F8F7] text-gray-900" style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}>
      <aside className="w-[200px] shrink-0 bg-white border-r border-gray-200 flex flex-col py-4">
        <div className="px-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold tracking-tight">iPOS</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          </div>
          <div className="text-[11px] text-gray-400 mt-1 leading-tight">
            {config.business.name || "Unnamed store"}<br />{config.business.city}
          </div>
        </div>

        <nav className="flex-1 px-2.5 pt-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${view === id ? "bg-green-50 text-green-700" : "text-gray-500 hover:bg-gray-50"}`}
            >
              <Icon size={16} strokeWidth={2} /> {label}
            </button>
          ))}
        </nav>

        <div className="px-3 mt-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-gray-700"><Wifi size={13} className="text-green-600" /> Offline mode</div>
            <div className="text-gray-400 mt-1">Last sync {lastSync}</div>
          </div>
          <div className="text-[10px] text-gray-300 text-center mt-2">v1.0.0 · all data stored on this device</div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {view === "pos" && <POSScreen db={db} config={config} products={products} setProducts={setProducts} />}
        {view === "products" && <ProductsScreen config={config} products={products} saveProduct={saveProduct} setConfig={saveConfig} />}
        {["inventory", "customers", "reports", "expenses", "staff"].includes(view) && <RoadmapStub view={view} />}
        {view === "settings" && (
          <SettingsScreen
            config={config} saveConfig={saveConfig}
            runSetupAgain={runSetupAgain} doFactoryReset={doFactoryReset}
          />
        )}
      </main>
    </div>
  );
}

function RoadmapStub({ view }) {
  const labels = { inventory: "Inventory ledger", customers: "Customers", reports: "Reports", expenses: "Expenses", staff: "Staff & permissions" };
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Boxes size={22} className="text-gray-400" /></div>
      <h3 className="text-base font-semibold text-gray-800">{labels[view]} is next on the build plan</h3>
      <p className="text-sm text-gray-400 mt-1.5 max-w-sm">
        Checkout, products, and setup are fully working right now. {labels[view]} is being built next so nothing half-finished ships in the meantime.
      </p>
    </div>
  );
}

/* ============================================================
   PRODUCTS SCREEN
   ============================================================ */
function ProductsScreen({ config, products, saveProduct, setConfig }) {
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null); // product or "new"

  const filtered = products.filter((p) => {
    if (p.archived !== showArchived) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return p.name.toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(s) || (p.barcode || "").toLowerCase().includes(s);
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Products</h1>
          <p className="text-xs text-gray-400 mt-0.5">{products.filter(p => !p.archived).length} active products</p>
        </div>
        <button onClick={() => setEditing("new")} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5 flex items-center gap-1.5">
          <Plus size={16} /> Add product
        </button>
      </div>
      <div className="px-8 py-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input className={inputCls + " pl-9"} placeholder="Search name, SKU or barcode" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button
          onClick={() => setShowArchived((s) => !s)}
          className={`text-xs font-medium rounded-lg px-3 py-2 border flex items-center gap-1.5 ${showArchived ? "border-gray-800 text-gray-800" : "border-gray-200 text-gray-500"}`}
        >
          <Archive size={13} /> {showArchived ? "Showing archived" : "Show archived"}
        </button>
      </div>

      <div className="flex-1 overflow-auto px-8 pb-8">
        {filtered.length === 0 ? (
          <EmptyState icon={Package} title="No products yet" subtitle="Add your first product, or import a CSV during setup." action={{ label: "Add product", onClick: () => setEditing("new") }} />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">SKU / Barcode</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                  <th className="px-4 py-2.5 font-medium text-right">Price</th>
                  <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                  <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{p.category}</td>
                    <td className="px-4 py-2.5 text-gray-400">{p.sku}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{fmt(p.cost)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{fmt(p.price)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {p.stock <= 0 ? <span className="text-red-500 font-medium">Out</span> :
                       p.stock <= (p.lowStockThreshold || 5) ? <span className="text-amber-600 font-medium">{p.stock} low</span> :
                       <span className="text-gray-600">{p.stock}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setEditing(p)} className="text-gray-400 hover:text-gray-700"><Pencil size={14} /></button>
                        <button onClick={() => saveProduct({ ...p, archived: !p.archived })} className="text-gray-400 hover:text-gray-700" title={p.archived ? "Restore" : "Archive"}>
                          {p.archived ? <RefreshCw size={14} /> : <Archive size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ProductEditModal
          product={editing === "new" ? null : editing}
          categories={config.categories}
          onAddCategory={(c) => setConfig({ ...config, categories: [...config.categories, c] })}
          onClose={() => setEditing(null)}
          onSave={async (p) => { await saveProduct(p); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ProductEditModal({ product, categories, onAddCategory, onClose, onSave }) {
  const [f, setF] = useState(product || { name: "", barcode: "", category: categories[0] || "", cost: "", price: "", stock: "", lowStockThreshold: 5, archived: false });
  const set = (k, v) => setF((d) => ({ ...d, [k]: v }));
  const submit = () => {
    if (!f.name.trim() || !f.price) return;
    onSave({
      id: f.id || uid(),
      name: f.name.trim(),
      barcode: f.barcode || "",
      sku: f.sku || f.barcode || ("SKU-" + Math.floor(1000 + Math.random() * 9000)),
      category: f.category || "Uncategorized",
      cost: Number(f.cost) || 0,
      price: Number(f.price) || 0,
      stock: Number(f.stock) || 0,
      lowStockThreshold: Number(f.lowStockThreshold) || 5,
      archived: !!f.archived,
      image: f.image || null,
    });
  };
  return (
    <Modal onClose={onClose} title={product ? "Edit product" : "Add product"} width="max-w-lg">
      <div className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2"><Field label="Product name *"><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field></div>
        <Field label="Barcode / SKU"><input className={inputCls} value={f.barcode} onChange={(e) => set("barcode", e.target.value)} /></Field>
        <Field label="Category"><input className={inputCls} list="cat-list-2" value={f.category} onChange={(e) => set("category", e.target.value)} onBlur={() => { if (f.category && !categories.includes(f.category)) onAddCategory(f.category); }} /></Field>
        <datalist id="cat-list-2">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <Field label="Cost price"><input type="number" className={inputCls} value={f.cost} onChange={(e) => set("cost", e.target.value)} /></Field>
        <Field label="Selling price *"><input type="number" className={inputCls} value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
        <Field label="Stock on hand"><input type="number" className={inputCls} value={f.stock} onChange={(e) => set("stock", e.target.value)} /></Field>
        <Field label="Low-stock alert at"><input type="number" className={inputCls} value={f.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
        <button onClick={submit} className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700">Save product</button>
      </div>
    </Modal>
  );
}

function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Icon size={22} className="text-gray-400" /></div>
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      <p className="text-sm text-gray-400 mt-1.5 max-w-sm">{subtitle}</p>
      {action && <button onClick={action.onClick} className="mt-4 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5">{action.label}</button>}
    </div>
  );
}

/* ============================================================
   SETTINGS SCREEN
   ============================================================ */
function SettingsScreen({ config, saveConfig, runSetupAgain, doFactoryReset }) {
  const [biz, setBiz] = useState(config.business);
  const [tax, setTax] = useState(config.tax);
  const [paymentMethods, setPaymentMethods] = useState(config.paymentMethods);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState("");

  const save = async () => {
    await saveConfig({ ...config, business: biz, tax, paymentMethods });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const togglePay = (id) => {
    if (id === "cash") return;
    setPaymentMethods((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="px-8 py-5 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-gray-400 mt-0.5">Business setup, receipt, taxes and payments for this store.</p>
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Business setup</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-5 grid grid-cols-2 gap-4">
            <Field label="Store name"><input className={inputCls} value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} /></Field>
            <Field label="City"><input className={inputCls} value={biz.city} onChange={(e) => setBiz({ ...biz, city: e.target.value })} /></Field>
            <Field label="Phone"><input className={inputCls} value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} /></Field>
            <Field label="Register name"><input className={inputCls} value={biz.registerName} onChange={(e) => setBiz({ ...biz, registerName: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Address"><input className={inputCls} value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="Receipt footer"><input className={inputCls} value={biz.receiptFooter} onChange={(e) => setBiz({ ...biz, receiptFooter: e.target.value })} /></Field></div>
            <Field label="Tax rate (%)"><input type="number" className={inputCls} value={tax.percent} onChange={(e) => setTax({ percent: Number(e.target.value) || 0 })} /></Field>
            <Field label="Receipt size">
              <select className={inputCls} value={biz.receiptSize} onChange={(e) => setBiz({ ...biz, receiptSize: e.target.value })}>
                <option value="58mm">58mm</option><option value="80mm">80mm</option>
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <div className="text-xs font-medium text-gray-500 mb-2">Payment methods accepted</div>
            <div className="flex flex-wrap gap-2">
              {ALL_PAYMENT_METHODS.map(({ id, label }) => {
                const active = paymentMethods.includes(id);
                return (
                  <button key={id} onClick={() => togglePay(id)} className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${active ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-400"}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <button onClick={save} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5">Save changes</button>
            {saved && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><Check size={13} /> Saved</span>}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Setup wizard</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-800">Run setup wizard again</div>
              <div className="text-xs text-gray-400 mt-0.5">Walk through business, register, products and payments again. Your existing data is kept and pre-filled.</div>
            </div>
            <button onClick={runSetupAgain} className="text-sm font-semibold rounded-lg px-4 py-2.5 border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5 shrink-0">
              <RefreshCw size={14} /> Run again
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-red-600 mb-3">Advanced</h2>
          <div className="bg-red-50 border border-red-100 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert size={18} className="text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-red-700">Reset business data / factory reset</div>
                <div className="text-xs text-red-500/80 mt-0.5">Permanently erases products, sales, and business setup from this device. This cannot be undone and is separate from running setup again.</div>
                {!confirmReset ? (
                  <button onClick={() => setConfirmReset(true)} className="mt-3 text-sm font-semibold rounded-lg px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-100">
                    Erase all business data
                  </button>
                ) : (
                  <div className="mt-3 bg-white border border-red-200 rounded-lg p-3.5">
                    <div className="text-xs text-gray-600 mb-2">Type <span className="font-mono font-semibold">DELETE</span> to confirm. This removes all products, sales and settings on this device.</div>
                    <input className={inputCls + " mb-2"} value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder="DELETE" />
                    <div className="flex gap-2">
                      <button onClick={() => { setConfirmReset(false); setResetText(""); }} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600">Cancel</button>
                      <button
                        disabled={resetText !== "DELETE"}
                        onClick={doFactoryReset}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-40"
                      >
                        Permanently erase everything
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   POS SCREEN
   ============================================================ */
function POSScreen({ db, config, products, setProducts }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState({ type: "percent", value: 0 });
  const [note, setNote] = useState("");
  const [modal, setModal] = useState(null); // 'discount' | 'note' | 'cash' | 'hold' | 'retrieve' | 'return' | 'clear' | 'unknownBarcode'
  const [unknownCode, setUnknownCode] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [heldSales, setHeldSales] = useState([]);
  const [toast, setToast] = useState(null);
  const searchRef = useRef(null);
  const completingRef = useRef(false);

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => { if (db) dbGetAll(db, "held").then(setHeldSales); }, [db, modal]);

  const showToast = (msg, type = "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2600); };

  const categories = useMemo(() => {
    const set = new Set(config.categories);
    products.forEach((p) => p.category && set.add(p.category));
    return ["All", ...Array.from(set)];
  }, [config.categories, products]);

  const activeProducts = products.filter((p) => !p.archived);
  const visibleProducts = activeProducts.filter((p) => {
    if (activeCategory !== "All" && p.category !== activeCategory) return false;
    if (!query.trim()) return true;
    const s = query.toLowerCase();
    return p.name.toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(s) || (p.barcode || "").toLowerCase().includes(s);
  });

  const addToCart = (product, qty = 1) => {
    if (product.stock <= 0) return;
    setCart((c) => {
      const existing = c.find((i) => i.id === product.id);
      if (existing) return c.map((i) => i.id === product.id ? { ...i, qty: i.qty + qty } : i);
      return [...c, { id: product.id, name: product.name, sku: product.sku || product.barcode, price: product.price, cost: product.cost, qty }];
    });
  };
  const updateQty = (id, qty) => setCart((c) => qty <= 0 ? c.filter((i) => i.id !== id) : c.map((i) => i.id === id ? { ...i, qty } : i));
  const removeItem = (id) => setCart((c) => c.filter((i) => i.id !== id));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = discount.type === "percent" ? Math.round(subtotal * (discount.value / 100)) : Math.min(discount.value, subtotal);
  const taxable = Math.max(subtotal - discountAmt, 0);
  const taxAmt = Math.round(taxable * ((config.tax.percent || 0) / 100));
  const total = taxable + taxAmt;

  const resetSale = () => {
    setCart([]); setDiscount({ type: "percent", value: 0 }); setNote(""); setQuery("");
    searchRef.current?.focus();
  };

  const handleSearchEnter = () => {
    const code = query.trim();
    if (!code) return;
    const match = activeProducts.find((p) => p.barcode === code || p.sku === code);
    if (match) { addToCart(match); setQuery(""); }
    else { setUnknownCode(code); setModal("unknownBarcode"); }
  };

  const completeSale = async (method, cashReceived) => {
    if (completingRef.current) return;
    if (cart.length === 0) { showToast("Add at least one item first", "error"); return; }
    completingRef.current = true;
    try {
      const sale = {
        id: uid(),
        receiptNo: "R-" + Date.now().toString().slice(-8),
        date: new Date().toISOString(),
        register: config.business.registerName,
        cashier: "Ahmed",
        items: cart,
        subtotal, discount: discountAmt, tax: taxAmt, total,
        paymentMethod: method,
        cashReceived: cashReceived || null,
        change: cashReceived ? Math.max(cashReceived - total, 0) : 0,
        note,
      };
      await dbPut(db, "sales", sale);
      for (const item of cart) {
        const p = products.find((pp) => pp.id === item.id);
        if (p) await dbPut(db, "products", { ...p, stock: Math.max(p.stock - item.qty, 0) });
      }
      setProducts(await dbGetAll(db, "products"));
      setReceipt(sale);
      setModal("receipt");
      resetSale();
    } finally {
      completingRef.current = false;
    }
  };

  const holdSale = (ref) => {
    if (cart.length === 0) return;
    const held = { id: uid(), ref: ref || "", time: new Date().toISOString(), cashier: "Ahmed", items: cart, discount, note };
    dbPut(db, "held", held).then(() => { resetSale(); setModal(null); showToast("Sale held"); });
  };
  const retrieveSale = (held) => {
    setCart(held.items); setDiscount(held.discount || { type: "percent", value: 0 }); setNote(held.note || "");
    dbDelete(db, "held", held.id).then(() => setModal(null));
  };

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setModal(null); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (["F1", "F2", "F3", "F4", "F5"].includes(e.key)) {
        e.preventDefault();
        if (e.key === "F1") resetSale();
        if (e.key === "F2") setModal("hold");
        if (e.key === "F3") setModal("retrieve");
        if (e.key === "F4") setModal("return");
        if (e.key === "F5") { if (config.paymentMethods.includes("cash")) setModal("cash"); else completeSale(config.paymentMethods[0] || "cash"); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart, discount, note, products, config]);

  const payIcons = { cash: Banknote, card: CreditCard, qr: QrCode };

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col min-w-0">
        {/* top search */}
        <div className="px-6 pt-5 pb-3 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchEnter()}
              placeholder="Search product (name, code or barcode)..."
              className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <button onClick={handleSearchEnter} className="shrink-0 w-11 h-11 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50">
            <ScanBarcode size={18} />
          </button>
        </div>

        {/* categories */}
        <div className="px-6 pb-3 flex items-center gap-2 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors
                ${activeCategory === c ? "bg-green-600 border-green-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* product grid */}
        <div className="flex-1 overflow-auto px-6 pb-4">
          {activeProducts.length === 0 ? (
            <EmptyState icon={Package} title="No products yet" subtitle="Add products from the Products page to start selling." />
          ) : visibleProducts.length === 0 ? (
            <EmptyState icon={Search} title="No matches" subtitle="Try a different name, code or category." />
          ) : (
            <div className="grid grid-cols-4 gap-3.5">
              {visibleProducts.map((p) => {
                const out = p.stock <= 0;
                const low = !out && p.stock <= (p.lowStockThreshold || 5);
                return (
                  <button
                    key={p.id}
                    disabled={out}
                    onClick={() => addToCart(p)}
                    className={`text-left bg-white border border-gray-200 rounded-xl p-3.5 transition-colors hover:border-green-300 disabled:opacity-50 disabled:hover:border-gray-200 disabled:cursor-not-allowed`}
                  >
                    <div className="w-full aspect-square rounded-lg bg-gray-50 mb-2.5 flex items-center justify-center overflow-hidden">
                      {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <ImageOff size={22} className="text-gray-200" />}
                    </div>
                    <div className="text-sm font-medium text-gray-800 leading-tight line-clamp-2 min-h-[2.5em]">{p.name}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-sm font-semibold text-gray-900">{fmt(p.price)}</span>
                      {out && <span className="text-[10px] font-semibold text-red-500">Out</span>}
                      {low && <span className="text-[10px] font-semibold text-amber-600">Low</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* shortcut bar */}
        <div className="border-t border-gray-200 bg-white px-6 py-3 grid grid-cols-6 gap-2">
          <ShortcutBtn label="New Sale" hint="F1" icon={ListChecks} onClick={resetSale} />
          <ShortcutBtn label="Hold" hint="F2" icon={Pause} onClick={() => setModal("hold")} disabled={cart.length === 0} />
          <ShortcutBtn label="Retrieve" hint="F3" icon={ClipboardCheck} onClick={() => setModal("retrieve")} />
          <ShortcutBtn label="Return" hint="F4" icon={RotateCcw} onClick={() => setModal("return")} />
          <ShortcutBtn label="Open Drawer" icon={Landmark} onClick={() => showToast("Drawer opened")} />
          <ShortcutBtn label="More" icon={ChevronDown} onClick={() => setModal("more")} />
        </div>
      </div>

      {/* cart panel */}
      <div className="w-[380px] shrink-0 border-l border-gray-200 bg-white flex flex-col">
        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-base font-semibold">Current Sale</h2>
          <button onClick={() => cart.length && setModal("clear")} className="text-xs font-semibold text-red-500 flex items-center gap-1 disabled:opacity-30" disabled={cart.length === 0}>
            <Trash2 size={13} /> Clear
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-300 py-10">
              <ShoppingCart size={26} className="mb-2" />
              <div className="text-sm text-gray-400">Cart is empty</div>
              <div className="text-xs text-gray-300 mt-0.5">Scan or tap a product to begin</div>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item, idx) => (
                <div key={item.id} className="flex items-start gap-2">
                  <span className="text-xs text-gray-300 w-4 pt-1">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{item.name}</div>
                    <div className="text-[11px] text-gray-400">{item.sku}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button onClick={() => updateQty(item.id, item.qty - 1)} className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"><Minus size={12} /></button>
                      <input
                        value={item.qty}
                        onChange={(e) => updateQty(item.id, Number(e.target.value.replace(/\D/g, "")) || 0)}
                        className="w-9 text-center text-sm border border-gray-200 rounded-md py-0.5"
                      />
                      <button onClick={() => updateQty(item.id, item.qty + 1)} className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"><Plus size={12} /></button>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-400">{fmt(item.price)}</div>
                    <div className="text-sm font-semibold">{fmt(item.price * item.qty)}</div>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-500 mt-0.5"><X size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 flex gap-2">
          <button onClick={() => setModal("discount")} className="flex-1 border border-gray-200 rounded-lg text-xs font-medium py-2 flex items-center justify-center gap-1.5 text-gray-600 hover:bg-gray-50">
            <Percent size={13} /> Discount{discount.value > 0 ? ` (${discount.type === "percent" ? discount.value + "%" : fmt(discount.value)})` : ""}
          </button>
          <button onClick={() => setModal("note")} className="flex-1 border border-gray-200 rounded-lg text-xs font-medium py-2 flex items-center justify-center gap-1.5 text-gray-600 hover:bg-gray-50">
            <StickyNote size={13} /> {note ? "Edit note" : "Note"}
          </button>
        </div>

        <div className="border-t border-gray-100 px-5 py-4 space-y-1.5">
          <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
          <div className="flex justify-between text-sm text-gray-500"><span>Discount</span><span>{discountAmt > 0 ? "-" + fmt(discountAmt) : fmt(0)}</span></div>
          <div className="flex justify-between text-sm text-gray-500"><span>Tax ({config.tax.percent || 0}%)</span><span>{fmt(taxAmt)}</span></div>
          <div className="flex justify-between items-baseline pt-1.5 border-t border-gray-100 mt-1.5">
            <span className="text-base font-semibold">Total</span>
            <span className="text-2xl font-bold">{fmt(total)}</span>
          </div>
        </div>

        <div className="px-5 pb-3 grid grid-cols-3 gap-2">
          {config.paymentMethods.filter((m) => ["cash", "card", "qr"].includes(m)).map((m) => {
            const Icon = payIcons[m] || Wallet;
            const label = ALL_PAYMENT_METHODS.find((x) => x.id === m)?.label || m;
            return (
              <button
                key={m}
                onClick={() => m === "cash" ? setModal("cash") : completeSale(m)}
                disabled={cart.length === 0}
                className="border border-gray-200 rounded-lg py-3 flex flex-col items-center gap-1 text-xs font-medium text-gray-600 hover:border-green-300 disabled:opacity-40"
              >
                <Icon size={17} /> {label}
              </button>
            );
          })}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={() => config.paymentMethods.includes("cash") ? setModal("cash") : completeSale(config.paymentMethods[0] || "cash")}
            disabled={cart.length === 0}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl py-4 text-base font-bold flex items-center justify-center gap-2"
          >
            <Printer size={18} /> Complete Sale (F5)
          </button>
        </div>
      </div>

      {/* modals */}
      {modal === "discount" && <DiscountModal discount={discount} setDiscount={setDiscount} onClose={() => setModal(null)} />}
      {modal === "note" && <NoteModal note={note} setNote={setNote} onClose={() => setModal(null)} />}
      {modal === "cash" && <CashModal total={total} onClose={() => setModal(null)} onConfirm={(received) => completeSale("cash", received)} />}
      {modal === "clear" && (
        <ConfirmModal title="Clear this sale?" body="All items in the current cart will be removed. This can't be undone." confirmLabel="Clear sale" onConfirm={() => { resetSale(); setModal(null); }} onClose={() => setModal(null)} />
      )}
      {modal === "hold" && <HoldModal onClose={() => setModal(null)} onHold={holdSale} />}
      {modal === "retrieve" && <RetrieveModal heldSales={heldSales} onClose={() => setModal(null)} onSelect={retrieveSale} />}
      {modal === "return" && <ReturnModal db={db} products={products} setProducts={setProducts} onClose={() => setModal(null)} showToast={showToast} />}
      {modal === "unknownBarcode" && (
        <UnknownBarcodeModal
          code={unknownCode}
          categories={config.categories}
          onClose={() => { setModal(null); setQuery(""); }}
          onCreate={async (p) => {
            await dbPut(db, "products", p);
            setProducts(await dbGetAll(db, "products"));
            addToCart(p);
            setModal(null); setQuery("");
          }}
        />
      )}
      {modal === "more" && (
        <Modal onClose={() => setModal(null)} title="More payment methods" width="max-w-sm">
          <div className="grid grid-cols-2 gap-2">
            {config.paymentMethods.filter((m) => !["cash", "card", "qr"].includes(m)).map((m) => {
              const info = ALL_PAYMENT_METHODS.find((x) => x.id === m);
              const Icon = info?.icon || Wallet;
              return (
                <button key={m} onClick={() => { completeSale(m); setModal(null); }} disabled={cart.length === 0} className="border border-gray-200 rounded-lg py-3 flex flex-col items-center gap-1 text-xs font-medium text-gray-600 hover:border-green-300 disabled:opacity-40">
                  <Icon size={16} /> {info?.label || m}
                </button>
              );
            })}
            {config.paymentMethods.filter((m) => !["cash", "card", "qr"].includes(m)).length === 0 && (
              <div className="col-span-2 text-xs text-gray-400 text-center py-4">Enable more methods from Settings → Business setup.</div>
            )}
          </div>
        </Modal>
      )}
      {modal === "receipt" && receipt && <ReceiptModal sale={receipt} config={config} onClose={() => setModal(null)} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg z-50">
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function ShortcutBtn({ label, hint, icon: Icon, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className="border border-gray-200 rounded-lg py-2.5 flex flex-col items-center gap-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
      <div className="flex items-center gap-1.5"><Icon size={14} />{hint && <span className="text-[10px] text-gray-400">{hint}</span>}</div>
      {label}
    </button>
  );
}

/* ---------- shared modal shell ---------- */
function Modal({ title, children, onClose, width = "max-w-md" }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${width} p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, onConfirm, onClose, danger = true }) {
  return (
    <Modal title={title} onClose={onClose} width="max-w-sm">
      <p className="text-sm text-gray-500 mb-5">{body}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
        <button onClick={onConfirm} className={`px-4 py-2 text-sm font-semibold rounded-lg text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}`}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

function DiscountModal({ discount, setDiscount, onClose }) {
  const [type, setType] = useState(discount.type);
  const [value, setValue] = useState(discount.value || "");
  return (
    <Modal title="Discount" onClose={onClose} width="max-w-sm">
      <div className="flex gap-2 mb-4">
        <button onClick={() => setType("percent")} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${type === "percent" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-500"}`}>Percent %</button>
        <button onClick={() => setType("fixed")} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${type === "fixed" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-500"}`}>Fixed Rs.</button>
      </div>
      <input type="number" autoFocus className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "percent" ? "e.g. 10" : "e.g. 100"} />
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600">Cancel</button>
        <button onClick={() => { setDiscount({ type, value: Number(value) || 0 }); onClose(); }} className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white">Apply</button>
      </div>
    </Modal>
  );
}

function NoteModal({ note, setNote, onClose }) {
  const [val, setVal] = useState(note);
  return (
    <Modal title="Transaction note" onClose={onClose} width="max-w-sm">
      <textarea autoFocus rows={3} className={inputCls} value={val} onChange={(e) => setVal(e.target.value)} placeholder="Internal note for this sale…" />
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600">Cancel</button>
        <button onClick={() => { setNote(val); onClose(); }} className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white">Save note</button>
      </div>
    </Modal>
  );
}

function CashModal({ total, onClose, onConfirm }) {
  const [received, setReceived] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const change = Math.max((Number(received) || 0) - total, 0);
  const quick = [total, 500, 1000, 5000];
  return (
    <Modal title="Cash payment" onClose={onClose} width="max-w-sm">
      <div className="flex justify-between text-sm text-gray-500 mb-3"><span>Total due</span><span className="font-semibold text-gray-900">{fmt(total)}</span></div>
      <Field label="Cash received">
        <input ref={ref} type="number" className={inputCls + " text-lg font-semibold"} value={received} onChange={(e) => setReceived(e.target.value)} onKeyDown={(e) => e.key === "Enter" && Number(received) >= total && onConfirm(Number(received))} />
      </Field>
      <div className="flex gap-2 mt-2.5">
        {quick.map((v, i) => (
          <button key={i} onClick={() => setReceived(String(v))} className="flex-1 border border-gray-200 rounded-lg py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            {i === 0 ? "Exact" : "Rs. " + v.toLocaleString()}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-sm mt-4 pt-3 border-t border-gray-100">
        <span className="text-gray-500">Change due</span><span className="font-semibold">{fmt(change)}</span>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600">Cancel</button>
        <button
          disabled={!received || Number(received) < total}
          onClick={() => onConfirm(Number(received))}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white disabled:opacity-40"
        >
          Confirm payment
        </button>
      </div>
    </Modal>
  );
}

function HoldModal({ onClose, onHold }) {
  const [ref, setRef] = useState("");
  return (
    <Modal title="Hold this sale" onClose={onClose} width="max-w-sm">
      <Field label="Customer name / reference (optional)"><input autoFocus className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600">Cancel</button>
        <button onClick={() => onHold(ref)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white">Hold sale</button>
      </div>
    </Modal>
  );
}

function RetrieveModal({ heldSales, onClose, onSelect }) {
  return (
    <Modal title="Retrieve held sale" onClose={onClose} width="max-w-md">
      {heldSales.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-8">No held sales right now.</div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-auto">
          {heldSales.map((h) => (
            <button key={h.id} onClick={() => onSelect(h)} className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3.5 py-2.5 text-left hover:border-green-300">
              <div>
                <div className="text-sm font-medium text-gray-800">{h.ref || "Hold " + h.id.slice(0, 5)}</div>
                <div className="text-xs text-gray-400">{new Date(h.time).toLocaleTimeString()} · {h.items.length} items · {h.cashier}</div>
              </div>
              <span className="text-sm font-semibold">{fmt(h.items.reduce((s, i) => s + i.price * i.qty, 0))}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function UnknownBarcodeModal({ code, categories, onClose, onCreate }) {
  const [f, setF] = useState({ name: "", category: categories[0] || "", price: "", cost: "", stock: "1" });
  const set = (k, v) => setF((d) => ({ ...d, [k]: v }));
  return (
    <Modal title="Product not found" onClose={onClose} width="max-w-sm">
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 text-amber-800 text-xs rounded-lg px-3 py-2.5 mb-4">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        No product matches code "{code}". Create it now to add it to this sale.
      </div>
      <div className="space-y-3">
        <Field label="Product name *"><input autoFocus className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><input className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value)} /></Field>
          <Field label="Selling price *"><input type="number" className={inputCls} value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
          <Field label="Cost price"><input type="number" className={inputCls} value={f.cost} onChange={(e) => set("cost", e.target.value)} /></Field>
          <Field label="Stock"><input type="number" className={inputCls} value={f.stock} onChange={(e) => set("stock", e.target.value)} /></Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600">Cancel</button>
        <button
          disabled={!f.name.trim() || !f.price}
          onClick={() => onCreate({ id: uid(), name: f.name.trim(), barcode: code, sku: code, category: f.category || "Uncategorized", price: Number(f.price) || 0, cost: Number(f.cost) || 0, stock: Number(f.stock) || 0, lowStockThreshold: 5, archived: false, image: null })}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white disabled:opacity-40"
        >
          Create &amp; add to sale
        </button>
      </div>
    </Modal>
  );
}

function ReturnModal({ db, products, setProducts, onClose, showToast }) {
  const [receiptNo, setReceiptNo] = useState("");
  const [sale, setSale] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [returnQty, setReturnQty] = useState({});

  const search = async () => {
    setNotFound(false); setSale(null);
    const all = await dbGetAll(db, "sales");
    const found = all.find((s) => s.receiptNo === receiptNo.trim());
    if (found) { setSale(found); setReturnQty({}); } else setNotFound(true);
  };

  const setQty = (id, v, max) => setReturnQty((r) => ({ ...r, [id]: Math.max(0, Math.min(max, v)) }));
  const totalReturn = sale ? sale.items.reduce((s, i) => s + (returnQty[i.id] || 0) * i.price, 0) : 0;

  const processReturn = async () => {
    const itemsToReturn = sale.items.filter((i) => (returnQty[i.id] || 0) > 0);
    if (itemsToReturn.length === 0) return;
    const ret = {
      id: uid(),
      type: "return",
      receiptNo: "RT-" + Date.now().toString().slice(-8),
      originalReceipt: sale.receiptNo,
      date: new Date().toISOString(),
      items: itemsToReturn.map((i) => ({ ...i, qty: returnQty[i.id] })),
      total: -totalReturn,
    };
    await dbPut(db, "sales", ret);
    for (const i of itemsToReturn) {
      const p = products.find((pp) => pp.id === i.id);
      if (p) await dbPut(db, "products", { ...p, stock: p.stock + returnQty[i.id] });
    }
    setProducts(await dbGetAll(db, "products"));
    showToast("Return processed · " + fmt(totalReturn) + " refunded");
    onClose();
  };

  return (
    <Modal title="Process a return" onClose={onClose} width="max-w-lg">
      {!sale ? (
        <div>
          <Field label="Original receipt number">
            <div className="flex gap-2">
              <input autoFocus className={inputCls} value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="e.g. R-12345678" />
              <button onClick={search} className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white shrink-0">Find</button>
            </div>
          </Field>
          {notFound && <div className="text-xs text-red-500 mt-2">No sale found with that receipt number.</div>}
        </div>
      ) : (
        <div>
          <div className="text-xs text-gray-400 mb-3">Receipt {sale.receiptNo} · {new Date(sale.date).toLocaleString()}</div>
          <div className="space-y-2.5 max-h-64 overflow-auto">
            {sale.items.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2">
                <div>
                  <div className="font-medium text-gray-800">{i.name}</div>
                  <div className="text-xs text-gray-400">Purchased {i.qty} @ {fmt(i.price)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(i.id, (returnQty[i.id] || 0) - 1, i.qty)} className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center"><Minus size={12} /></button>
                  <span className="w-6 text-center text-sm">{returnQty[i.id] || 0}</span>
                  <button onClick={() => setQty(i.id, (returnQty[i.id] || 0) + 1, i.qty)} className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center"><Plus size={12} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm font-semibold mt-4 pt-3 border-t border-gray-100">
            <span>Refund total</span><span>{fmt(totalReturn)}</span>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setSale(null)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600">Back</button>
            <button disabled={totalReturn === 0} onClick={processReturn} className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white disabled:opacity-40">Process return</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ReceiptModal({ sale, config, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <style>{`@media print { body * { visibility: hidden; } #ipos-receipt, #ipos-receipt * { visibility: visible; } #ipos-receipt { position: fixed; top: 0; left: 0; width: 100%; } }`}</style>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-2 text-green-600 mb-1"><Check size={18} /><span className="text-sm font-semibold">Sale completed</span></div>
        <div id="ipos-receipt" className="border border-dashed border-gray-300 rounded-lg p-4 mt-3 font-mono text-xs text-gray-700">
          <div className="text-center mb-2">
            <div className="font-bold text-sm">{config.business.name || "Store"}</div>
            <div>{config.business.address}</div>
            <div>{config.business.city} {config.business.phone && "· " + config.business.phone}</div>
          </div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div>Receipt: {sale.receiptNo}</div>
          <div>{new Date(sale.date).toLocaleString()}</div>
          <div>Register: {sale.register} · Cashier: {sale.cashier}</div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          {sale.items.map((i) => (
            <div key={i.id} className="flex justify-between">
              <span>{i.qty} x {i.name}</span>
              <span>{fmt(i.price * i.qty)}</span>
            </div>
          ))}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between"><span>Subtotal</span><span>{fmt(sale.subtotal)}</span></div>
          {sale.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{fmt(sale.discount)}</span></div>}
          <div className="flex justify-between"><span>Tax</span><span>{fmt(sale.tax)}</span></div>
          <div className="flex justify-between font-bold text-sm"><span>Total</span><span>{fmt(sale.total)}</span></div>
          <div className="flex justify-between mt-1"><span>Paid via</span><span>{sale.paymentMethod}</span></div>
          {sale.cashReceived != null && <div className="flex justify-between"><span>Cash / Change</span><span>{fmt(sale.cashReceived)} / {fmt(sale.change)}</span></div>}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-center">{config.business.receiptFooter}</div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600">Close</button>
          <button onClick={() => window.print()} className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-green-600 text-white flex items-center justify-center gap-1.5"><Printer size={15} /> Print receipt</button>
        </div>
      </div>
    </div>
  );
}
