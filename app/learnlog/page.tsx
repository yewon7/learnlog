'use client';

import { useState, useEffect, useMemo } from 'react';
import BottomNav from '../components/BottomNav';

export interface LearnLogHistoryEntry {
  question: string;
  concept: string;
  date: string;
  timestamp: number;
  answer?: string;
}

function endOfTodayMs(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LearnLogPage() {
  const [entries, setEntries] = useState<LearnLogHistoryEntry[]>([]);
  const [selected, setSelected] = useState<LearnLogHistoryEntry | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('learnlog_history');
      if (!raw) return;
      const parsed = JSON.parse(raw) as LearnLogHistoryEntry[];
      if (!Array.isArray(parsed)) return;
      setEntries(parsed);
    } catch {}
  }, []);

  const visible = useMemo(() => {
    const cutoff = endOfTodayMs();
    const throughToday = entries.filter(e => e.timestamp <= cutoff);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? throughToday.filter(
          e =>
            e.question.toLowerCase().includes(q) ||
            (e.answer && e.answer.toLowerCase().includes(q))
        )
      : throughToday;
    return [...filtered].sort((a, b) => a.timestamp - b.timestamp);
  }, [entries, search]);

  useEffect(() => {
    if (visible.length === 0) {
      setSelected(null);
      return;
    }
    setSelected(prev => {
      if (prev && visible.some(e => e.timestamp === prev.timestamp && e.question === prev.question)) {
        return prev;
      }
      return visible[visible.length - 1];
    });
  }, [visible]);

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden pb-16">
      <header className="bg-white border-b border-gray-100 h-14 flex items-center px-4 shrink-0">
        <h1 className="font-bold text-lg text-gray-800">Learn Log</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바: 320px 고정, 화면 왼쪽 끝 */}
        <div className="w-[320px] shrink-0 bg-[#F5F5F5] flex flex-col border-r border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 shrink-0">
            <button className="text-gray-500 text-lg">☰</button>
            <button className="text-[#00D4E8] text-xl font-bold">+</button>
          </div>

          <div className="px-3 pb-2 shrink-0">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#00D4E8]"
            />
          </div>

          <div className="px-3 py-1 shrink-0">
            <span className="text-xs text-gray-400">질문 (오늘까지 · 시간순)</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                아직 질문 기록이 없어요
              </div>
            ) : (
              visible.map((e, idx) => (
                <button
                  key={`${e.timestamp}-${idx}`}
                  onClick={() => setSelected(e)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 text-sm transition-colors ${
                    selected?.timestamp === e.timestamp && selected?.question === e.question
                      ? 'bg-white font-semibold text-[#00D4E8]'
                      : 'bg-transparent text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium line-clamp-2">{e.question}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{formatTime(e.timestamp)}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 메인 콘텐츠: 사이드바 제외 나머지, 내부는 중앙 정렬 */}
        <div className="flex-1 flex flex-col overflow-y-auto bg-white">
          {selected ? (
            <div className="max-w-3xl mx-auto w-full px-8 py-5 flex flex-col gap-4">
              <div className="flex justify-end">
                <div className="bg-[#00D4E8] text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[80%] whitespace-pre-wrap">
                  {selected.question}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <img src="/icons/logo.png" alt="logo" className="w-8 h-8 object-contain" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-400 mb-1">{formatTime(selected.timestamp)}</div>
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {selected.answer ?? '이 질문에는 저장된 AI 답변이 없어요. (이전 버전 기록이거나 요약 전 기록일 수 있어요.)'}
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 flex gap-4 text-xs text-gray-400">
                <span>{selected.date}</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
              질문을 선택해보세요
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
