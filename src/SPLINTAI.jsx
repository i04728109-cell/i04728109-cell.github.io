import { useState, useRef, useCallback, useEffect } from "react";

const PROXY_URL = "https://splintai-api.vercel.app/api/chat";
const TEXT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const now = new Date();
const dateStr = now.toLocaleDateString("ru-RU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

const SYSTEM_PROMPT = `You are SPLINT.AI — a precise academic problem solver and tutor.

Today is ${dateStr}, time: ${timeStr}. You are fully aware of events and knowledge up to 2026. When asked about the current date, time, day, or year — answer using this information.

You use the latest 2026 methods and approaches in math, physics, chemistry and other subjects.

RULE 1 — LANGUAGE: Always respond in the EXACT same language the user writes in. Russian → Russian. Uzbek → Uzbek. English → English.
RULE 2 — NO MARKDOWN, NO LATEX: Never use ##, ###, **, *, |, ---, $, $$, backslash commands, backticks. Plain text only.
RULE 3 — MATH (plain text only): Fractions: (a+b)/(c+d). Powers: x^2. Roots: √x. Multiply: ·. Pi: π
RULE 4 — PROBLEM TYPES:
TYPE A PHYSICS: Дано/Решение/Ответ format
TYPE B ALGEBRA: Метод + steps + Ответ
TYPE C WORD: Пусть + steps + Ответ
TYPE D CHEMISTRY: reaction + molar + Ответ
TYPE E GENERAL: 2-3 sentences + Ответ
RULE 5 — NO long explanations. RULE 6 — Each step on own line. RULE 7 — IMAGES: solve correctly.`;

function cleanText(t) {
  return t
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => m.trim())
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^}]+)\}/g, "√$1").replace(/\\sqrt/g, "√")
    .replace(/\\cdot/g, "·").replace(/\\times/g, "×")
    .replace(/\\infty/g, "∞").replace(/\\leq/g, "≤").replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠").replace(/\\approx/g, "≈").replace(/\\pm/g, "±")
    .replace(/\\text\{([^}]+)\}/g, "$1").replace(/\\pi/g, "π")
    .replace(/\\alpha/g, "α").replace(/\\beta/g, "β").replace(/\\theta/g, "θ")
    .replace(/\\left[\(\[\{]/g, "(").replace(/\\right[\)\]\}]/g, ")")
    .replace(/\\left/g, "").replace(/\\right/g, "").replace(/\\[a-zA-Z]+/g, "")
    .replace(/^#{1,6}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^\|(.+)\|$/gm, (_, m) => m.split("|").map(s => s.trim()).filter(Boolean).join(" — "))
    .replace(/^\|?\s*[-:]+\s*\|.*/gm, "").replace(/^---+$/gm, "")
    .replace(/```[\s\S]*?```/g, "").replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n").trim();
}

function fmt(t) {
  const s = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return t.replace(/\^(\d)/g, (_, n) => s[n] || `^${n}`);
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function chatTitle(msgs) {
  const f = msgs.find(m => m.role === "user" && m.text);
  if (!f) return "Новый чат";
  return f.text.length > 36 ? f.text.slice(0, 36) + "…" : f.text;
}
function loadChats() {
  try { const r = localStorage.getItem("sp_chats"); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveChats(c) { try { localStorage.setItem("sp_chats", JSON.stringify(c)); } catch {} }

function Logo({ size = 26 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#0a0a0f", border: "2px solid #e11d48", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ fontFamily: "Arial Black,sans-serif", fontWeight: 900, fontSize: Math.round(size * .38), color: "white", letterSpacing: -.5, lineHeight: 1, userSelect: "none" }}>SP</span>
    </div>
  );
}

function MessageText({ text, dark }) {
  const lines = text.split("\n").reduce((a, l) => {
    if (l.trim() === "" && a[a.length - 1]?.trim() === "") return a;
    return [...a, l];
  }, []);
  const b2 = dark ? "#2a2a3e" : "#e0e0ea";
  return (
    <div style={{ fontSize: "0.93rem", lineHeight: 1.85, wordBreak: "break-word" }}>
      {lines.map((line, i) => {
        const t = fmt(line.trim());
        if (!t) return <div key={i} style={{ height: "0.4rem" }} />;
        const isAns = /^(Ответ|Answer|Javob)\s*:/i.test(t);
        const isDano = /^(Дано|Given|Berilgan)\s*:?$/i.test(t);
        const isResh = /^(Решение|Solution|Yechim)\s*:?$/i.test(t);
        const isMetod = /^(Метод|Method|Usul)\s*:/i.test(t);
        const isPust = /^(Пусть|Let|Faraz)\s/i.test(t);
        const isStep = /^(Шаг|Step)\s*\d/i.test(t);
        if (isAns) { const ci = t.indexOf(":"); return <div key={i} style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "rgba(225,29,72,0.08)", border: "1px solid rgba(225,29,72,0.3)", borderRadius: 10, display: "flex", gap: 8, flexWrap: "wrap" }}><span style={{ color: "#e11d48", fontWeight: 700 }}>{t.slice(0, ci + 1)}</span><span style={{ color: dark ? "#f0f0ff" : "#12121e", fontWeight: 600 }}>{t.slice(ci + 1).trim()}</span></div>; }
        if (isDano) return <div key={i} style={{ marginBottom: "0.25rem", padding: "0.5rem 0.9rem", background: dark ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.06)", border: `1px solid ${dark ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.2)"}`, borderRadius: "10px 10px 0 0", fontWeight: 700, color: dark ? "#a5b4fc" : "#4f46e5" }}>{t}</div>;
        if (isResh) return <div key={i} style={{ marginTop: "0.75rem", fontWeight: 700, color: dark ? "#e8e6f8" : "#12121e", paddingBottom: "0.3rem", borderBottom: `2px solid ${b2}` }}>{t}</div>;
        if (isMetod) return <div key={i} style={{ marginTop: "0.4rem", fontSize: "0.82rem", fontStyle: "italic", color: dark ? "#7070a0" : "#8080a0", padding: "0.25rem 0.7rem", background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", borderRadius: 6, borderLeft: "2px solid #e11d48" }}>{t}</div>;
        if (isPust) return <div key={i} style={{ fontStyle: "italic", color: dark ? "#9090c0" : "#5050a0" }}>{t}</div>;
        if (isStep) return <div key={i} style={{ fontWeight: 700, color: dark ? "#c8c8f8" : "#12121e", marginTop: "0.75rem", paddingBottom: "0.2rem", borderBottom: `1px solid ${b2}` }}>{t}</div>;
        return <div key={i} style={{ color: dark ? "#c8c8e0" : "#2a2a3a" }}>{t}</div>;
      })}
    </div>
  );
}

export default function SPLINTAI() {
  const [dark, setDark] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true); // ALWAYS open by default
  const [chats, setChats] = useState(() => loadChats());
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [imgB64, setImgB64] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [delConfirm, setDelConfirm] = useState(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const taRef = useRef(null);

  const d = dark;
  const bg      = d ? "#08080f" : "#f4f4f8";
  const surf    = d ? "#111118" : "#ffffff";
  const bord    = d ? "#1e1e2e" : "#e2e2ea";
  const txtPri  = d ? "#e8e6f8" : "#12121e";
  const txtMut  = d ? "#5a5a7a" : "#9090a8";
  const inpBg   = d ? "#0d0d18" : "#ffffff";
  const uBub    = d ? "#1a1030" : "#f0effe";
  const uBubB   = d ? "#3a2060" : "#d8d0fa";
  const sideBg  = d ? "#0c0c14" : "#f0f0f8";
  const sideB   = d ? "#1a1a2c" : "#dcdcec";

  const activeMsgs = activeId ? (chats.find(c => c.id === activeId)?.messages || []) : [];

  useEffect(() => { saveChats(chats); }, [chats]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeMsgs, loading]);

  const newChat = useCallback(() => {
    const id = uid();
    setChats(p => [{ id, messages: [], createdAt: Date.now() }, ...p]);
    setActiveId(id);
    setInput("");
    clearImg();
  }, []);

  const clearImg = () => {
    setImgB64(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const loadImg = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = e => { const full = e.target.result; setImgB64(full.split(",")[1]); setPreview(full); };
    r.readAsDataURL(file);
  }, []);

  const send = async () => {
    if (!imgB64 && !input.trim()) return;
    if (loading) return;
    let chatId = activeId;
    if (!chatId) {
      chatId = uid();
      setChats(p => [{ id: chatId, messages: [], createdAt: Date.now() }, ...p]);
      setActiveId(chatId);
    }
    const uText = input.trim(), uPrev = preview, uB64 = imgB64;
    const uMsg = { role: "user", text: uText, image: uPrev };
    setChats(p => p.map(c => c.id === chatId ? { ...c, messages: [...c.messages, uMsg] } : c));
    setInput(""); clearImg();
    if (taRef.current) taRef.current.style.height = "40px";
    setLoading(true);
    const hist = [...(chats.find(c => c.id === chatId)?.messages || []), uMsg].slice(-10);
    const apiMsgs = [
      { role: "system", content: SYSTEM_PROMPT },
      ...hist.map(m => {
        if (m.role === "user") {
          if (m.image) return { role: "user", content: [{ type: "image_url", image_url: { url: m.image } }, { type: "text", text: m.text || "Реши задачу с этого изображения." }] };
          return { role: "user", content: m.text };
        }
        return { role: "assistant", content: m.text };
      }),
    ];
    try {
      const res = await fetch(PROXY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: uB64 ? VISION_MODEL : TEXT_MODEL, messages: apiMsgs, max_tokens: 1200, temperature: 0.2 }) });
      const data = await res.json();
      setLoading(false);
      const txt = data.choices?.[0]?.message?.content;
      setChats(p => p.map(c => c.id !== chatId ? c : { ...c, messages: [...c.messages, txt ? { role: "assistant", text: cleanText(txt) } : { role: "assistant", text: "Не удалось получить ответ.", error: true }] }));
    } catch {
      setLoading(false);
      setChats(p => p.map(c => c.id !== chatId ? c : { ...c, messages: [...c.messages, { role: "assistant", text: "Ошибка подключения.", error: true }] }));
    }
  };

  const groupedChats = chats.reduce((a, c) => {
    const cd = new Date(c.createdAt), td = new Date(), yd = new Date(td);
    yd.setDate(td.getDate() - 1);
    const g = cd.toDateString() === td.toDateString() ? "Сегодня"
      : cd.toDateString() === yd.toDateString() ? "Вчера"
      : cd.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    if (!a[g]) a[g] = [];
    a[g].push(c);
    return a;
  }, {});

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@300;400;500&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{height:100%;overflow:hidden}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${bord};border-radius:4px}
        textarea{font-family:'Inter',sans-serif}
        textarea::placeholder{color:${txtMut}}
        .hbtn:hover{opacity:.7!important}
        .send-btn:hover:not(:disabled){background:#be123c!important}
        .chat-row:hover{background:${d ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.04)"}!important}
        .del-btn:hover{color:#e11d48!important;opacity:1!important}
        .ncbtn:hover{border-color:#e11d48!important;color:#e11d48!important}
      `}</style>

      {/* ROOT: full viewport, flex row */}
      <div style={{ display: "flex", width: "100vw", height: "100vh", background: bg, color: txtPri, fontFamily: "'Inter',sans-serif", position: "relative", overflow: "hidden" }}>

        {/* ══════════ SIDEBAR ══════════ */}
        <div style={{
          width: sidebarOpen ? 256 : 0,
          minWidth: sidebarOpen ? 256 : 0,
          maxWidth: sidebarOpen ? 256 : 0,
          overflow: "hidden",
          transition: "width 0.25s ease, min-width 0.25s ease",
          background: sideBg,
          borderRight: sidebarOpen ? `1px solid ${sideB}` : "none",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          flexShrink: 0,
        }}>
          {/* Sidebar header */}
          <div style={{ padding: "0.9rem 1rem 0.75rem", borderBottom: `1px solid ${sideB}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0, whiteSpace: "nowrap" }}>
            <Logo size={28} />
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "1rem", letterSpacing: "-.02em" }}>
              SPLINT<span style={{ color: "#e11d48" }}>.</span>AI
            </span>
          </div>

          {/* New chat button */}
          <div style={{ padding: "0.75rem 0.75rem 0.4rem", flexShrink: 0 }}>
            <button className="ncbtn" onClick={newChat} style={{ width: "100%", background: "transparent", border: `1px dashed ${d ? "#2a2a3e" : "#c8c8e0"}`, borderRadius: 10, padding: "0.55rem 1rem", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: txtMut, fontSize: "0.84rem", fontFamily: "'Inter',sans-serif", transition: "all .2s", whiteSpace: "nowrap" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Новый чат
            </button>
          </div>

          {/* Chat list */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 0.5rem 1rem" }}>
            {chats.length === 0 && (
              <div style={{ textAlign: "center", color: txtMut, fontSize: "0.78rem", marginTop: "2rem", padding: "0 1rem", lineHeight: 1.6, whiteSpace: "normal" }}>
                Нет чатов.<br />Начни разговор!
              </div>
            )}
            {Object.entries(groupedChats).map(([grp, list]) => (
              <div key={grp}>
                <div style={{ fontSize: "0.67rem", color: txtMut, fontWeight: 600, letterSpacing: "0.06em", padding: "0.75rem 0.6rem 0.25rem", textTransform: "uppercase", whiteSpace: "nowrap" }}>{grp}</div>
                {list.map(chat => (
                  <div
                    key={chat.id}
                    className="chat-row"
                    onClick={() => setActiveId(chat.id)}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "0.5rem 0.65rem", borderRadius: 9, cursor: "pointer", transition: "background .15s", borderLeft: chat.id === activeId ? "2px solid #e11d48" : "2px solid transparent", marginBottom: 2, background: chat.id === activeId ? (d ? "rgba(225,29,72,0.1)" : "rgba(225,29,72,0.07)") : "transparent" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={txtMut} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: .5 }}>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span style={{ fontSize: "0.81rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: chat.id === activeId ? txtPri : txtMut }}>
                      {chatTitle(chat.messages)}
                    </span>
                    <button
                      className="del-btn"
                      onClick={e => { e.stopPropagation(); setDelConfirm(chat.id); }}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: txtMut, opacity: .3, flexShrink: 0, display: "flex", alignItems: "center", padding: 2, borderRadius: 4, transition: "all .15s" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Sidebar footer */}
          <div style={{ borderTop: `1px solid ${sideB}`, padding: "0.6rem 1rem", flexShrink: 0, display: "flex", justifyContent: "center" }}>
            <span style={{ fontSize: "0.64rem", color: "#e11d48", fontWeight: 600, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>by ismail</span>
          </div>
        </div>

        {/* ══════════ MAIN ══════════ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Header */}
          <div style={{ background: surf, borderBottom: `1px solid ${bord}`, padding: "0.75rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Toggle sidebar button */}
              <button
                className="hbtn"
                onClick={() => setSidebarOpen(v => !v)}
                style={{ background: "transparent", border: `1px solid ${bord}`, borderRadius: 9, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: txtMut, transition: "opacity .2s", flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="9" y1="3" x2="9" y2="21"/>
                </svg>
              </button>
              <Logo size={28}/>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-.02em" }}>
                SPLINT<span style={{ color: "#e11d48" }}>.</span>AI
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="hbtn"
                onClick={newChat}
                style={{ background: "transparent", border: `1px solid ${bord}`, borderRadius: 8, padding: "0.35rem 0.75rem", fontSize: "0.75rem", color: txtMut, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: 5, transition: "opacity .2s" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Новый чат
              </button>
              <button
                className="hbtn"
                onClick={() => setDark(!d)}
                style={{ background: "transparent", border: `1px solid ${bord}`, borderRadius: 9, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: txtMut, transition: "opacity .2s" }}
              >
                {d
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                }
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1rem" }}>
            <div style={{ maxWidth: 680, margin: "0 auto" }}>
              {activeMsgs.length === 0 && (
                <div style={{ textAlign: "center", padding: "3rem 0 2rem", animation: "fadeUp .5s ease" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}><Logo size={72}/></div>
                  <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "clamp(2rem,8vw,3.5rem)", letterSpacing: "-.03em", marginBottom: "0.5rem" }}>
                    SPLINT<span style={{ color: "#e11d48" }}>.</span>AI
                  </h1>
                  <p style={{ color: txtMut, fontSize: "0.88rem", lineHeight: 1.6 }}>
                    Задай любой вопрос или скинь фото задачи<br/>Любой предмет · Любой язык
                  </p>
                </div>
              )}

              {activeMsgs.map((msg, i) => (
                <div key={i} style={{ marginBottom: "1.25rem", animation: "fadeUp .3s ease", display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "user" ? (
                    <div style={{ maxWidth: "80%", background: uBub, border: `1px solid ${uBubB}`, borderRadius: "18px 18px 4px 18px", padding: "0.75rem 1rem" }}>
                      {msg.image && <img src={msg.image} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 10, marginBottom: msg.text ? "0.6rem" : 0, display: "block" }}/>}
                      {msg.text && <div style={{ fontSize: "0.92rem", lineHeight: 1.6, color: txtPri }}>{msg.text}</div>}
                    </div>
                  ) : (
                    <div style={{ maxWidth: "92%", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ flexShrink: 0, marginTop: 2 }}><Logo size={26}/></div>
                      <div style={{ background: surf, border: `1px solid ${bord}`, borderRadius: "4px 18px 18px 18px", padding: "0.9rem 1.1rem", color: msg.error ? "#f87171" : txtPri, flex: 1 }}>
                        {msg.error ? <div style={{ fontSize: "0.9rem" }}>{msg.text}</div> : <MessageText text={msg.text} dark={d}/>}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: "1.25rem" }}>
                  <div style={{ flexShrink: 0, marginTop: 2 }}><Logo size={26}/></div>
                  <div style={{ background: surf, border: `1px solid ${bord}`, borderRadius: "4px 18px 18px 18px", padding: "0.85rem 1.25rem", display: "flex", gap: 5, alignItems: "center" }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#e11d48", animation: `pulse 1.2s ease ${i*.2}s infinite` }}/>)}
                  </div>
                </div>
              )}
              <div ref={bottomRef}/>
            </div>
          </div>

          {/* Input */}
          <div
            style={{ background: surf, borderTop: `1px solid ${bord}`, padding: "0.85rem 1rem 1rem", flexShrink: 0 }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); loadImg(e.dataTransfer.files[0]); }}
          >
            <div style={{ maxWidth: 680, margin: "0 auto" }}>
              {preview && (
                <div style={{ marginBottom: "0.6rem", display: "inline-flex", position: "relative" }}>
                  <img src={preview} alt="" style={{ height: 64, width: "auto", borderRadius: 10, border: `1px solid ${bord}`, display: "block" }}/>
                  <button onClick={clearImg} style={{ position: "absolute", top: -6, right: -6, background: d ? "rgba(0,0,0,.8)" : "rgba(255,255,255,.9)", border: `1px solid ${bord}`, borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: txtMut, fontSize: 10 }}>✕</button>
                </div>
              )}
              {dragging && <div style={{ border: "2px dashed #e11d48", borderRadius: 12, padding: "0.75rem", textAlign: "center", fontSize: "0.8rem", color: "#e11d48", marginBottom: "0.6rem" }}>Отпусти фото сюда</div>}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <button className="hbtn" onClick={() => fileRef.current?.click()} style={{ background: "transparent", border: `1px solid ${bord}`, borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={txtMut} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => loadImg(e.target.files[0])}/>
                <textarea
                  ref={taRef}
                  style={{ flex: 1, background: inpBg, border: `1px solid ${dragging ? "#e11d48" : bord}`, borderRadius: 12, color: txtPri, fontSize: "0.92rem", padding: "0.65rem 0.9rem", resize: "none", outline: "none", lineHeight: 1.6, height: 40, minHeight: 40, maxHeight: 140, overflow: "hidden" }}
                  placeholder="Напиши вопрос или задачу..."
                  value={input}
                  onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                />
                <button
                  className="send-btn"
                  onClick={send}
                  disabled={loading || (!input.trim() && !imgB64)}
                  style={{ background: (loading || (!input.trim() && !imgB64)) ? (d ? "#1a1a28" : "#e8e8f0") : "#e11d48", border: "none", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: (loading || (!input.trim() && !imgB64)) ? "not-allowed" : "pointer", flexShrink: 0, transition: "all .2s", color: (loading || (!input.trim() && !imgB64)) ? txtMut : "white" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
              <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
                <div style={{ fontSize: "0.67rem", color: txtMut }}>Enter для отправки · Shift+Enter для новой строки</div>
                <div style={{ fontSize: "0.64rem", color: "#e11d48", fontWeight: 600, letterSpacing: "0.08em", marginTop: "0.2rem" }}>by ismail</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete modal */}
      {delConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: surf, border: `1px solid ${bord}`, borderRadius: 16, padding: "1.5rem", maxWidth: 300, width: "90%", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>🗑️</div>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem", color: txtPri }}>Удалить чат?</div>
            <div style={{ fontSize: "0.82rem", color: txtMut, marginBottom: "1.25rem" }}>Это нельзя отменить</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDelConfirm(null)} style={{ flex: 1, background: "transparent", border: `1px solid ${bord}`, borderRadius: 10, padding: "0.6rem", cursor: "pointer", color: txtMut, fontFamily: "'Inter',sans-serif", fontSize: "0.85rem" }}>Отмена</button>
              <button onClick={() => { setChats(p => p.filter(c => c.id !== delConfirm)); if (activeId === delConfirm) setActiveId(null); setDelConfirm(null); }} style={{ flex: 1, background: "#e11d48", border: "none", borderRadius: 10, padding: "0.6rem", cursor: "pointer", color: "white", fontFamily: "'Inter',sans-serif", fontSize: "0.85rem", fontWeight: 600 }}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}