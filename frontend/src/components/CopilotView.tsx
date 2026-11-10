import React, { useState } from "react";
import { Sparkles, Send, Bot, User, ShieldCheck } from "lucide-react";
import { queryCopilot } from "../api";

interface Message {
  id: string;
  sender: "user" | "copilot";
  content: string;
  citations?: string[];
  metrics?: any;
  recommended_actions?: string[];
  timestamp: string;
}

interface CopilotViewProps {
  initialIncidentQuery?: string;
  onSelectIncidentNumber?: (incNumber: string) => void;
}

export const CopilotView: React.FC<CopilotViewProps> = ({
  initialIncidentQuery,
  onSelectIncidentNumber,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "copilot",
      content:
        "### OreSentinel AI Operational Copilot Ready\n\n" +
        "I am connected to the plant crusher ledger and computer vision inference logs. " +
        "Ask me to analyze downtime trends, inspect specific boulder incidents, or audit operator lead times.",
      citations: [],
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputValue, setInputValue] = useState<string>(
    initialIncidentQuery ? `Audit incident ${initialIncidentQuery}` : ""
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const suggestedPrompts = [
    "Audit INC-2026-0081: What was the detected caliber and lead time?",
    "Calculate total avoided downtime and financial cost savings",
    "List all critical oversize boulders currently awaiting action",
    "What is the system detection precision and recall benchmark?",
  ];

  const handleSend = async (queryText?: string) => {
    const text = queryText || inputValue;
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      const res = await queryCopilot(text);
      const botMsg: Message = {
        id: String(Date.now() + 1),
        sender: "copilot",
        content: res.answer,
        citations: res.citations,
        metrics: res.metrics,
        recommended_actions: res.recommended_actions,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: "copilot",
          content: "Encountered an error querying operational database: " + err,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl shadow-xl flex flex-col h-[750px] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#142e27] bg-[#071311] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-800/40 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white font-mono">
                ORESENTINEL COPILOT
              </h3>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                RESTRICTED FASTAPI TOOLS
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Grounded strictly on persistent plant records, time filters, and event IDs.
            </p>
          </div>
        </div>
      </div>

      {/* Suggested Prompts Strip */}
      <div className="px-4 py-2.5 bg-[#081513] border-b border-[#122822] flex items-center space-x-2 overflow-x-auto text-xs">
        <span className="text-[11px] text-slate-500 uppercase font-mono shrink-0">
          QUICK AUDIT:
        </span>
        {suggestedPrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(p)}
            className="px-2.5 py-1 rounded-lg bg-[#0e241f] hover:bg-emerald-900/60 border border-[#173830] text-slate-300 hover:text-white transition-colors whitespace-nowrap text-[11px] cursor-pointer"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex space-x-3 ${
              m.sender === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {m.sender === "copilot" && (
              <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                m.sender === "user"
                  ? "bg-emerald-700 text-white rounded-br-none shadow-md"
                  : "bg-[#071412] text-slate-200 border border-[#173830] rounded-bl-none shadow-md"
              }`}
            >
              {/* Formatted Markdown-like Content */}
              <div className="space-y-2 whitespace-pre-line font-sans">
                {m.content}
              </div>

              {/* Citations Badges */}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-[#142e27] flex items-center flex-wrap gap-1.5">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    EVIDENCE CITATIONS:
                  </span>
                  {m.citations.map((c, i) => (
                    <span
                      key={i}
                      onClick={() => onSelectIncidentNumber && onSelectIncidentNumber(c)}
                      className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700 text-emerald-300 font-mono text-[10px] font-bold cursor-pointer hover:underline"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {/* Recommended Actions Callout */}
              {m.recommended_actions && m.recommended_actions.length > 0 && (
                <div className="mt-3 p-2.5 bg-emerald-950/40 border border-emerald-800/40 rounded-xl space-y-1">
                  <div className="font-semibold text-emerald-300 text-[11px] flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>RECOMMENDED OPERATIONAL ACTIONS:</span>
                  </div>
                  <ul className="list-disc pl-4 text-[11px] text-slate-300 space-y-0.5">
                    {m.recommended_actions.map((act, i) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-2 text-[9px] text-slate-500 font-mono text-right">
                {m.timestamp}
              </div>
            </div>

            {m.sender === "user" && (
              <div className="w-8 h-8 rounded-lg bg-[#142d27] border border-[#1c3f36] flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex space-x-3 justify-start">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400 shrink-0">
              <Bot className="w-4 h-4 animate-pulse" />
            </div>
            <div className="bg-[#071412] border border-[#173830] rounded-2xl rounded-bl-none p-3.5 text-xs text-slate-400 flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
              <span>Querying verified plant ledger &amp; telemetry...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="p-4 bg-[#071311] border-t border-[#142e27]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            placeholder="Ask about boulder telemetry, lead times, or avoided crusher downtime..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            className="flex-1 bg-[#0b1b18] border border-[#193b32] rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          >
            <span>Ask</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
