// src/App.jsx — Zero Hunger Connect v2 — FULLY FIXED
import { useState, useEffect, createContext, useContext, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import api from "./api.js";

// ── Context — user, toast, setPage available everywhere ───────────────────────
const Ctx = createContext(null);
const useCtx = () => useContext(Ctx);

// ── Constants ─────────────────────────────────────────────────────────────────
const URGENCY_LABELS = {
  less_than_1h: "🔴 Less than 1 hour",
  "1_2h":       "🟠 1–2 hours",
  "2_3h":       "🟡 2–3 hours",
  "4_5h":       "🔵 4–5 hours",
  more_than_5h: "⚪ More than 5 hours"
};

const DISTRICTS = [
  "Bagalkote","Ballari","Belagavi","Bengaluru Rural","Bengaluru Urban",
  "Bidar","Chamarajanagara","Chikkaballapura","Chikkamagaluru","Chitradurga",
  "Dakshina Kannada","Davanagere","Dharwad","Gadag","Hassan","Haveri",
  "Kalaburagi","Kodagu","Kolar","Koppal","Mandya","Mysuru","Raichur",
  "Ramanagara","Shivamogga","Tumakuru","Udupi","Uttara Kannada","Vijayapura","Yadgir"
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeLeft(ms) {
  const diff = ms - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function expiryColor(ms) {
  const h = (ms - Date.now()) / 3600000;
  if (h <= 0) return "#6e2020";
  if (h < 1)  return "#da3633";
  if (h < 3)  return "#d29922";
  return "#2ea043";
}
function fmtDate(ts) {
  return new Date(ts).toLocaleString("en-IN", {
    day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"
  });
}

// ── UI Primitives ─────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position:"fixed", bottom:20, right:20, zIndex:9999, display:"flex", flexDirection:"column", gap:8 }}>
      {toasts.map(t => (
        <div key={t.id} className="fade-in" style={{
          padding:"12px 18px", borderRadius:10, fontSize:13, fontWeight:500, maxWidth:360,
          background: t.type==="success"?"#1a4731":t.type==="error"?"#4a1515":"#1a3560",
          color:"#e6edf3",
          border:`1px solid ${t.type==="success"?"#2ea043":t.type==="error"?"#da3633":"#388bfd"}`,
          boxShadow:"0 4px 16px rgba(0,0,0,0.5)"
        }}>{t.msg}</div>
      ))}
    </div>
  );
}

function Pill({ text, color="#388bfd" }) {
  return (
    <span style={{
      background:color+"22", color, fontSize:11, padding:"2px 8px",
      borderRadius:20, fontWeight:600, display:"inline-flex", alignItems:"center"
    }}>{text}</span>
  );
}
function StatusPill({ status }) {
  const map = { available:"#2ea043", partial:"#d29922", matched:"#8b5cf6", fulfilled:"#2ea043", pending:"#8b949e", expired:"#da3633", confirmed:"#2ea043", cancelled:"#da3633" };
  return <Pill text={status} color={map[status]||"#8b949e"} />;
}
function UrgencyPill({ level }) {
  const colors = { less_than_1h:"#da3633","1_2h":"#e3660d","2_3h":"#d29922","4_5h":"#388bfd",more_than_5h:"#8b949e" };
  return <Pill text={URGENCY_LABELS[level]||level} color={colors[level]||"#8b949e"} />;
}

function Card({ children, style={}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background:"var(--bg-card)", border:"1px solid var(--border-light)",
      borderRadius:"var(--radius-lg)", padding:"16px 20px",
      cursor:onClick?"pointer":"default", transition:"border-color 0.15s", ...style
    }}
    onMouseEnter={e=>onClick&&(e.currentTarget.style.borderColor="var(--green-light)")}
    onMouseLeave={e=>onClick&&(e.currentTarget.style.borderColor="var(--border-light)")}
    >{children}</div>
  );
}
function MetricCard({ label, value, icon, color="#2ea043", sub }) {
  return (
    <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-light)", borderRadius:"var(--radius-lg)", padding:"16px", flex:1, minWidth:130 }}>
      <div style={{ fontSize:20, marginBottom:6 }}>{icon}</div>
      <div style={{ fontSize:24, fontWeight:600, color }}>{value}</div>
      <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:4 }}>{label}</div>
      {sub&&<div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function Btn({ children, onClick, variant="primary", disabled, style={}, size="md", loading }) {
  const bg    = { primary:"#238636", danger:"#da3633", ghost:"transparent", info:"#1a3560", orange:"#7d3b0d", purple:"#4a2090" };
  const bdr   = { primary:"#2ea043", danger:"#f85149", ghost:"var(--border)", info:"#388bfd", orange:"#e3660d", purple:"#8b5cf6" };
  const clr   = { ghost:"var(--text-primary)" };
  const pad   = { sm:"4px 10px", md:"7px 14px", lg:"10px 20px" };
  return (
    <button disabled={disabled||loading} onClick={onClick} style={{
      background:bg[variant]||bg.primary, border:`1px solid ${bdr[variant]||bdr.primary}`,
      color:clr[variant]||"#fff", padding:pad[size], ...style
    }}>
      {loading?<span className="spin" style={{fontSize:12}}>⟳</span>:children}
    </button>
  );
}

function Field({ label, required, children, error }) {
  return (
    <div style={{ marginBottom:16 }}>
      {label && (
        <label style={{ display:"block", fontSize:12, color:"var(--text-secondary)", marginBottom:5, fontWeight:500 }}>
          {label}{required&&<span style={{color:"var(--red)"}}> *</span>}
        </label>
      )}
      {children}
      {error && <div style={{ color:"#f85149", fontSize:11, marginTop:4, display:"flex", alignItems:"center", gap:4 }}>⚠ {error}</div>}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="fade-in" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", width:"100%", maxWidth:540, maxHeight:"90vh", overflow:"auto" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border-light)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontWeight:600, fontSize:15 }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", color:"var(--text-secondary)", fontSize:18, border:"none", padding:0, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"20px" }}>{children}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--text-secondary)" }}>
      <div style={{ fontSize:40, marginBottom:12 }}>{icon}</div>
      <div style={{ fontSize:16, fontWeight:500, color:"var(--text-primary)" }}>{title}</div>
      {sub&&<div style={{ fontSize:13, marginTop:6 }}>{sub}</div>}
    </div>
  );
}
function Spinner() {
  return (
    <div style={{ display:"flex", justifyContent:"center", padding:40 }}>
      <div className="spin" style={{ width:20, height:20, border:"2px solid var(--border)", borderTopColor:"var(--green-light)", borderRadius:"50%" }} />
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ user, page, setPage, onLogout, unreadCount }) {
  const nav = {
    donor:    [{ key:"dashboard", icon:"🏠", label:"Dashboard" }, { key:"add-food", icon:"➕", label:"Add Donation" }, { key:"matches", icon:"🤝", label:"My Matches" }],
    receiver: [{ key:"dashboard", icon:"🏠", label:"Dashboard" }, { key:"new-request", icon:"➕", label:"New Request" }, { key:"browse", icon:"🔍", label:"Available Food" }, { key:"matches", icon:"🤝", label:"My Allocations" }],
    admin:    [{ key:"dashboard", icon:"📊", label:"Overview" }, { key:"donations", icon:"🥗", label:"Donations" }, { key:"requests", icon:"📋", label:"Requests" }, { key:"matches", icon:"🤝", label:"Matches" }, { key:"users", icon:"👥", label:"Users" }]
  };
  const items = nav[user.role]||[];
  return (
    <div style={{ width:220, minHeight:"100vh", background:"var(--bg-secondary)", borderRight:"1px solid var(--border-light)", display:"flex", flexDirection:"column", flexShrink:0 }}>
      <div style={{ padding:"18px 16px", borderBottom:"1px solid var(--border-light)" }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#2ea043" }}>🌾 ZeroHunger</div>
        <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>Connect v2</div>
      </div>
      <div style={{ padding:"12px 14px", borderBottom:"1px solid var(--border-light)" }}>
        <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</div>
        <div style={{ marginTop:4, display:"flex", gap:4, flexWrap:"wrap" }}>
          <Pill text={user.role} color={user.role==="admin"?"#8b5cf6":user.role==="donor"?"#2ea043":"#388bfd"} />
          {user.district&&<span style={{ fontSize:10, color:"var(--text-muted)", alignSelf:"center" }}>{user.district}</span>}
        </div>
      </div>
      <nav style={{ flex:1, padding:"8px" }}>
        {items.map(item=>(
          <button key={item.key} onClick={()=>setPage(item.key)} style={{
            width:"100%", display:"flex", alignItems:"center", gap:10, padding:"8px 10px",
            borderRadius:"var(--radius)", marginBottom:2,
            background:page===item.key?"#1a4731":"none",
            color:page===item.key?"#2ea043":"var(--text-secondary)",
            border:page===item.key?"1px solid #2ea04340":"1px solid transparent",
            fontSize:13, fontWeight:page===item.key?600:400, transition:"all 0.15s", textAlign:"left"
          }}>{item.icon} {item.label}</button>
        ))}
        <button onClick={()=>setPage("notifications")} style={{
          width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
          gap:10, padding:"8px 10px", borderRadius:"var(--radius)", marginBottom:2,
          background:page==="notifications"?"#1a4731":"none",
          color:page==="notifications"?"#2ea043":"var(--text-secondary)",
          border:page==="notifications"?"1px solid #2ea04340":"1px solid transparent",
          fontSize:13, transition:"all 0.15s"
        }}>
          <span>🔔 Notifications</span>
          {unreadCount>0&&<span style={{ background:"var(--red)", color:"#fff", fontSize:10, borderRadius:20, padding:"1px 6px", fontWeight:700 }}>{unreadCount}</span>}
        </button>
      </nav>
      <div style={{ padding:"12px 8px", borderTop:"1px solid var(--border-light)" }}>
        <button onClick={onLogout} style={{ width:"100%", padding:"8px 10px", background:"none", color:"var(--text-muted)", border:"1px solid transparent", borderRadius:"var(--radius)", fontSize:13, textAlign:"left", display:"flex", alignItems:"center", gap:8 }}
          onMouseEnter={e=>{e.currentTarget.style.color="#da3633";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--text-muted)";}}>
          ⎋ Sign Out
        </button>
      </div>
    </div>
  );
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name:"", email:"", password:"", role:"donor", type:"", phone:"", district:"" });
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState("");
  const [takenDistricts, setTakenDistricts] = useState([]);

  useEffect(() => { api.districts().then(d=>setTakenDistricts(d.takenDistricts||[])).catch(()=>{}); }, []);

  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const submit = async () => {
    setErr(""); setLoading(true);
    try {
      const data = mode==="login"
        ? await api.login({ email:form.email, password:form.password })
        : await api.register(form);
      localStorage.setItem("zhc_token", data.token);
      onAuth(data.user);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg-primary)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:48 }}>🌾</div>
          <h1 style={{ fontSize:24, fontWeight:700, color:"#2ea043", marginTop:8 }}>Zero Hunger Connect</h1>
          <p style={{ color:"var(--text-secondary)", fontSize:13, marginTop:4 }}>Smart food donation & allocation platform</p>
        </div>
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"28px" }}>
          <div style={{ display:"flex", gap:8, marginBottom:24 }}>
            {["login","register"].map(m=>(
              <button key={m} onClick={()=>{setMode(m);setErr("");}} style={{ flex:1, padding:"8px", background:mode===m?"#238636":"none", color:mode===m?"#fff":"var(--text-secondary)", border:`1px solid ${mode===m?"#2ea043":"var(--border)"}`, borderRadius:"var(--radius)", fontWeight:500, fontSize:13 }}>
                {m==="login"?"Sign In":"Register"}
              </button>
            ))}
          </div>
          {err&&<div style={{ background:"#4a151540", border:"1px solid var(--red)", borderRadius:"var(--radius)", padding:"10px 14px", fontSize:13, color:"#f85149", marginBottom:16 }}>{err}</div>}
          {mode==="register"&&<Field label="Full Name" required><input value={form.name} onChange={set("name")} placeholder="Your name" /></Field>}
          <Field label="Email" required><input type="email" value={form.email} onChange={set("email")} placeholder="email@example.com" /></Field>
          <Field label="Password" required><input type="password" value={form.password} onChange={set("password")} placeholder="Password" /></Field>
          {mode==="register"&&<>
            <Field label="Role" required>
              <select value={form.role} onChange={set("role")}>
                <option value="donor">Donor (I have food to share)</option>
                <option value="receiver">Receiver (I need food)</option>
                <option value="admin">District Admin</option>
              </select>
            </Field>
            {form.role!=="admin"&&<Field label="Organization Type"><input value={form.type} onChange={set("type")} placeholder="e.g. Hotel, NGO, Temple, Orphanage..." /></Field>}
            <Field label="Phone"><input value={form.phone} onChange={set("phone")} placeholder="+91 XXXXX XXXXX" /></Field>
            {form.role==="admin"&&<Field label="District" required>
              <select value={form.district} onChange={set("district")}>
                <option value="">— Select District —</option>
                {DISTRICTS.map(d=><option key={d} value={d} disabled={takenDistricts.includes(d)}>{d}{takenDistricts.includes(d)?" (admin exists)":""}</option>)}
              </select>
              <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>Only one admin per district allowed.</div>
            </Field>}
          </>}
          <Btn onClick={submit} loading={loading} style={{ width:"100%", justifyContent:"center", padding:"10px", fontSize:14, marginTop:8 }}>
            {mode==="login"?"Sign In":"Create Account"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Donor: Dashboard ──────────────────────────────────────────────────────────
function DonorDashboard() {
  const { toast } = useCtx();
  const [listings, setListings] = useState([]);
  const [loading, setLoading]   = useState(true);

  const load = async () => {
    setLoading(true);
    try { setListings(await api.getFood()); }
    catch(e) { toast(e.message,"error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const del = async id => {
    if (!confirm("Delete this donation?")) return;
    try { await api.deleteFood(id); toast("Deleted","success"); load(); }
    catch(e) { toast(e.message,"error"); }
  };

  const active  = listings.filter(l=>l.status==="available"||l.status==="partial");
  const matched = listings.filter(l=>l.status==="matched");
  const total   = active.reduce((s,l)=>s+(l.remainingMeals??l.totalMeals),0);

  if (loading) return <Spinner />;
  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:600, marginBottom:20 }}>My Donations</h2>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:24 }}>
        <MetricCard label="Active Donations"     value={active.length}  icon="🥗" color="#2ea043" />
        <MetricCard label="Meals Available"      value={total}          icon="🍽️" color="#388bfd" />
        <MetricCard label="Successfully Matched" value={matched.length} icon="✅" color="#8b5cf6" />
      </div>
      {listings.length===0
        ? <EmptyState icon="🥗" title="No donations yet" sub='Click "Add Donation" to post your first donation.' />
        : <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {listings.map(l=>(
              <Card key={l._id}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                      <span style={{ fontWeight:600 }}>{l.description}</span>
                      <StatusPill status={l.status} />
                      <Pill text={l.foodType} color="#d29922" />
                    </div>
                    <div style={{ display:"flex", gap:16, color:"var(--text-secondary)", fontSize:12, flexWrap:"wrap" }}>
                      <span>🍽️ {l.remainingMeals??l.totalMeals} / {l.totalMeals} meals</span>
                      <span style={{ color:expiryColor(l.expiryTime) }}>⏱ Expires: {timeLeft(l.expiryTime)}</span>
                      <span>📍 {l.location?.address||"Location set"}</span>
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>Posted {fmtDate(l.createdAt)}</div>
                  </div>
                  {(l.status==="available"||l.status==="partial")&&<Btn variant="danger" size="sm" onClick={()=>del(l._id)}>Delete</Btn>}
                </div>
              </Card>
            ))}
          </div>
      }
    </div>
  );
}

// ── Donor: Add Donation Form — FULLY REWRITTEN, SIMPLE & WORKING ──────────────
function AddFoodForm() {
  const { toast, setPage } = useCtx();

  // Simple flat state — all strings so React controls them perfectly
  const [description, setDescription] = useState("");
  const [totalMeals,  setTotalMeals]  = useState("");
  const [expiryHours, setExpiryHours] = useState("");
  const [foodType,    setFoodType]    = useState("Veg");
  const [category,    setCategory]    = useState("Cooked Meals");
  const [address,     setAddress]     = useState("");
  const [lat,         setLat]         = useState("");
  const [lng,         setLng]         = useState("");
  const [locMode,     setLocMode]     = useState("manual");
  const [loading,     setLoading]     = useState(false);
  const [geoLoading,  setGeoLoading]  = useState(false);

  const detectGeo = () => {
    if (!navigator.geolocation) { toast("Geolocation not supported","error"); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(String(pos.coords.latitude)); setLng(String(pos.coords.longitude)); setGeoLoading(false); toast("Location detected ✓","success"); },
      ()  => { setGeoLoading(false); toast("Could not detect location","error"); }
    );
  };

  const handleSubmit = async () => {
    // --- Validation: show specific errors in toast ---
    const desc  = description.trim();
    const meals = parseInt(totalMeals);
    const exp   = parseFloat(expiryHours);

    if (!desc) {
      toast("⚠ Please enter a food description","error"); return;
    }
    if (!totalMeals || isNaN(meals) || meals < 1) {
      toast("⚠ Please enter a valid number of meals (minimum 1)","error"); return;
    }
    if (!expiryHours || isNaN(exp) || exp <= 0) {
      toast("⚠ Please select an expiry time","error"); return;
    }

    // Build location object
    const location = (locMode==="auto" && lat && lng)
      ? { lat:parseFloat(lat), lng:parseFloat(lng), address:"Detected location" }
      : { lat:14.9981, lng:75.5681, address: address.trim()||"Location not specified" };

    setLoading(true);
    try {
      await api.createFood({ description:desc, totalMeals:meals, expiryHours:exp, foodType, category, location });
      toast("✅ Donation posted successfully!","success");
      // Reset
      setDescription(""); setTotalMeals(""); setExpiryHours("");
      setFoodType("Veg"); setCategory("Cooked Meals");
      setAddress(""); setLat(""); setLng(""); setLocMode("manual");
      // Go to dashboard after 1s
      setTimeout(()=>setPage("dashboard"), 1000);
    } catch(e) {
      toast("Error: "+e.message,"error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:600, marginBottom:20 }}>Post a Donation</h2>
      <Card style={{ maxWidth:560 }}>

        <Field label="Food Description" required>
          <input
            value={description}
            onChange={e=>setDescription(e.target.value)}
            placeholder="e.g. Freshly cooked rice and sambar, 50 plates"
            style={{ width:"100%" }}
          />
        </Field>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Food Type">
            <select value={foodType} onChange={e=>setFoodType(e.target.value)}>
              <option value="Veg">Veg</option>
              <option value="Non-Veg">Non-Veg</option>
              <option value="Vegan">Vegan</option>
              <option value="Any">Any</option>
            </select>
          </Field>
          <Field label="Category">
            <select value={category} onChange={e=>setCategory(e.target.value)}>
              <option>Cooked Meals</option>
              <option>Raw Ingredients</option>
              <option>Packaged Food</option>
              <option>Bakery Items</option>
              <option>Fruits &amp; Vegetables</option>
              <option>Other</option>
            </select>
          </Field>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Number of Meals" required>
            <input
              type="number"
              min="1"
              value={totalMeals}
              onChange={e=>setTotalMeals(e.target.value)}
              placeholder="e.g. 100"
              style={{ width:"100%" }}
            />
          </Field>
          <Field label="Expiry Time" required>
            <select value={expiryHours} onChange={e=>setExpiryHours(e.target.value)} style={{ width:"100%" }}>
              <option value="">— Select —</option>
              <option value="1">1 hour</option>
              <option value="2">2 hours</option>
              <option value="3">3 hours</option>
              <option value="6">6 hours</option>
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
            </select>
          </Field>
        </div>

        <Field label="Location">
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <button onClick={()=>setLocMode("manual")} style={{ padding:"5px 12px", borderRadius:"var(--radius)", fontSize:12, background:locMode==="manual"?"#238636":"none", color:locMode==="manual"?"#fff":"var(--text-secondary)", border:`1px solid ${locMode==="manual"?"#2ea043":"var(--border)"}` }}>✏️ Manual</button>
            <button onClick={()=>setLocMode("auto")} style={{ padding:"5px 12px", borderRadius:"var(--radius)", fontSize:12, background:locMode==="auto"?"#238636":"none", color:locMode==="auto"?"#fff":"var(--text-secondary)", border:`1px solid ${locMode==="auto"?"#2ea043":"var(--border)"}` }}>📍 Auto Detect</button>
          </div>
          {locMode==="manual"
            ? <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Enter address or area (optional)" style={{ width:"100%" }} />
            : <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input readOnly value={lat&&lng?`${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`:""} placeholder="Click Detect to get coordinates" style={{ flex:1 }} />
                <Btn onClick={detectGeo} loading={geoLoading} variant="info" size="sm">Detect</Btn>
              </div>
          }
        </Field>

        <Btn
          onClick={handleSubmit}
          loading={loading}
          style={{ width:"100%", justifyContent:"center", padding:"11px", marginTop:4, fontSize:14 }}
        >
          🥗 Post Donation
        </Btn>

      </Card>
    </div>
  );
}

// ── Donor: Matches ────────────────────────────────────────────────────────────
function DonorMatches() {
  const { toast } = useCtx();
  const [matches,setMatches]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ api.getMatches().then(setMatches).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false)); },[]);
  if (loading) return <Spinner />;
  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:600, marginBottom:20 }}>My Matches</h2>
      {matches.length===0
        ? <EmptyState icon="🤝" title="No matches yet" sub="Matches appear here when your donations are allocated." />
        : <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {matches.map(m=>(
              <Card key={m._id}>
                <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                  <StatusPill status={m.status} />
                  {m.autoMatched&&<Pill text="Auto-matched" color="#8b5cf6" />}
                  {m.covered?<Pill text="Fully covered" color="#2ea043"/>:<Pill text="Partial" color="#d29922"/>}
                </div>
                {m.allocations?.map((a,i)=>(
                  <div key={i} style={{ fontSize:13, color:"var(--text-secondary)", marginTop:4 }}>
                    🍽️ {a.allocated} meals allocated · 📍 {a.km}km away
                  </div>
                ))}
                <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:8 }}>{fmtDate(m.timestamp)}</div>
              </Card>
            ))}
          </div>
      }
    </div>
  );
}

// ── Receiver: Dashboard ───────────────────────────────────────────────────────
function ReceiverDashboard() {
  const { toast } = useCtx();
  const [requests,setRequests]=useState([]);
  const [loading,setLoading]=useState(true);

  const load = async () => {
    setLoading(true);
    try { setRequests(await api.getRequests()); }
    catch(e) { toast(e.message,"error"); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ load(); },[]);

  const cancel = async id => {
    try { await api.cancelRequest(id); toast("Request cancelled","success"); load(); }
    catch(e) { toast(e.message,"error"); }
  };

  const active    = requests.filter(r=>r.status==="pending"||r.status==="partial");
  const fulfilled = requests.filter(r=>r.status==="fulfilled");

  if (loading) return <Spinner />;
  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:600, marginBottom:20 }}>My Requests</h2>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:24 }}>
        <MetricCard label="Active Requests" value={active.length}    icon="📋" color="#388bfd" />
        <MetricCard label="Fulfilled"       value={fulfilled.length} icon="✅" color="#2ea043" />
        <MetricCard label="Total Requests"  value={requests.length}  icon="📊" color="#8b949e" />
      </div>
      {requests.length===0
        ? <EmptyState icon="📋" title="No requests yet" sub='Click "New Request" to request food.' />
        : <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {requests.map(r=>(
              <Card key={r._id} style={{ borderColor:(r.urgencyLevel==="less_than_1h"||r.urgencyLevel==="1_2h")?"#da363360":undefined }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                      <StatusPill status={r.status} />
                      <UrgencyPill level={r.urgencyLevel} />
                    </div>
                    <div style={{ display:"flex", gap:16, color:"var(--text-secondary)", fontSize:12, flexWrap:"wrap" }}>
                      <span>🍽️ Need: {r.remainingMealsNeeded??r.requiredMeals} / {r.requiredMeals} meals</span>
                      <span>📍 {r.location?.address||"Location set"}</span>
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>Requested {fmtDate(r.createdAt)}</div>
                  </div>
                  {(r.status==="pending"||r.status==="partial")&&(
                    <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                      <MatchPreviewBtn requestId={r._id} onDone={load} />
                      <Btn variant="danger" size="sm" onClick={()=>cancel(r._id)}>Cancel</Btn>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
      }
    </div>
  );
}

// ── Match Preview Button ──────────────────────────────────────────────────────
function MatchPreviewBtn({ requestId, onDone }) {
  const { toast } = useCtx();
  const [open,setOpen]=useState(false);
  const [preview,setPreview]=useState(null);
  const [loading,setLoading]=useState(false);
  const [confirming,setConfirming]=useState(false);

  const doPreview = async () => {
    setLoading(true); setOpen(true);
    try { setPreview(await api.previewMatch(requestId)); }
    catch(e) { toast(e.message,"error"); setOpen(false); }
    finally { setLoading(false); }
  };

  const confirm = async () => {
    setConfirming(true);
    try {
      await api.confirmMatch(requestId);
      toast("Match confirmed! Donor notified.","success");
      setOpen(false); onDone&&onDone();
    } catch(e) { toast(e.message,"error"); }
    finally { setConfirming(false); }
  };

  return (
    <>
      <Btn variant="info" size="sm" onClick={doPreview} loading={loading}>🔍 Match</Btn>
      {open&&(
        <Modal title="Match Preview" onClose={()=>setOpen(false)}>
          {loading ? <Spinner /> : preview ? (
            <div>
              <div style={{ marginBottom:12 }}>
                <span style={{ fontSize:13, color:"var(--text-secondary)" }}>Need: <strong style={{ color:"var(--text-primary)" }}>{preview.request?.requiredMeals} meals</strong></span>
                {" "}{preview.covered?<Pill text="✅ Fully covered" color="#2ea043"/>:<Pill text={`⚠ Shortfall: ${preview.remaining} meals`} color="#d29922"/>}
              </div>
              {preview.allocations?.map((a,i)=>(
                <Card key={i} style={{ marginBottom:10, background:"var(--bg-secondary)" }}>
                  <div style={{ fontWeight:600, marginBottom:4 }}>{a.donorName}</div>
                  <div style={{ fontSize:12, color:"var(--text-secondary)", display:"flex", gap:12, flexWrap:"wrap" }}>
                    <span>🍽️ {a.allocated} meals</span>
                    <span>📍 {a.km} km</span>
                    <span>⭐ Score: {Math.round(a.score*100)}%</span>
                    <span style={{ color:expiryColor(a.expiryTime) }}>⏱ {timeLeft(a.expiryTime)}</span>
                  </div>
                </Card>
              ))}
              {!preview.allocations?.length&&<div style={{ color:"var(--text-secondary)", textAlign:"center", padding:"20px 0" }}>No donors available right now</div>}
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
                <Btn variant="ghost" onClick={()=>setOpen(false)}>Close</Btn>
                {preview.allocations?.length>0&&<Btn onClick={confirm} loading={confirming}>Confirm Match</Btn>}
              </div>
            </div>
          ):null}
        </Modal>
      )}
    </>
  );
}

// ── Receiver: New Request Form — FULLY REWRITTEN, SIMPLE & WORKING ────────────
function NewRequestForm() {
  const { toast, setPage } = useCtx();

  // Simple individual state variables — no nested objects
  const [requiredMeals,  setRequiredMeals]  = useState("");
  const [foodPreference, setFoodPreference] = useState("Any");
  const [urgencyLevel,   setUrgencyLevel]   = useState("more_than_5h");
  const [notes,          setNotes]          = useState("");
  const [address,        setAddress]        = useState("");
  const [lat,            setLat]            = useState("");
  const [lng,            setLng]            = useState("");
  const [locMode,        setLocMode]        = useState("manual");
  const [loading,        setLoading]        = useState(false);
  const [geoLoading,     setGeoLoading]     = useState(false);

  const isEmergency = urgencyLevel==="less_than_1h"||urgencyLevel==="1_2h";

  const detectGeo = () => {
    if (!navigator.geolocation) { toast("Geolocation not supported","error"); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(String(pos.coords.latitude)); setLng(String(pos.coords.longitude)); setGeoLoading(false); toast("Location detected ✓","success"); },
      ()  => { setGeoLoading(false); toast("Could not detect location","error"); }
    );
  };

  const handleSubmit = async () => {
    const meals = parseInt(requiredMeals);
    if (!requiredMeals || isNaN(meals) || meals < 1) {
      toast("⚠ Please enter a valid number of meals (minimum 1)","error"); return;
    }

    const location = (locMode==="auto" && lat && lng)
      ? { lat:parseFloat(lat), lng:parseFloat(lng), address:"Detected location" }
      : { lat:14.9981, lng:75.5681, address:address.trim()||"Location not specified" };

    setLoading(true);
    try {
      await api.createRequest({ requiredMeals:meals, foodPreference, urgencyLevel, notes:notes.trim(), location });
      toast("✅ Request submitted successfully!","success");
      setRequiredMeals(""); setFoodPreference("Any"); setUrgencyLevel("more_than_5h");
      setNotes(""); setAddress(""); setLat(""); setLng(""); setLocMode("manual");
      setTimeout(()=>setPage("dashboard"), 1000);
    } catch(e) {
      toast("Error: "+e.message,"error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:600, marginBottom:20 }}>New Food Request</h2>

      {isEmergency&&(
        <div style={{ background:"#4a151540", border:"1px solid var(--red)", borderRadius:"var(--radius)", padding:"10px 14px", marginBottom:16, fontSize:13, color:"#f85149" }}>
          🚨 Emergency request — highest matching priority will be assigned
        </div>
      )}

      <Card style={{ maxWidth:560 }}>

        <Field label="Meals Required" required>
          <input
            type="number"
            min="1"
            value={requiredMeals}
            onChange={e=>setRequiredMeals(e.target.value)}
            placeholder="e.g. 50"
            style={{ width:"100%" }}
          />
        </Field>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Food Preference">
            <select value={foodPreference} onChange={e=>setFoodPreference(e.target.value)} style={{ width:"100%" }}>
              <option value="Any">Any</option>
              <option value="Veg">Veg Only</option>
              <option value="Non-Veg">Non-Veg</option>
              <option value="Vegan">Vegan</option>
            </select>
          </Field>
          <Field label="Urgency Level" required>
            <select value={urgencyLevel} onChange={e=>setUrgencyLevel(e.target.value)} style={{ width:"100%", borderColor:isEmergency?"var(--red)":undefined }}>
              {Object.entries(URGENCY_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Notes">
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Dietary restrictions or special requirements (optional)" style={{ resize:"vertical", width:"100%" }} />
        </Field>

        <Field label="Your Location">
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <button onClick={()=>setLocMode("manual")} style={{ padding:"5px 12px", borderRadius:"var(--radius)", fontSize:12, background:locMode==="manual"?"#238636":"none", color:locMode==="manual"?"#fff":"var(--text-secondary)", border:`1px solid ${locMode==="manual"?"#2ea043":"var(--border)"}` }}>✏️ Manual</button>
            <button onClick={()=>setLocMode("auto")} style={{ padding:"5px 12px", borderRadius:"var(--radius)", fontSize:12, background:locMode==="auto"?"#238636":"none", color:locMode==="auto"?"#fff":"var(--text-secondary)", border:`1px solid ${locMode==="auto"?"#2ea043":"var(--border)"}` }}>📍 Auto Detect</button>
          </div>
          {locMode==="manual"
            ? <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Enter your address / area (optional)" style={{ width:"100%" }} />
            : <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input readOnly value={lat&&lng?`${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`:""} placeholder="Click Detect to get coordinates" style={{ flex:1 }} />
                <Btn onClick={detectGeo} loading={geoLoading} variant="info" size="sm">Detect</Btn>
              </div>
          }
        </Field>

        <Btn
          onClick={handleSubmit}
          loading={loading}
          variant={isEmergency?"danger":"primary"}
          style={{ width:"100%", justifyContent:"center", padding:"11px", marginTop:4, fontSize:14 }}
        >
          {isEmergency?"🚨 Submit Emergency Request":"📋 Submit Request"}
        </Btn>

      </Card>
    </div>
  );
}

// ── Receiver: Browse Food ─────────────────────────────────────────────────────
function BrowseFood() {
  const { toast } = useCtx();
  const [listings,setListings]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ api.getFood({status:"available"}).then(setListings).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false)); },[]);
  if (loading) return <Spinner />;
  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:600, marginBottom:20 }}>Available Food</h2>
      {listings.length===0
        ? <EmptyState icon="🥗" title="No food available right now" sub="Check back soon." />
        : <div style={{ display:"grid", gap:12, gridTemplateColumns:"repeat(auto-fill, minmax(300px,1fr))" }}>
            {listings.map(l=>(
              <Card key={l._id}>
                <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                  <Pill text={l.foodType} color="#d29922" />
                  <Pill text={l.category} color="#388bfd" />
                  <StatusPill status={l.status} />
                </div>
                <div style={{ fontWeight:500, marginBottom:6 }}>{l.description}</div>
                <div style={{ fontSize:12, color:"var(--text-secondary)", display:"flex", flexDirection:"column", gap:4 }}>
                  <span>🍽️ {l.remainingMeals??l.totalMeals} meals available</span>
                  <span style={{ color:expiryColor(l.expiryTime) }}>⏱ Expires in {timeLeft(l.expiryTime)}</span>
                  <span>📍 {l.location?.address||"Location set"}</span>
                </div>
              </Card>
            ))}
          </div>
      }
    </div>
  );
}

// ── Receiver: My Allocations ──────────────────────────────────────────────────
function ReceiverMatches() {
  const { toast } = useCtx();
  const [matches,setMatches]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ api.getMatches().then(setMatches).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false)); },[]);
  if (loading) return <Spinner />;
  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:600, marginBottom:20 }}>My Allocations</h2>
      {matches.length===0
        ? <EmptyState icon="🤝" title="No allocations yet" sub="Submit a request and the system will match you automatically." />
        : <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {matches.map(m=>(
              <Card key={m._id} style={{ borderColor:m.covered?"#2ea04340":"#d2992240" }}>
                <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                  <StatusPill status={m.status} />
                  {m.autoMatched&&<Pill text="Auto-matched" color="#8b5cf6"/>}
                  {m.covered?<Pill text="✅ Fully covered" color="#2ea043"/>:<Pill text="⚠ Partial" color="#d29922"/>}
                </div>
                <div style={{ fontSize:13, fontWeight:500, marginBottom:8 }}>
                  🍽️ {m.totalAllocated} meals allocated
                  {!m.covered&&m.remaining>0&&<span style={{ color:"#d29922" }}> (shortfall: {m.remaining} meals)</span>}
                </div>
                {m.allocations?.map((a,i)=>(
                  <div key={i} style={{ background:"var(--bg-secondary)", borderRadius:"var(--radius)", padding:"10px 12px", marginBottom:8, fontSize:12 }}>
                    <div style={{ fontWeight:600, color:"var(--text-primary)" }}>🧑‍🍳 {a.donorName}</div>
                    <div style={{ color:"var(--text-secondary)", marginTop:4, display:"flex", gap:12, flexWrap:"wrap" }}>
                      <span>🍽️ {a.allocated} meals</span>
                      {a.donorPhone&&<span>📞 {a.donorPhone}</span>}
                      {a.donorLocation?.address&&<span>📍 {a.donorLocation.address}</span>}
                      <span>📏 {a.km} km</span>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>{fmtDate(m.timestamp)}</div>
              </Card>
            ))}
          </div>
      }
    </div>
  );
}

// ── Admin: Overview ───────────────────────────────────────────────────────────
function AdminDashboard() {
  const { toast, user } = useCtx();
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ api.adminAnalytics().then(setData).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false)); },[]);
  if (loading) return <Spinner />;
  if (!data) return <EmptyState icon="📊" title="No data" />;
  const { summary, dailyData, foodTypeDistribution, matchCoverage } = data;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ fontSize:20, fontWeight:600 }}>Overview {user.district?`— ${user.district}`:""}</h2>
        <Pill text={`Match Rate: ${matchCoverage}%`} color="#8b5cf6" />
      </div>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:24 }}>
        <MetricCard label="Active Donations"   value={summary.activeDonations}    icon="🥗" color="#2ea043" />
        <MetricCard label="Active Requests"    value={summary.activeRequests}     icon="📋" color="#388bfd" />
        <MetricCard label="Emergency Requests" value={summary.emergencyRequests}  icon="🚨" color="#da3633" />
        <MetricCard label="Matches Today"      value={summary.totalMatchesToday}  icon="🤝" color="#8b5cf6" />
        <MetricCard label="Meals Allocated"    value={summary.totalMealsAllocated} icon="🍽️" color="#d29922" sub="all time" />
        <MetricCard label="Total Matches"      value={summary.totalMatches}       icon="📊" color="#8b949e" />
      </div>
      {Object.keys(foodTypeDistribution).length>0&&(
        <Card style={{ marginBottom:16 }}>
          <div style={{ fontWeight:600, marginBottom:10 }}>Food Type Distribution</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {Object.entries(foodTypeDistribution).map(([t,c])=><Pill key={t} text={`${t}: ${c}`} color="#388bfd" />)}
          </div>
        </Card>
      )}
      {dailyData?.length>0&&(
        <Card>
          <div style={{ fontWeight:600, marginBottom:12 }}>Last 30 Days Activity</div>
          <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:60 }}>
            {dailyData.slice(-30).map(d=>{
              const maxM=Math.max(...dailyData.map(x=>x.meals),1);
              const h=Math.max((d.meals/maxM)*52,2);
              return <div key={d.date} title={`${d.date}: ${d.meals} meals`} style={{ flex:1, minWidth:8, height:h, background:"#2ea043", borderRadius:"2px 2px 0 0", opacity:0.8, cursor:"pointer" }} />;
            })}
          </div>
          <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>{dailyData[0]?.date} → {dailyData[dailyData.length-1]?.date}</div>
        </Card>
      )}
    </div>
  );
}

// ── Admin: generic list views ─────────────────────────────────────────────────
function AdminDonations() {
  const { toast }=useCtx();
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState("all");
  useEffect(()=>{ api.adminDonations().then(setItems).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false)); },[]);
  const now=Date.now();
  const filtered=filter==="all"?items:filter==="active"?items.filter(l=>l.expiryTime>now&&(l.status==="available"||l.status==="partial")):filter==="expired"?items.filter(l=>l.expiryTime<=now):items.filter(l=>l.status===filter);
  if (loading) return <Spinner />;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <h2 style={{ fontSize:20, fontWeight:600 }}>All Donations</h2>
        <select value={filter} onChange={e=>setFilter(e.target.value)} style={{ width:"auto" }}>
          <option value="all">All</option><option value="active">Active</option>
          <option value="available">Available</option><option value="partial">Partial</option>
          <option value="matched">Matched</option><option value="expired">Expired</option>
        </select>
      </div>
      {filtered.length===0?<EmptyState icon="🥗" title="No donations found" />:
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(l=>(
            <Card key={l._id}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ display:"flex", gap:8, marginBottom:4 }}><span style={{ fontWeight:500 }}>{l.description}</span><StatusPill status={l.expiryTime<now?"expired":l.status} /></div>
                  <div style={{ fontSize:12, color:"var(--text-secondary)", display:"flex", gap:12, flexWrap:"wrap" }}>
                    <span>👤 {l.donorName}</span>
                    <span>🍽️ {l.remainingMeals}/{l.totalMeals} meals</span>
                    <span style={{ color:expiryColor(l.expiryTime) }}>⏱ {timeLeft(l.expiryTime)}</span>
                    <span>📍 {l.location?.address||"–"}</span>
                  </div>
                </div>
                <div style={{ fontSize:11, color:"var(--text-muted)" }}>{fmtDate(l.createdAt)}</div>
              </div>
            </Card>
          ))}
        </div>
      }
    </div>
  );
}

function AdminRequests() {
  const { toast }=useCtx();
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ api.adminRequests().then(setItems).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false)); },[]);
  if (loading) return <Spinner />;
  const emergency=items.filter(r=>r.urgencyLevel==="less_than_1h"||r.urgencyLevel==="1_2h");
  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:600, marginBottom:16 }}>All Requests</h2>
      {emergency.length>0&&<div style={{ background:"#4a151520", border:"1px solid var(--red)", borderRadius:"var(--radius)", padding:"10px 14px", marginBottom:16 }}><span style={{ color:"#f85149", fontWeight:600 }}>🚨 {emergency.length} Emergency Request(s) Active</span></div>}
      {items.length===0?<EmptyState icon="📋" title="No requests found" />:
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {items.map(r=>(
            <Card key={r._id} style={{ borderColor:(r.urgencyLevel==="less_than_1h"||r.urgencyLevel==="1_2h")?"#da363360":undefined }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ display:"flex", gap:8, marginBottom:4, flexWrap:"wrap" }}><StatusPill status={r.status}/><UrgencyPill level={r.urgencyLevel}/></div>
                  <div style={{ fontSize:12, color:"var(--text-secondary)", display:"flex", gap:12, flexWrap:"wrap" }}>
                    <span>👤 {r.receiverName}</span>
                    <span>🍽️ {r.remainingMealsNeeded??r.requiredMeals}/{r.requiredMeals} meals</span>
                    <span>📍 {r.location?.address||"–"}</span>
                  </div>
                </div>
                <div style={{ fontSize:11, color:"var(--text-muted)" }}>{fmtDate(r.createdAt)}</div>
              </div>
            </Card>
          ))}
        </div>
      }
    </div>
  );
}

function AdminMatches() {
  const { toast }=useCtx();
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ api.adminMatches().then(setItems).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false)); },[]);
  if (loading) return <Spinner />;
  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:600, marginBottom:16 }}>All Matches</h2>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
        <Pill text={`${items.length} Total`} color="#8b949e"/>
        <Pill text={`${items.filter(m=>m.covered).length} Fully Covered`} color="#2ea043"/>
        <Pill text={`${items.filter(m=>m.autoMatched).length} Auto-Matched`} color="#8b5cf6"/>
      </div>
      {items.length===0?<EmptyState icon="🤝" title="No matches yet" />:
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {items.map(m=>(
            <Card key={m._id}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ display:"flex", gap:8, marginBottom:4 }}><StatusPill status={m.status}/>{m.autoMatched&&<Pill text="Auto" color="#8b5cf6"/>}{m.covered?<Pill text="✅ Covered" color="#2ea043"/>:<Pill text="⚠ Partial" color="#d29922"/>}</div>
                  <div style={{ fontSize:12, color:"var(--text-secondary)", display:"flex", gap:12, flexWrap:"wrap" }}>
                    <span>🍽️ {m.totalAllocated} meals</span>
                    <span>👥 {m.allocations?.length} donor(s)</span>
                    {m.remaining>0&&<span style={{ color:"#d29922" }}>shortfall: {m.remaining}</span>}
                  </div>
                </div>
                <div style={{ fontSize:11, color:"var(--text-muted)" }}>{fmtDate(m.timestamp)}</div>
              </div>
            </Card>
          ))}
        </div>
      }
    </div>
  );
}

function AdminUsers() {
  const { toast }=useCtx();
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ api.adminUsers().then(setUsers).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false)); },[]);
  if (loading) return <Spinner />;
  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:600, marginBottom:16 }}>Users</h2>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
        <MetricCard label="Donors"    value={users.filter(u=>u.role==="donor").length}    icon="🥗" color="#2ea043"/>
        <MetricCard label="Receivers" value={users.filter(u=>u.role==="receiver").length} icon="🙏" color="#388bfd"/>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {users.map(u=>(
          <Card key={u._id}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <span style={{ fontWeight:500 }}>{u.name}</span>
                {u.type&&<span style={{ fontSize:12, color:"var(--text-muted)", marginLeft:8 }}>({u.type})</span>}
                <div style={{ display:"flex", gap:6, marginTop:4 }}>
                  <Pill text={u.role} color={u.role==="donor"?"#2ea043":u.role==="admin"?"#8b5cf6":"#388bfd"}/>
                  {u.district&&<Pill text={u.district} color="#8b949e"/>}
                </div>
              </div>
              <div style={{ fontSize:12, color:"var(--text-secondary)", textAlign:"right" }}>
                <div>{u.email}</div>{u.phone&&<div>{u.phone}</div>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────
function NotificationsPage() {
  const { toast }=useCtx();
  const [notifs,setNotifs]=useState([]);
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{ try{setNotifs(await api.getNotifications());}catch(e){toast(e.message,"error");}finally{setLoading(false);} },[]);
  useEffect(()=>{ load(); },[]);
  const markAll=async()=>{ try{await api.markAllRead();load();}catch(e){toast(e.message,"error");} };
  if (loading) return <Spinner />;
  const unread=notifs.filter(n=>!n.read);
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ fontSize:20, fontWeight:600 }}>Notifications {unread.length>0&&<Pill text={unread.length} color="#da3633"/>}</h2>
        {unread.length>0&&<Btn variant="ghost" size="sm" onClick={markAll}>Mark all read</Btn>}
      </div>
      {notifs.length===0
        ? <EmptyState icon="🔔" title="No notifications" sub="Match updates and alerts appear here." />
        : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {notifs.map(n=>(
              <Card key={n._id} style={{ borderColor:!n.read?"#2ea04340":undefined, opacity:n.read?0.7:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:n.read?"var(--text-secondary)":"var(--text-primary)", marginBottom:4 }}>
                      {!n.read&&<span style={{ color:"#2ea043" }}>● </span>}{n.message}
                    </div>
                    {n.data?.donorName&&<div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:4 }}>Donor: {n.data.donorName}{n.data.donorPhone&&` · 📞 ${n.data.donorPhone}`}{n.data.km&&` · 📏 ${n.data.km}km`}</div>}
                    {n.data?.receiverName&&<div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:4 }}>Receiver: {n.data.receiverName}{n.data.receiverPhone&&` · 📞 ${n.data.receiverPhone}`}</div>}
                  </div>
                  <div style={{ fontSize:11, color:"var(--text-muted)", marginLeft:12, flexShrink:0 }}>{fmtDate(n.createdAt)}</div>
                </div>
              </Card>
            ))}
          </div>
      }
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user,    setUser]    = useState(null);
  const [page,    setPage]    = useState("dashboard");
  const [toasts,  setToasts]  = useState([]);
  const [notifs,  setNotifs]  = useState([]);
  const socketRef = useRef(null);

  // Restore session on boot
  useEffect(()=>{
    const token=localStorage.getItem("zhc_token");
    if (token) api.me().then(setUser).catch(()=>localStorage.removeItem("zhc_token"));
  },[]);

  // Socket.IO for real-time notifications
  useEffect(()=>{
    if (!user) return;
    const token=localStorage.getItem("zhc_token");
    const socket=io(window.location.origin,{auth:{token}});
    socketRef.current=socket;
    socket.on("match_confirmed",data=>{
      toast(`🤝 New match! ${data.allocated} meals allocated`,"success");
      api.getNotifications().then(setNotifs).catch(()=>{});
    });
    return ()=>socket.disconnect();
  },[user]);

  // Poll notifications every 15s
  useEffect(()=>{
    if (!user) return;
    api.getNotifications().then(setNotifs).catch(()=>{});
    const t=setInterval(()=>api.getNotifications().then(setNotifs).catch(()=>{}),15000);
    return ()=>clearInterval(t);
  },[user]);

  const toast=useCallback((msg,type="info")=>{
    const id=Date.now();
    setToasts(ts=>[...ts,{id,msg,type}]);
    setTimeout(()=>setToasts(ts=>ts.filter(t=>t.id!==id)),4500);
  },[]);

  const onAuth  = useCallback(u=>{setUser(u);setPage("dashboard");},[]);
  const onLogout= useCallback(()=>{ localStorage.removeItem("zhc_token"); setUser(null); setPage("dashboard"); },[]);

  if (!user) return <AuthPage onAuth={onAuth} />;

  const unreadCount=notifs.filter(n=>!n.read).length;

  const renderPage=()=>{
    switch(page){
      case "dashboard":     return user.role==="admin"?<AdminDashboard/>:user.role==="donor"?<DonorDashboard/>:<ReceiverDashboard/>;
      case "add-food":      return <AddFoodForm/>;
      case "new-request":   return <NewRequestForm/>;
      case "browse":        return <BrowseFood/>;
      case "matches":       return user.role==="donor"?<DonorMatches/>:user.role==="receiver"?<ReceiverMatches/>:<AdminMatches/>;
      case "donations":     return <AdminDonations/>;
      case "requests":      return <AdminRequests/>;
      case "users":         return <AdminUsers/>;
      case "notifications": return <NotificationsPage/>;
      default:              return <div style={{ color:"var(--text-muted)", padding:40 }}>Page not found</div>;
    }
  };

  return (
    <Ctx.Provider value={{ user, toast, setPage }}>
      <div style={{ display:"flex", minHeight:"100vh" }}>
        <Sidebar user={user} page={page} setPage={setPage} onLogout={onLogout} unreadCount={unreadCount}/>
        <main style={{ flex:1, padding:"24px 28px", overflow:"auto" }}>
          <div className="fade-in" key={page}>{renderPage()}</div>
        </main>
      </div>
      <Toast toasts={toasts}/>
    </Ctx.Provider>
  );
}
