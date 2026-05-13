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

RULE 3 — MATH (plain text only):
  - Fractions: (a+b)/(c+d) or 16/9
  - Powers: x^2, 5^3
  - Square roots: √x
  - Multiplication: · symbol
  - Pi: π

RULE 4 — CHOOSE PROBLEM TYPE:

TYPE A — PHYSICS & GEOMETRY:
Дано:
[variable] = [value] [unit]

Решение:
[formula]
[substitution]
[calculation]

Ответ: [value with units]

TYPE B — ALGEBRA & EQUATIONS:
Choose best method automatically and name it.

Метод: [factoring / quadratic formula / substitution / elimination / log rules / etc]

Решение:
[step 1]
[step 2]
[...]

Ответ: x = [value]

TYPE C — WORD PROBLEMS:
Пусть [variable] = [meaning]

Решение:
[equation setup]
[steps]

Ответ: [result]

TYPE D — CHEMISTRY:
Дано:
[substances and values]

Решение:
[reaction]
[molar steps]

Ответ: [result with units]

TYPE E — GENERAL / HISTORY / OTHER:
Short clear answer in 2-3 sentences.
Ответ: [one-line summary]

RULE 5 — NO long explanations. Formulas and numbers only.
RULE 6 — Each step on its OWN line.
RULE 7 — IMAGES: detect problem type and solve with correct format.`;

function cleanText(text) {
  return text
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => m.trim())
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^}]+)\}/g, "√$1")
    .replace(/\\sqrt/g, "√")
    .replace(/\\cbrt\{([^}]+)\}/g, "∛$1")
    .replace(/\\cdot/g, "·").replace(/\\times/g, "×").replace(/\\div/g, "÷")
    .replace(/\\infty/g, "∞").replace(/\\leq/g, "≤").replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠").replace(/\\approx/g, "≈").replace(/\\pm/g, "±")
    .replace(/\\text\{([^}]+)\}/g, "$1")
    .replace(/\\quad/g, " ").replace(/\\lor/g, "или").replace(/\\land/g, "и")
    .replace(/\\in\b/g, "∈").replace(/\\cup/g, "∪").replace(/\\cap/g, "∩")
    .replace(/\\left[\(\[\{]/g, "(").replace(/\\right[\)\]\}]/g, ")")
    .replace(/\\left/g, "").replace(/\\right/g, "")
    .replace(/\\pi/g, "π").replace(/\\alpha/g, "α").replace(/\\beta/g, "β")
    .replace(/\\theta/g, "θ").replace(/\\delta/g, "δ").replace(/\\lambda/g, "λ")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/^\|(.+)\|$/gm, (_, m) => m.split("|").map(s => s.trim()).filter(Boolean).join(" — "))
    .replace(/^\|?\s*[-:]+\s*\|.*/gm, "")
    .replace(/^---+$/gm, "").replace(/^===+$/gm, "")
    .replace(/```[\s\S]*?```/g, "").replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatMath(text) {
  const sup = {"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹"};
  return text
    .replace(/sqrt\(([^)]+)\)/g, "√$1")
    .replace(/cbrt\(([^)]+)\)/g, "∛$1")
    .replace(/\^(\d)/g, (_, n) => sup[n] || `^${n}`);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getChatTitle(messages) {
  const first = messages.find(m => m.role === "user" && m.text);
  if (!first) return "Новый чат";
  return first.text.length > 40 ? first.text.slice(0, 40) + "…" : first.text;
}

function loadChats() {
  try {
    const raw = localStorage.getItem("splintai_chats");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChats(chats) {
  try { localStorage.setItem("splintai_chats", JSON.stringify(chats)); } catch {}
}

function Logo({ size = 26 }) {
  const fontSize = Math.round(size * 0.38);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "#0a0a0f", border: "2px solid #e11d48",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "Arial Black, sans-serif", fontWeight: 900,
        fontSize, color: "white", letterSpacing: -0.5,
        lineHeight: 1, userSelect: "none",
      }}>SP</span>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

function ImageIcon({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function MessageText({ text, dark }) {
  const lines = text.split("\n").reduce((acc, line) => {
    if (line.trim() === "" && acc[acc.length - 1]?.trim() === "") return acc;
    return [...acc, line];
  }, []);

  const border2 = dark ? "#2a2a3e" : "#e0e0ea";

  return (
    <div style={{ fontSize: "0.93rem", lineHeight: 1.85, wordBreak: "break-word" }}>
      {lines.map((line, i) => {
        const trimmed = formatMath(line.trim());
        if (!trimmed) return <div key={i} style={{ height: "0.4rem" }} />;

        const isAnswer  = /^(Ответ|Answer|Javob|Natija)\s*:/i.test(trimmed);
        const isDano    = /^(Дано|Given|Berilgan)\s*:?$/i.test(trimmed);
        const isResh    = /^(Решение|Solution|Yechim)\s*:?$/i.test(trimmed);
        const isMetod   = /^(Метод|Method|Usul)\s*:/i.test(trimmed);
        const isPust    = /^(Пусть|Let|Faraz)\s/i.test(trimmed);
        const isStep    = /^(Шаг|Step|Qadam)\s*\d/i.test(trimmed);
        const isDashRow = /^.+\s[—–-]\s.+$/.test(trimmed) && !isStep && !isAnswer && !isDano && !isResh && !isMetod;

        if (isAnswer) {
          const colonIdx = trimmed.indexOf(":");
          const label = trimmed.slice(0, colonIdx + 1);
          const val = trimmed.slice(colonIdx + 1).trim();
          return (
            <div key={i} style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "rgba(225,29,72,0.08)", border: "1px solid rgba(225,29,72,0.3)", borderRadius: 10, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ color: "#e11d48", fontWeight: 700, flexShrink: 0 }}>{label}</span>
              <span style={{ color: dark ? "#f0f0ff" : "#12121e", fontWeight: 600 }}>{val}</span>
            </div>
          );
        }
        if (isDano) return (
          <div key={i} style={{ marginBottom: "0.25rem", padding: "0.5rem 0.9rem", background: dark ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.06)", border: `1px solid ${dark ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.2)"}`, borderRadius: "10px 10px 0 0", fontWeight: 700, color: dark ? "#a5b4fc" : "#4f46e5" }}>{trimmed}</div>
        );
        if (isResh) return (
          <div key={i} style={{ marginTop: "0.75rem", fontWeight: 700, fontSize: "0.95rem", color: dark ? "#e8e6f8" : "#12121e", paddingBottom: "0.3rem", borderBottom: `2px solid ${dark ? "#2a2a3e" : "#e0e0ea"}` }}>{trimmed}</div>
        );
        if (isMetod) return (
          <div key={i} style={{ marginTop: "0.4rem", marginBottom: "0.2rem", fontSize: "0.82rem", fontStyle: "italic", color: dark ? "#7070a0" : "#8080a0", padding: "0.25rem 0.7rem", background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", borderRadius: 6, borderLeft: "2px solid #e11d48" }}>{trimmed}</div>
        );
        if (isPust) return (
          <div key={i} style={{ fontStyle: "italic", color: dark ? "#9090c0" : "#5050a0", marginTop: "0.2rem" }}>{trimmed}</div>
        );
        if (isStep) return (
          <div key={i} style={{ fontWeight: 700, color: dark ? "#c8c8f8" : "#12121e", marginTop: "0.75rem", paddingBottom: "0.2rem", borderBottom: `1px solid ${border2}` }}>{trimmed}</div>
        );
        if (isDashRow) {
          const sepMatch = trimmed.match(/\s[—–-]\s/);
          if (sepMatch) {
            const sepIdx = trimmed.indexOf(sepMatch[0]);
            const left = trimmed.slice(0, sepIdx);
            const right = trimmed.slice(sepIdx + sepMatch[0].length);
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "0.3rem 0.5rem", borderBottom: `1px solid ${border2}`, background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)" }}>
                <span style={{ color: dark ? "#9090b8" : "#606080" }}>{left}</span>
                <span style={{ color: dark ? "#e8e6f8" : "#12121e", fontWeight: 500 }}>{right}</span>
              </div>
            );
          }
        }
        return <div key={i} style={{ color: dark ? "#c8c8e0" : "#2a2a3a" }}>{trimmed}</div>;
      })}
    </div>
  );
}

export default function SPLINTAI() {
  const [dark, setDark] = useState(true);
  const [chats, setChats] = useState(() => loadChats());
  const [activeChatId, setActiveChatId] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [imageBase64, setImageBase64] = useState(null);
  const [imageType, setImageType] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const d = dark;
  const bg = d ? "#08080f" : "#f4f4f8";
  const surface = d ? "#111118" : "#ffffff";
  const border = d ? "#1e1e2e" : "#e2e2ea";
  const textPrimary = d ? "#e8e6f8" : "#12121e";
  const textMuted = d ? "#5a5a7a" : "#9090a8";
  const inputBg = d ? "#0d0d18" : "#ffffff";
  const userBubble = d ? "#1a1030" : "#f0effe";
  const userBubbleBorder = d ? "#3a2060" : "#d8d0fa";
  const sidebarBg = d ? "#0c0c14" : "#f8f8fc";
  const sidebarBorder = d ? "#1a1a2a" : "#e8e8f0";

  const activeMessages = activeChatId
    ? (chats.find(c => c.id === activeChatId)?.messages || [])
    : [];

  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages, loading]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Close sidebar on outside click (mobile)
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e) => {
      if (!e.target.closest('[data-sidebar]') && !e.target.closest('[data-menu-btn]')) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sidebarOpen]);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const createNewChat = useCallback(() => {
    const id = generateId();
    const newChat = { id, messages: [], createdAt: Date.now() };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(id);
    setSidebarOpen(false);
    setInput("");
    removeImage();
  }, []);

  const selectChat = (id) => {
    setActiveChatId(id);
    setSidebarOpen(false);
  };

  const deleteChat = (id) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
    setDeleteConfirm(null);
  };

  const loadImage = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      const full = e.target.result;
      setImageBase64(full.split(",")[1]);
      setPreviewSrc(full);
    };
    reader.readAsDataURL(file);
  }, []);

  const removeImage = () => {
    setImageBase64(null); setImageType(null); setPreviewSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const send = async () => {
    if (!imageBase64 && !input.trim()) return;
    if (loading) return;

    // Create chat if none active
    let chatId = activeChatId;
    if (!chatId) {
      chatId = generateId();
      const newChat = { id: chatId, messages: [], createdAt: Date.now() };
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(chatId);
    }

    const userText = input.trim();
    const userPreview = previewSrc;
    const userImgB64 = imageBase64;

    const userMsg = { role: "user", text: userText, image: userPreview };

    setChats(prev => prev.map(c =>
      c.id === chatId ? { ...c, messages: [...c.messages, userMsg] } : c
    ));

    setInput("");
    removeImage();
    if (textareaRef.current) textareaRef.current.style.height = "40px";
    setLoading(true);

    const currentMessages = [...(chats.find(c => c.id === chatId)?.messages || []), userMsg];
    const history = currentMessages.slice(-10);

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((m) => {
        if (m.role === "user") {
          if (m.image) {
            return {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: m.image } },
                { type: "text", text: m.text || "Реши задачу с этого изображения." },
              ],
            };
          }
          return { role: "user", content: m.text };
        }
        return { role: "assistant", content: m.text };
      }),
    ];

    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: userImgB64 ? VISION_MODEL : TEXT_MODEL,
          messages: apiMessages,
          max_tokens: 1200,
          temperature: 0.2,
        }),
      });
      const data = await res.json();
      setLoading(false);
      const assistantText = data.choices?.[0]?.message?.content
        ? cleanText(data.choices[0].message.content)
        : null;

      setChats(prev => prev.map(c => {
        if (c.id !== chatId) return c;
        const assistantMsg = assistantText
          ? { role: "assistant", text: assistantText }
          : { role: "assistant", text: "Не удалось получить ответ. Попробуй ещё раз.", error: true };
        return { ...c, messages: [...c.messages, assistantMsg] };
      }));
    } catch {
      setLoading(false);
      setChats(prev => prev.map(c =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, { role: "assistant", text: "Ошибка подключения. Проверь интернет.", error: true }] }
          : c
      ));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    loadImage(e.dataTransfer.files[0]);
  };

  const autoResize = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  // Group chats by date
  const groupedChats = chats.reduce((acc, chat) => {
    const d = new Date(chat.createdAt);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    let group;
    if (d.toDateString() === today.toDateString()) group = "Сегодня";
    else if (d.toDateString() === yesterday.toDateString()) group = "Вчера";
    else group = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    if (!acc[group]) acc[group] = [];
    acc[group].push(chat);
    return acc;
  }, {});

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@300;400;500&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
        @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${bg}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${border}; border-radius: 4px; }
        textarea { font-family: 'Inter', sans-serif; }
        textarea::placeholder { color: ${textMuted}; }
        .send-btn:hover:not(:disabled) { background: #be123c !important; }
        .theme-btn:hover { opacity: 0.7; }
        .img-btn:hover { opacity: 0.7; }
        .remove-img:hover { background: rgba(220,50,50,0.8) !important; color: white !important; }
        .chat-item:hover { background: ${d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"} !important; }
        .chat-item.active { background: ${d ? "rgba(225,29,72,0.08)" : "rgba(225,29,72,0.06)"} !important; border-left: 2px solid #e11d48 !important; }
        .chat-delete:hover { color: #e11d48 !important; opacity: 1 !important; }
        .new-chat-btn:hover { background: ${d ? "rgba(225,29,72,0.15)" : "rgba(225,29,72,0.08)"} !important; }
        .install-btn:hover { background: #be123c !important; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 40; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: bg, color: textPrimary, fontFamily: "'Inter', sans-serif", overflow: "hidden" }}>

        {/* Sidebar overlay for mobile */}
        {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

        {/* SIDEBAR */}
        <div
          data-sidebar
          style={{
            width: 260,
            background: sidebarBg,
            borderRight: `1px solid ${sidebarBorder}`,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            position: isMobile ? "fixed" : "relative",
            left: 0, top: 0, bottom: 0,
            zIndex: 50,
            transform: isMobile ? (sidebarOpen ? "translateX(0)" : "translateX(-260px)") : "translateX(0)",
            transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {/* Sidebar header */}
          <div style={{ padding: "0.9rem 1rem 0.75rem", borderBottom: `1px solid ${sidebarBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
            <Logo size={28} />
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.02em", flex: 1 }}>
              SPLINT<span style={{ color: "#e11d48" }}>.</span>AI
            </span>
          </div>

          {/* New chat button */}
          <div style={{ padding: "0.75rem 0.75rem 0.5rem" }}>
            <button
              className="new-chat-btn"
              onClick={createNewChat}
              style={{ width: "100%", background: "transparent", border: `1px dashed ${d ? "#2a2a40" : "#d0d0e0"}`, borderRadius: 10, padding: "0.55rem 1rem", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: textMuted, fontSize: "0.85rem", fontFamily: "'Inter', sans-serif", transition: "all 0.2s" }}
            >
              <PlusIcon />
              Новый чат
            </button>
          </div>

          {/* Chat list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 0.5rem 1rem" }}>
            {chats.length === 0 && (
              <div style={{ textAlign: "center", color: textMuted, fontSize: "0.78rem", marginTop: "2rem", padding: "0 1rem" }}>
                Пока нет чатов.<br />Начни новый разговор!
              </div>
            )}
            {Object.entries(groupedChats).map(([group, groupChats]) => (
              <div key={group}>
                <div style={{ fontSize: "0.68rem", color: textMuted, fontWeight: 600, letterSpacing: "0.06em", padding: "0.75rem 0.6rem 0.3rem", textTransform: "uppercase" }}>{group}</div>
                {groupChats.map(chat => (
                  <div
                    key={chat.id}
                    className={`chat-item${chat.id === activeChatId ? " active" : ""}`}
                    onClick={() => selectChat(chat.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "0.55rem 0.7rem", borderRadius: 9, cursor: "pointer", transition: "all 0.15s", borderLeft: "2px solid transparent", marginBottom: 2, position: "relative" }}
                  >
                    <span style={{ color: textMuted, flexShrink: 0, opacity: 0.6 }}><ChatIcon /></span>
                    <span style={{ fontSize: "0.82rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: chat.id === activeChatId ? (d ? "#e8e6f8" : "#12121e") : textMuted }}>
                      {getChatTitle(chat.messages)}
                    </span>
                    <button
                      className="chat-delete"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(chat.id); }}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: textMuted, opacity: 0.4, flexShrink: 0, display: "flex", alignItems: "center", padding: 2, transition: "all 0.15s", borderRadius: 4 }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Sidebar footer */}
          <div style={{ borderTop: `1px solid ${sidebarBorder}`, padding: "0.6rem 1rem", display: "flex", justifyContent: "center" }}>
            <span style={{ fontSize: "0.65rem", color: "#e11d48", fontWeight: 600, letterSpacing: "0.08em" }}>by ismail</span>
          </div>
        </div>

        {/* MAIN AREA */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Header */}
          <div style={{ background: surface, borderBottom: `1px solid ${border}`, padding: "0.75rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Mobile menu button */}
              <button
                data-menu-btn
                onClick={() => setSidebarOpen(v => !v)}
                style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: 9, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: textMuted, flexShrink: 0 }}
              >
                <MenuIcon />
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Logo size={28} />
                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.02em" }}>
                  SPLINT<span style={{ color: "#e11d48" }}>.</span>AI
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {installPrompt && (
                <button className="install-btn" onClick={handleInstall} style={{ background: "#e11d48", border: "none", borderRadius: 8, padding: "0.35rem 0.7rem", fontSize: "0.75rem", color: "white", cursor: "pointer", fontFamily: "'Inter', sans-serif", transition: "all 0.2s", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                  </svg>
                  Установить
                </button>
              )}
              <button onClick={createNewChat} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: 8, padding: "0.35rem 0.8rem", fontSize: "0.75rem", color: textMuted, cursor: "pointer", fontFamily: "'Inter', sans-serif", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 5 }}>
                <PlusIcon /> Новый чат
              </button>
              <button className="theme-btn" onClick={() => setDark(!d)} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: 9, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: textMuted, transition: "all 0.2s" }}>
                {d ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1rem" }}>
            <div style={{ maxWidth: 680, margin: "0 auto" }}>

              {activeMessages.length === 0 && (
                <div style={{ textAlign: "center", padding: "3rem 0 2rem", animation: "fadeUp 0.5s ease" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
                    <Logo size={72} />
                  </div>
                  <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "clamp(2rem, 8vw, 3.5rem)", letterSpacing: "-0.03em", marginBottom: "0.5rem" }}>
                    SPLINT<span style={{ color: "#e11d48" }}>.</span>AI
                  </h1>
                  <p style={{ color: textMuted, fontSize: "0.88rem", lineHeight: 1.6 }}>
                    Задай любой вопрос или скинь фото задачи<br />Любой предмет · Любой язык
                  </p>
                </div>
              )}

              {activeMessages.map((msg, i) => (
                <div key={i} style={{ marginBottom: "1.25rem", animation: "fadeUp 0.3s ease", display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "user" ? (
                    <div style={{ maxWidth: "80%", background: userBubble, border: `1px solid ${userBubbleBorder}`, borderRadius: "18px 18px 4px 18px", padding: "0.75rem 1rem" }}>
                      {msg.image && (
                        <img src={msg.image} alt="task" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 10, marginBottom: msg.text ? "0.6rem" : 0, display: "block" }} />
                      )}
                      {msg.text && <div style={{ fontSize: "0.92rem", lineHeight: 1.6, color: textPrimary }}>{msg.text}</div>}
                    </div>
                  ) : (
                    <div style={{ maxWidth: "92%", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ flexShrink: 0, marginTop: 2 }}><Logo size={26} /></div>
                      <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: "4px 18px 18px 18px", padding: "0.9rem 1.1rem", color: msg.error ? "#f87171" : textPrimary, flex: 1 }}>
                        {msg.error
                          ? <div style={{ fontSize: "0.9rem" }}>{msg.text}</div>
                          : <MessageText text={msg.text} dark={d} />
                        }
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: "1.25rem", animation: "fadeUp 0.3s ease" }}>
                  <div style={{ flexShrink: 0, marginTop: 2 }}><Logo size={26} /></div>
                  <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: "4px 18px 18px 18px", padding: "0.85rem 1.25rem", display: "flex", gap: 5, alignItems: "center" }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#e11d48", animation: `pulse 1.2s ease ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input area */}
          <div
            style={{ background: surface, borderTop: `1px solid ${border}`, padding: "0.85rem 1rem 1rem", flexShrink: 0 }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div style={{ maxWidth: 680, margin: "0 auto" }}>
              {previewSrc && (
                <div style={{ marginBottom: "0.6rem", display: "inline-flex", position: "relative" }}>
                  <img src={previewSrc} alt="preview" style={{ height: 64, width: "auto", borderRadius: 10, border: `1px solid ${border}`, display: "block" }} />
                  <button className="remove-img" onClick={removeImage} style={{ position: "absolute", top: -6, right: -6, background: d ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)", border: `1px solid ${border}`, borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: textMuted, fontSize: 10, transition: "all 0.15s" }}>✕</button>
                </div>
              )}

              {isDragging && (
                <div style={{ border: `2px dashed #e11d48`, borderRadius: 12, padding: "0.75rem", textAlign: "center", fontSize: "0.8rem", color: "#e11d48", marginBottom: "0.6rem", background: d ? "#0d0d1e" : "#fff0f3" }}>
                  Отпусти фото сюда
                </div>
              )}

              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <button className="img-btn" onClick={() => fileInputRef.current?.click()} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }}>
                  <ImageIcon color={textMuted} />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => loadImage(e.target.files[0])} />

                <textarea
                  ref={textareaRef}
                  style={{ flex: 1, background: inputBg, border: `1px solid ${isDragging ? "#e11d48" : border}`, borderRadius: 12, color: textPrimary, fontSize: "0.92rem", padding: "0.65rem 0.9rem", resize: "none", outline: "none", lineHeight: 1.6, height: 40, minHeight: 40, maxHeight: 140, transition: "border 0.2s", overflow: "hidden" }}
                  placeholder="Напиши вопрос или задачу..."
                  value={input}
                  onChange={(e) => { setInput(e.target.value); autoResize(e); }}
                  onKeyDown={handleKeyDown}
                />

                <button
                  className="send-btn"
                  onClick={send}
                  disabled={loading || (!input.trim() && !imageBase64)}
                  style={{ background: (loading || (!input.trim() && !imageBase64)) ? (d ? "#1a1a28" : "#e8e8f0") : "#e11d48", border: "none", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: (loading || (!input.trim() && !imageBase64)) ? "not-allowed" : "pointer", flexShrink: 0, transition: "all 0.2s", color: (loading || (!input.trim() && !imageBase64)) ? textMuted : "white" }}
                >
                  <SendIcon />
                </button>
              </div>

              <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
                <div style={{ fontSize: "0.68rem", color: textMuted }}>
                  Enter для отправки · Shift+Enter для новой строки
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 16, padding: "1.5rem", maxWidth: 300, width: "90%", textAlign: "center", animation: "fadeUp 0.2s ease" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>🗑️</div>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem", color: textPrimary }}>Удалить чат?</div>
            <div style={{ fontSize: "0.82rem", color: textMuted, marginBottom: "1.25rem" }}>Это действие нельзя отменить</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, background: "transparent", border: `1px solid ${border}`, borderRadius: 10, padding: "0.6rem", cursor: "pointer", color: textMuted, fontFamily: "'Inter', sans-serif", fontSize: "0.85rem" }}>Отмена</button>
              <button onClick={() => deleteChat(deleteConfirm)} style={{ flex: 1, background: "#e11d48", border: "none", borderRadius: 10, padding: "0.6rem", cursor: "pointer", color: "white", fontFamily: "'Inter', sans-serif", fontSize: "0.85rem", fontWeight: 600 }}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}