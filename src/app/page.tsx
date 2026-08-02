"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import QRCode from "qrcode";
import {
  Copy,
  Check,
  QrCode,
  Trash2,
  Inbox,
  Clock,
  X,
  Sparkles,
  ArrowRight,
  Star,
  Github,
} from "lucide-react";

interface EmailItem {
  id: string;
  recipient: string;
  username: string;
  sender: string;
  subject: string;
  text_body: string;
  html_body: string;
  raw_headers?: string;
  created_at: string;
  expires_at: string;
}

const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN || "flash-mail.vaibhavs-h.xyz";

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [username, setUsername] = useState<string>("");
  const [inputVal, setInputVal] = useState<string>("");
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [qrModalOpen, setQrModalOpen] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [viewTab, setViewTab] = useState<"html" | "text" | "headers">("html");
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [newEmailAlert, setNewEmailAlert] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isTitleHovered, setIsTitleHovered] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync state whenever searchParams changes in URL
  useEffect(() => {
    const q = searchParams.get("q") || "";
    const clean = q.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    setUsername(clean);
    setInputVal(clean);
  }, [searchParams]);

  const fullEmail = username ? `${username}@${DOMAIN}` : "";

  // Floating dots background canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const dots: { x: number; y: number; r: number; dx: number; dy: number; alpha: number }[] = [];
    for (let i = 0; i < 35; i++) {
      dots.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 2.5 + 1.5,
        dx: (Math.random() - 0.5) * 0.4,
        dy: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.3 + 0.1,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      dots.forEach((dot) => {
        dot.x += dot.dx;
        dot.y += dot.dy;
        if (dot.x < 0) dot.x = width;
        if (dot.x > width) dot.x = 0;
        if (dot.y < 0) dot.y = height;
        if (dot.y > height) dot.y = 0;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fillStyle = isDarkMode ? `rgba(255, 255, 255, ${dot.alpha})` : `rgba(0, 0, 0, ${dot.alpha})`;
        ctx.fill();
      });
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isDarkMode]);

  // Fetch emails directly from Supabase (Bypasses Vercel Serverless Function Invocations)
  const fetchEmails = async (targetUsername: string, isSilent = false) => {
    if (!targetUsername) {
      setEmails([]);
      return;
    }
    if (!isSilent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .eq("username", targetUsername.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error && data) {
        setEmails((prev) => {
          if (isSilent && data.length > prev.length) {
            setNewEmailAlert(true);
            setTimeout(() => setNewEmailAlert(false), 5000);
          }
          return data as EmailItem[];
        });
      }
    } catch (err) {
      console.error("Supabase Direct Fetch Exception:", err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  // Listen for realtime emails with Tab Visibility pause + smart polling fallback
  useEffect(() => {
    if (!username) {
      setEmails([]);
      setRealtimeConnected(false);
      return;
    }

    fetchEmails(username);

    // 1. Supabase Realtime Subscription
    const channel = supabase
      .channel(`inbox-${username}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "emails",
          filter: `username=eq.${username.toLowerCase()}`,
        },
        (payload) => {
          const newMail = payload.new as EmailItem;
          setEmails((prev) => {
            if (prev.some((e) => e.id === newMail.id)) return prev;
            setNewEmailAlert(true);
            setTimeout(() => setNewEmailAlert(false), 5000);
            return [newMail, ...prev];
          });
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    // 2. Tab Visibility & WebSocket Check (ONLY polls if WebSockets disconnect!)
    const pollInterval = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        !realtimeConnected
      ) {
        fetchEmails(username, true);
      }
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [username]);

  const handleSetUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    const clean = inputVal.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    setSelectedEmail(null);
    router.push(`/search?q=${encodeURIComponent(clean)}`);
  };

  const handleGoHome = () => {
    setUsername("");
    setInputVal("");
    setEmails([]);
    setSelectedEmail(null);
    router.push("/");
  };

  const handleCopy = () => {
    if (!fullEmail) return;
    navigator.clipboard.writeText(fullEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenQR = async () => {
    if (!fullEmail) return;
    try {
      const url = await QRCode.toDataURL(fullEmail, { width: 300, margin: 2 });
      setQrDataUrl(url);
      setQrModalOpen(true);
    } catch (err) {
      console.error("QR Error:", err);
    }
  };

  const handleDeleteEmail = async (id: string) => {
    try {
      await fetch(`/api/email/${id}`, { method: "DELETE" });
      setEmails((prev) => prev.filter((e) => e.id !== id));
      if (selectedEmail?.id === id) {
        setSelectedEmail(null);
      }
    } catch (err) {
      console.error("Delete Error:", err);
    }
  };

  return (
    <div
      className={`min-h-screen px-4 py-2 sm:px-8 sm:py-4 flex flex-col justify-center items-center font-mono select-none relative transition-colors duration-300 ${isDarkMode ? "bg-[#18181b] text-white" : "bg-[#eeeeee] text-black"
        }`}
    >
      {/* FLOATING DOTS CANVAS */}
      <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10" />

      <div className={`z-10 w-full max-w-[1111px] flex-1 flex flex-col ${!username ? "justify-center" : ""} py-2 sm:py-4`}>
        {/* HEADER SECTION */}
        <header className="flex justify-between items-center mb-4 sm:mb-6 gap-4">
          <h1
            onClick={handleGoHome}
            onMouseEnter={() => setIsTitleHovered(true)}
            onMouseLeave={() => setIsTitleHovered(false)}
            className={`text-4xl sm:text-5xl md:text-6xl font-black tracking-wider uppercase font-mono cursor-pointer select-none transition-all duration-150 ${isDarkMode ? "text-white" : "text-black"
              } ${isTitleHovered ? "-translate-x-1 -translate-y-1" : "translate-x-0 translate-y-0"}`}
            style={{
              textShadow: isTitleHovered ? "4px 4px 0px #ff5a5f" : "none",
            }}
          >
            FLASH MAIL
          </h1>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/vaibhavs-h/Flash-Mail"
              target="_blank"
              rel="noopener noreferrer"
              className={`font-black px-4 py-2.5 text-base sm:text-xl border-4 uppercase cursor-pointer transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-2.5 ${isDarkMode
                  ? "bg-[#18181b] text-white border-white shadow-[4px_4px_0px_#ffffff] hover:bg-white hover:text-black hover:shadow-[7px_7px_0px_#ffffff] active:shadow-[1px_1px_0px_#ffffff]"
                  : "bg-[#24292e] text-white border-black shadow-[4px_4px_0px_#000000] hover:bg-black hover:text-white hover:shadow-[7px_7px_0px_#000000] active:shadow-[1px_1px_0px_#000000]"
                }`}
            >
              <Github className="w-6 h-6 fill-current" />
              <span>GITHUB</span>
            </a>

            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`font-black px-5 py-2.5 text-base sm:text-xl border-4 uppercase cursor-pointer transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 ${isDarkMode
                  ? "bg-[#ff5a5f] text-black border-white shadow-[4px_4px_0px_#ffffff] hover:bg-white hover:text-[#ff5a5f] hover:shadow-[7px_7px_0px_#ffffff] active:shadow-[1px_1px_0px_#ffffff]"
                  : "bg-[#ff5a5f] text-white border-black shadow-[4px_4px_0px_#000000] hover:bg-black hover:text-[#ff5a5f] hover:shadow-[7px_7px_0px_#000000] active:shadow-[1px_1px_0px_#000000]"
                }`}
            >
              {isDarkMode ? "LIGHT" : "DARK"}
            </button>
          </div>
        </header>

        {/* REALTIME ALERT NOTIFICATION */}
        {newEmailAlert && (
          <div
            className={`border-4 p-4 mb-6 text-center font-black flex items-center justify-center gap-2 animate-bounce text-lg ${isDarkMode
                ? "bg-emerald-400 text-black border-white shadow-[6px_6px_0px_#ffffff]"
                : "bg-emerald-400 text-black border-black shadow-[6px_6px_0px_#000000]"
              }`}
          >
            <Sparkles className="w-6 h-6 fill-black" />
            <span>NEW EMAIL RECEIVED! CHECK OUT NOW!!</span>
          </div>
        )}

        {!username ? (
          <>
            {/* MAIN INPUT BOX SECTION */}
            <div
              className={`border-4 p-4 sm:p-6 mb-8 transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 ${isDarkMode
                  ? "bg-[#18181b] border-white shadow-[8px_8px_0px_#ffffff] hover:shadow-[12px_12px_0px_#ffffff]"
                  : "bg-[#e5e5e5] border-black shadow-[8px_8px_0px_#000000] hover:shadow-[12px_12px_0px_#000000]"
                }`}
            >
              <form onSubmit={handleSetUsername} className="flex flex-col sm:flex-row gap-4">
                <div
                  className={`relative flex-1 border-4 font-mono text-xl sm:text-2xl font-bold transition-all duration-150 ${isDarkMode
                      ? "bg-[#18181b] text-white border-white focus-within:-translate-x-1 focus-within:-translate-y-1 focus-within:shadow-[4px_4px_0px_#ffffff]"
                      : "bg-[#e5e5e5] text-black border-black focus-within:-translate-x-1 focus-within:-translate-y-1 focus-within:shadow-[4px_4px_0px_#000000]"
                    }`}
                >
                  <input
                    type="text"
                    placeholder="Get your username"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    className={`w-full bg-transparent p-3 sm:p-4 outline-none font-bold sm:pr-[310px] ${isDarkMode
                        ? "text-white placeholder-slate-500"
                        : "text-black placeholder-slate-500"
                      }`}
                  />
                  <span
                    className={`hidden sm:inline absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm sm:text-base font-bold pointer-events-none ${isDarkMode ? "text-slate-400" : "text-slate-600"
                      }`}
                  >
                    @{DOMAIN}
                  </span>
                </div>

                <button
                  type="submit"
                  className={`font-black px-8 py-3 text-2xl border-4 cursor-pointer transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2 uppercase ${isDarkMode
                      ? "bg-[#ff5a5f] text-black border-white shadow-[4px_4px_0px_#ffffff] hover:bg-white hover:text-[#ff5a5f] hover:shadow-[7px_7px_0px_#ffffff] active:shadow-[1px_1px_0px_#ffffff]"
                      : "bg-[#ff5a5f] text-white border-black shadow-[4px_4px_0px_#000000] hover:bg-black hover:text-[#ff5a5f] hover:shadow-[7px_7px_0px_#000000] active:shadow-[1px_1px_0px_#000000]"
                    }`}
                >
                  <span>GO</span>
                  <ArrowRight className="w-6 h-6 stroke-[3]" />
                </button>
              </form>
            </div>

            {/* RULES CONTAINER */}
            <div
              className={`border-4 p-4 sm:p-6 mb-8 text-center transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 ${isDarkMode
                  ? "bg-[#18181b] border-white shadow-[8px_8px_0px_#ffffff] hover:shadow-[12px_12px_0px_#ffffff]"
                  : "bg-[#e5e5e5] border-black shadow-[8px_8px_0px_#000000] hover:shadow-[12px_12px_0px_#000000]"
                }`}
            >
              <h2 className="text-3xl sm:text-4xl font-black uppercase mb-6">Temp Mail Service</h2>
              <div className="space-y-4 text-left font-bold text-base sm:text-xl md:text-2xl leading-relaxed">
                <p
                  className={`p-4 border-4 transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 ${isDarkMode
                      ? "bg-[#27272a] border-white shadow-[4px_4px_0px_#ffffff] hover:shadow-[7px_7px_0px_#ffffff]"
                      : "bg-white border-black shadow-[4px_4px_0px_#000000] hover:shadow-[7px_7px_0px_#000000]"
                    }`}
                >
                  1) Inbound emails are delivered instantly using real-time WebSockets — no manual refreshing required.
                </p>
                <p
                  className={`p-4 border-4 transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 ${isDarkMode
                      ? "bg-[#27272a] border-white shadow-[4px_4px_0px_#ffffff] hover:shadow-[7px_7px_0px_#ffffff]"
                      : "bg-white border-black shadow-[4px_4px_0px_#000000] hover:shadow-[7px_7px_0px_#000000]"
                    }`}
                >
                  2) Use disposable emails for one-time signups, free trials, and untrusted sites to keep your primary inbox spam-free.
                </p>
                <p
                  className={`p-4 border-4 transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 ${isDarkMode
                      ? "bg-[#27272a] border-white shadow-[4px_4px_0px_#ffffff] hover:shadow-[7px_7px_0px_#ffffff]"
                      : "bg-white border-black shadow-[4px_4px_0px_#000000] hover:shadow-[7px_7px_0px_#000000]"
                    }`}
                >
                  3) Messages auto-delete after 7 days so you don&#x27;t have to manage or clean up old emails.
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* MAILS FOR HEADING SECTION */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 font-mono">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black break-words">
                Mails for &quot;<span className="text-[#ff5a5f]">{fullEmail}</span>&quot;
              </h2>
              <button
                onClick={handleGoHome}
                className={`font-black px-5 py-2.5 text-base border-4 cursor-pointer transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 uppercase shrink-0 ${isDarkMode
                    ? "bg-[#ff5a5f] text-black border-white shadow-[4px_4px_0px_#ffffff] hover:bg-white hover:text-[#ff5a5f] hover:shadow-[7px_7px_0px_#ffffff]"
                    : "bg-[#ff5a5f] text-white border-black shadow-[4px_4px_0px_#000000] hover:bg-black hover:text-[#ff5a5f] hover:shadow-[7px_7px_0px_#000000]"
                  }`}
              >
                Change Username
              </button>
            </div>

            {/* ACTIVE EMAIL ADDRESS BOX */}
            <div
              className={`border-4 p-4 sm:p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 ${isDarkMode
                  ? "bg-[#18181b] border-white shadow-[8px_8px_0px_#ffffff] hover:shadow-[12px_12px_0px_#ffffff]"
                  : "bg-[#e5e5e5] border-black shadow-[8px_8px_0px_#000000] hover:shadow-[12px_12px_0px_#000000]"
                }`}
            >
              <div className="min-w-0 flex-1">
                <span
                  className={`text-xs uppercase font-extrabold tracking-wider block mb-1 ${isDarkMode ? "text-slate-400" : "text-slate-600"
                    }`}
                >
                  Your Disposable Address:
                </span>
                <span
                  className={`text-lg sm:text-2xl md:text-3xl font-mono font-black select-all tracking-wide break-all ${isDarkMode ? "text-white" : "text-black"
                    }`}
                >
                  {fullEmail}
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={handleCopy}
                  className={`font-black px-6 py-3 text-lg border-4 cursor-pointer transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2 uppercase ${isDarkMode
                      ? "bg-[#ff5a5f] text-black border-white shadow-[4px_4px_0px_#ffffff] hover:bg-white hover:text-[#ff5a5f] hover:shadow-[7px_7px_0px_#ffffff] active:shadow-[1px_1px_0px_#ffffff]"
                      : "bg-[#ff5a5f] text-white border-black shadow-[4px_4px_0px_#000000] hover:bg-black hover:text-[#ff5a5f] hover:shadow-[7px_7px_0px_#000000] active:shadow-[1px_1px_0px_#000000]"
                    }`}
                >
                  {copied ? <Check className="w-5 h-5 stroke-[3]" /> : <Copy className="w-5 h-5 stroke-[3]" />}
                  <span>{copied ? "COPIED!" : "COPY"}</span>
                </button>

                <button
                  onClick={handleOpenQR}
                  className={`font-black p-3 text-lg border-4 cursor-pointer transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 ${isDarkMode
                      ? "bg-white text-black border-white shadow-[4px_4px_0px_#ffffff] hover:bg-[#ff5a5f] hover:text-black hover:shadow-[7px_7px_0px_#ffffff] active:shadow-[1px_1px_0px_#ffffff]"
                      : "bg-white text-black border-black shadow-[4px_4px_0px_#000000] hover:bg-black hover:text-white hover:shadow-[7px_7px_0px_#000000] active:shadow-[1px_1px_0px_#000000]"
                    }`}
                  title="QR Code"
                >
                  <QrCode className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* INBOX MESSAGES SECTION */}
            <div
              className={`border-4 p-4 sm:p-6 mb-2 flex-1 flex flex-col min-h-[360px] sm:min-h-[420px] transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 ${isDarkMode
                  ? "bg-[#18181b] border-white shadow-[8px_8px_0px_#ffffff] hover:shadow-[12px_12px_0px_#ffffff]"
                  : "bg-[#e5e5e5] border-black shadow-[8px_8px_0px_#000000] hover:shadow-[12px_12px_0px_#000000]"
                }`}
            >
              <div
                className={`flex items-center justify-between pb-4 mb-4 border-b-4 ${isDarkMode ? "border-white" : "border-black"
                  }`}
              >
                <h2 className="text-2xl sm:text-3xl font-black uppercase flex items-center gap-3">
                  <Inbox className="w-7 h-7 stroke-[3]" />
                  <span>Inbox Messages</span>
                </h2>
                <span
                  className={`px-4 py-1 font-mono font-black text-xl border-2 ${isDarkMode ? "bg-white text-black border-white" : "bg-black text-white border-black"
                    }`}
                >
                  {emails.length}
                </span>
              </div>

              {loading ? (
                <div className="flex-1 flex items-center justify-center py-12 text-center font-black text-xl gap-3">
                  <div
                    className={`w-6 h-6 border-4 border-t-transparent rounded-full animate-spin ${isDarkMode ? "border-white" : "border-black"
                      }`}
                  ></div>
                  <span>LOADING MESSAGES...</span>
                </div>
              ) : emails.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center font-mono text-xl sm:text-2xl font-bold leading-relaxed">
                  <p>No mails found. Try sending a mail to</p>
                  <p className="font-black my-2 select-all text-[#ff5a5f]">
                    &apos;{fullEmail}&apos;
                  </p>
                  <p>and Try Again.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {emails.map((mail) => (
                    <div
                      key={mail.id}
                      className={`border-4 p-4 cursor-pointer transition-all duration-150 hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 ${isDarkMode
                          ? "bg-[#27272a] text-white border-white shadow-[4px_4px_0px_#ffffff] hover:shadow-[7px_7px_0px_#ffffff]"
                          : "bg-white text-black border-black shadow-[4px_4px_0px_#000000] hover:shadow-[7px_7px_0px_#000000]"
                        }`}
                      onClick={() => setSelectedEmail(mail)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-mono font-extrabold">FROM: {mail.sender}</span>
                        <span
                          className={`text-xs font-mono font-bold flex items-center gap-1 ${isDarkMode ? "text-slate-400" : "text-slate-600"
                            }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(mail.created_at).toLocaleString()}
                        </span>
                      </div>
                      <h3 className="text-xl font-black mb-1">{mail.subject}</h3>
                      <p
                        className={`text-sm font-mono line-clamp-2 ${isDarkMode ? "text-slate-300" : "text-slate-700"
                          }`}
                      >
                        {mail.text_body || "(HTML Email - Click to view)"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* EMAIL READER MODAL */}
      {selectedEmail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md p-3 sm:p-6 flex items-center justify-center font-mono">
          <div
            className={`border-4 max-w-[1111px] w-full h-[88vh] max-h-[92vh] flex flex-col overflow-hidden p-4 sm:p-6 ${isDarkMode
                ? "bg-[#18181b] text-white border-white shadow-[12px_12px_0px_#ffffff]"
                : "bg-[#e5e5e5] text-black border-black shadow-[12px_12px_0px_#000000]"
              }`}
          >
            <div
              className={`flex items-start justify-between pb-4 border-b-4 gap-4 ${isDarkMode ? "border-white" : "border-black"
                }`}
            >
              <div>
                <h3 className="text-2xl sm:text-3xl font-black mb-1">{selectedEmail.subject}</h3>
                <p className="text-base font-mono font-bold">FROM: {selectedEmail.sender}</p>
                <p
                  className={`text-xs font-mono font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-600"
                    }`}
                >
                  {new Date(selectedEmail.created_at).toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => setSelectedEmail(null)}
                className={`border-4 p-2 font-black cursor-pointer transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 ${isDarkMode
                    ? "bg-[#ff5a5f] text-black border-white shadow-[3px_3px_0px_#ffffff]"
                    : "bg-white text-black border-black shadow-[3px_3px_0px_#000000]"
                  }`}
              >
                <X className="w-6 h-6 stroke-[3]" />
              </button>
            </div>

            {/* TAB SELECTOR */}
            <div
              className={`flex items-center gap-2 py-3 border-b-4 ${isDarkMode ? "border-white" : "border-black"
                }`}
            >
              <button
                onClick={() => setViewTab("html")}
                className={`px-4 py-2 font-black text-sm border-4 cursor-pointer transition-all duration-150 ${viewTab === "html"
                    ? "bg-[#ff5a5f] text-black border-white shadow-[3px_3px_0px_#ffffff]"
                    : isDarkMode
                      ? "bg-[#27272a] text-white border-white hover:bg-slate-800"
                      : "bg-white text-black border-black hover:bg-slate-100"
                  }`}
              >
                HTML VIEW
              </button>
              <button
                onClick={() => setViewTab("text")}
                className={`px-4 py-2 font-black text-sm border-4 cursor-pointer transition-all duration-150 ${viewTab === "text"
                    ? "bg-[#ff5a5f] text-black border-white shadow-[3px_3px_0px_#ffffff]"
                    : isDarkMode
                      ? "bg-[#27272a] text-white border-white hover:bg-slate-800"
                      : "bg-white text-black border-black hover:bg-slate-100"
                  }`}
              >
                PLAIN TEXT
              </button>

              <a
                href="https://github.com/vaibhavs-h/Flash-Mail"
                target="_blank"
                rel="noopener noreferrer"
                className={`ml-auto px-4 py-2 font-black text-sm border-4 cursor-pointer transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 flex items-center gap-2 ${isDarkMode
                    ? "bg-black text-white border-white shadow-[3px_3px_0px_#ffffff] hover:bg-white hover:text-black"
                    : "bg-black text-white border-black shadow-[3px_3px_0px_#000000] hover:bg-white hover:text-black"
                  }`}
              >
                <Github className="w-4 h-4 fill-current" />
                <span>STAR ON GITHUB</span>
              </a>
            </div>

            {/* EMAIL CONTENT DISPLAY */}
            <div
              className={`flex-1 overflow-y-auto mt-4 p-4 border-4 min-h-[450px] ${isDarkMode ? "bg-[#090d16] text-white border-white" : "bg-white text-black border-black"
                }`}
            >
              {viewTab === "html" ? (
                <iframe
                  srcDoc={`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <style>
                          body { font-family: system-ui, sans-serif; color: ${isDarkMode ? "#f8fafc" : "#000000"
                    }; background: ${isDarkMode ? "#090d16" : "#ffffff"
                    }; padding: 16px; margin: 0; line-height: 1.6; }
                          a { color: #38bdf8; }
                        </style>
                      </head>
                      <body>${selectedEmail.html_body || selectedEmail.text_body}</body>
                    </html>
                  `}
                  className="w-full h-full border-0 min-h-[450px]"
                  title="Email Content"
                />
              ) : (
                <pre className="font-mono text-sm whitespace-pre-wrap font-semibold">
                  {selectedEmail.text_body || "No text content available."}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR CODE MODAL */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono">
          <div
            className={`border-4 p-6 max-w-sm w-full text-center relative ${isDarkMode
                ? "bg-[#18181b] text-white border-white shadow-[10px_10px_0px_#ffffff]"
                : "bg-[#e5e5e5] text-black border-black shadow-[10px_10px_0px_#000000]"
              }`}
          >
            <button
              onClick={() => setQrModalOpen(false)}
              className={`absolute top-4 right-4 border-4 p-1 font-black cursor-pointer transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 ${isDarkMode
                  ? "bg-[#ff5a5f] text-black border-white"
                  : "bg-white text-black border-black"
                }`}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-3xl font-black uppercase mb-2">QR Code</h3>
            <p
              className={`text-xs font-mono font-bold mb-4 ${isDarkMode ? "text-slate-400" : "text-slate-700"
                }`}
            >
              Scan on mobile to target this address
            </p>

            {qrDataUrl && (
              <div
                className={`p-4 inline-block mb-4 border-4 ${isDarkMode
                    ? "bg-white border-white shadow-[4px_4px_0px_#ffffff]"
                    : "bg-white border-black shadow-[4px_4px_0px_#000000]"
                  }`}
              >
                <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
              </div>
            )}

            <p
              className={`text-sm font-mono p-3 border-4 font-black select-all ${isDarkMode
                  ? "bg-[#090d16] text-white border-white shadow-[4px_4px_0px_#ffffff]"
                  : "bg-white text-black border-black shadow-[4px_4px_0px_#000000]"
                }`}
            >
              {fullEmail}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
