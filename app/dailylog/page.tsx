'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import BottomNav from '../components/BottomNav';

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
if (!GEMINI_API_KEY) console.warn('[LearnLog] NEXT_PUBLIC_GEMINI_API_KEY가 설정되지 않았습니다. .env.local을 확인해주세요.');;

interface HistoryEntry {
  question: string;
  concept: string;
  date: string;
  timestamp: number;
  answer?: string;
}

interface GroupedTopItem {
  representative: string;
  count: number;
}

function parseJsonFromAi<T>(raw: string): T | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

interface GapItem {
  title: string;
  description: string;
}

interface GapAnalysis {
  gaps: GapItem[];
  closing: string;
}

function getTodayStr() {
  return new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '');
}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('API 키가 설정되지 않았어요. .env.local을 확인해주세요.');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) {
    if (res.status === 429) throw new Error('요청이 너무 많아요. 잠시 후 다시 시도해주세요.');
    throw new Error(`AI 응답 오류 (${res.status})`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export default function DailyLogPage() {
  const [top3, setTop3] = useState<{ representative: string; count: number }[]>([]);
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasHistory, setHasHistory] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const today = getTodayStr();

  useEffect(() => {
    async function analyze() {
      try {
        const raw = localStorage.getItem('learnlog_history');
        const history: HistoryEntry[] = raw ? JSON.parse(raw) : [];
        const todayEntries = history.filter(h => h.date === today);

        if (todayEntries.length === 0) {
          setLoading(false);
          return;
        }
        setHasHistory(true);

        const questionsList = todayEntries.map(e => e.question);
        const fingerprint = todayEntries.map(e => String(e.timestamp)).sort().join(',');
        const top3CacheKey = `learnlog_top3_group_${today}_${fingerprint}`;

        let top3FromCache: { representative: string; count: number }[] | null = null;
        try {
          const rawCached = localStorage.getItem(top3CacheKey);
          if (rawCached) {
            const parsed = JSON.parse(rawCached) as unknown;
            if (
              Array.isArray(parsed) &&
              parsed.length > 0 &&
              typeof (parsed[0] as { representative?: string }).representative === 'string'
            ) {
              top3FromCache = parsed as { representative: string; count: number }[];
            }
          }
        } catch {
          top3FromCache = null;
        }

        if (top3FromCache) {
          setTop3(top3FromCache);
        } else {
          const groupPrompt = `다음 질문 목록에서 의미가 같거나 유사한 질문끼리 그룹으로 묶어줘.
오타, 괄호, 토씨 차이는 무시하고 핵심 개념이 같으면 같은 그룹으로 처리해.
목록에 같은 의미의 질문이 여러 번 나오면 그 횟수를 합산해 count에 넣어.

질문 목록 (JSON 배열):
${JSON.stringify(questionsList)}

결과는 JSON으로만 응답해:
{"groups":[{"representative":"대표질문명","count":숫자}]}`;

          try {
            const rawGroup = await callGemini(groupPrompt);
            const parsed = parseJsonFromAi<{ groups: GroupedTopItem[] }>(rawGroup);
            const groups = parsed?.groups?.filter(g => g.representative && typeof g.count === 'number') ?? [];
            const sortedGroups = [...groups].sort((a, b) => b.count - a.count);
            const top = sortedGroups.slice(0, 3).map(g => ({ representative: g.representative, count: g.count }));
            if (top.length > 0) {
              setTop3(top);
              try {
                localStorage.setItem(top3CacheKey, JSON.stringify(top));
              } catch {}
            } else {
              throw new Error('empty groups');
            }
          } catch {
            const conceptCount: Record<string, number> = {};
            for (const entry of todayEntries) {
              const key = entry.concept || entry.question;
              conceptCount[key] = (conceptCount[key] || 0) + 1;
            }
            const fallback = Object.entries(conceptCount)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([representative, count]) => ({ representative, count }));
            setTop3(fallback);
          }
        }

        const cacheKey = `learnlog_gap_${today}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setGapAnalysis(JSON.parse(cached));
          setLoading(false);
          return;
        }

        // Gemini: gap analysis
        const conceptList = todayEntries.map(e => e.concept || e.question).join(', ');
        const prompt = `다음은 사용자가 오늘 학습 중 질문한 개념 목록이야: ${conceptList}.
이 개념들을 이해하지 못한 공통적인 배경 지식 부족 원인 2가지를 찾아줘.
각각에 대해 2-3문장으로 간단히 설명해줘.
마지막에 '이 개념들을 먼저 보완하면 오늘 어려웠던 개념들이 더 쉽게 이해될 거예요!' 문장 추가.
한국어로. JSON 형식으로만 응답:
{
  "gaps": [
    { "title": "배경지식명", "description": "2-3문장 설명" },
    { "title": "배경지식명", "description": "2-3문장 설명" }
  ],
  "closing": "마지막 문장"
}`;

        const raw2 = await callGemini(prompt);
        const match = raw2.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed: GapAnalysis = JSON.parse(match[0]);
          setGapAnalysis(parsed);
          localStorage.setItem(cacheKey, JSON.stringify(parsed));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI 분석 중 오류가 발생했어요.';
        setApiError(msg);
      } finally {
        setLoading(false);
      }
    }

    analyze();
  }, [today]);

  return (
    <div className="flex flex-col min-h-screen pb-16" style={{ background: '#E8FAFA' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 h-14 flex items-center justify-between px-4 shrink-0">
        <h1 className="font-bold text-lg text-gray-800">Daily Log</h1>
        <button className="w-8 h-8 rounded-full bg-[#00D4E8] text-white text-xs font-bold flex items-center justify-center">
          Y
        </button>
      </header>

      <div className="flex-1 px-4 py-5 flex flex-col gap-6">
        {/* Section 1: Top 3 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <Image src="/icons/top3.png" alt="trophy" width={36} height={36} />
            <h2 className="text-lg font-bold leading-snug">
              What kept you{' '}
              <span className="text-green-500 font-extrabold">curious</span>{' '}
              today?
            </h2>
          </div>

          {!hasHistory && !loading ? (
            <div className="text-center text-gray-400 text-sm py-4">오늘 학습 기록이 없어요</div>
          ) : loading ? (
            <div className="flex gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex-1 h-20 bg-white/60 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex gap-3">
              {top3.map((item, idx) => (
                <div
                  key={idx}
                  className="flex-1 bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1"
                >
                  <span className="text-xs text-gray-400 font-semibold">
                    {['🥇', '🥈', '🥉'][idx]} {idx + 1}위
                  </span>
                  <span className="text-sm font-bold text-gray-700 text-center leading-tight">
                    {item.representative.length > 20 ? `${item.representative.slice(0, 20)}…` : item.representative}
                  </span>
                  <span className="text-xs text-[#00D4E8]">{item.count}회 질문</span>
                </div>
              ))}
              {top3.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-4 w-full">오늘 학습 기록이 없어요</div>
              )}
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="flex items-center justify-center text-[#00D4E8] font-bold text-lg tracking-widest">&gt;&gt;</div>

        {/* Section 2: Common Knowledge Gaps */}
        <section>
          <h2 className="text-lg font-bold mb-3" style={{ fontStyle: 'italic' }}>
            Common Knowledge Gaps
          </h2>

          {apiError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-500">{apiError}</div>
          ) : !hasHistory && !loading ? (
            <div className="text-center text-gray-400 text-sm py-4">분석할 학습 기록이 없어요</div>
          ) : loading ? (
            <div className="flex flex-col gap-3">
              <div className="h-6 bg-white/60 rounded-xl animate-pulse w-2/3" />
              <div className="h-6 bg-white/60 rounded-xl animate-pulse w-1/2" />
              <div className="h-4 bg-white/60 rounded-xl animate-pulse w-full mt-2" />
            </div>
          ) : gapAnalysis ? (
            <div className="flex flex-col gap-2">
              {gapAnalysis.gaps.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[#00D4E8] font-bold text-sm">→</span>
                  <span className="font-bold text-gray-700 text-sm">{g.title}</span>
                </div>
              ))}
              {gapAnalysis.closing && (
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  {gapAnalysis.closing}
                </p>
              )}
            </div>
          ) : null}
        </section>

        {/* Divider */}
        {gapAnalysis && (
          <>
            <div className="flex items-center justify-center text-[#00D4E8] font-bold text-lg tracking-widest">&gt;&gt;</div>

            {/* Section 3: Gap cards */}
            <section className="flex flex-col gap-4">
              {gapAnalysis.gaps.map((g, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                  <h3 className="font-bold text-[#00D4E8] text-lg mb-2">
                    {g.title}이란?
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{g.description}</p>
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
