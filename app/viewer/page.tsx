'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
if (!GEMINI_API_KEY) console.warn('[LearnLog] NEXT_PUBLIC_GEMINI_API_KEY가 설정되지 않았습니다. .env.local을 확인해주세요.');;

/* ─── 타입 ─────────────────────────────────────── */
interface SelectionPopup {
  x: number;
  y: number;
  text: string;
}

interface InlineBubble {
  x: number;
  y: number;
  selectedText: string;
  summary: string;
  loading: boolean;
  pinned: boolean;
}

/** 하이라이트 (페이지별·localStorage) */
interface HighlightRecord {
  id: string;
  pageNumber: number;
  text: string;
  /** canvas 크기 대비 비율로 저장 → 해상도 변해도 유지 */
  rects: { x: number; y: number; w: number; h: number }[];
}

/** 코멘트 입력 말풍선 (임시 상태) */
interface CommentBubble {
  x: number;
  y: number;
  selectedText: string;
  commentText: string;
}

/** 고정 말풍선 (페이지별·localStorage) */
interface PinnedBubbleRecord {
  id: string;
  pageNumber: number;
  highlightedText: string;
  aiAnswer: string;
  position: { top: number; left: number };
  type?: 'ai' | 'comment';
}

function pinnedStorageKey(file: string) {
  return `learnlog_pinned_${file}`;
}

function highlightStorageKey(file: string) {
  return `learnlog_highlights_${file}`;
}

function loadHighlightsFromStorage(file: string): HighlightRecord[] {
  if (!file) return [];
  try {
    const raw = localStorage.getItem(highlightStorageKey(file));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h): h is HighlightRecord =>
        typeof h === 'object' && h !== null &&
        typeof h.id === 'string' &&
        typeof h.pageNumber === 'number' &&
        typeof h.text === 'string' &&
        Array.isArray(h.rects)
    );
  } catch {
    return [];
  }
}

function saveHighlightsToStorage(file: string, list: HighlightRecord[]) {
  if (!file) return;
  try { localStorage.setItem(highlightStorageKey(file), JSON.stringify(list)); } catch {}
}

function loadPinnedFromStorage(file: string): PinnedBubbleRecord[] {
  if (!file) return [];
  try {
    const raw = localStorage.getItem(pinnedStorageKey(file));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PinnedBubbleRecord =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as PinnedBubbleRecord).id === 'string' &&
        typeof (p as PinnedBubbleRecord).pageNumber === 'number' &&
        typeof (p as PinnedBubbleRecord).highlightedText === 'string' &&
        typeof (p as PinnedBubbleRecord).aiAnswer === 'string' &&
        typeof (p as PinnedBubbleRecord).position?.top === 'number' &&
        typeof (p as PinnedBubbleRecord).position?.left === 'number'
    );
  } catch {
    return [];
  }
}

function savePinnedToStorage(file: string, list: PinnedBubbleRecord[]) {
  if (!file) return;
  try {
    localStorage.setItem(pinnedStorageKey(file), JSON.stringify(list));
  } catch {}
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  saved?: boolean;
}

interface LearnLogCard {
  id: string;
  concept: string;
  definition: string;
  fullAnswer: string;
  question: string;
  source: string;
  date: string;
  count: number;
}

interface HistoryEntry {
  question: string;
  concept: string;
  date: string;
  timestamp: number;
  /** Ask for AI 요약 답변 (Learn Log 연동) */
  answer?: string;
}

/* ─── Gemini 시스템 지시 (뷰어 답변 공통) ────────────────────────────────── */
const GEMINI_SYSTEM_INSTRUCTION = `너는 학습 도우미이다. 사용자의 질문에 대해 서두 없이 바로 핵심 개념을 설명한다.
말투는 '~이다', '~한다' 체를 사용하고, 마크다운 볼드(**)는 사용하지 않는다.
자료명·파일명·'요약해드릴게요'·'참고하여' 같은 서두나 메타 표현은 출력에 넣지 않는다.
형식: 개념명 / 정의 / 상세 설명 / 핵심 포인트 순서로 작성한다. 단, 짧은 발췌 요약만 요청된 경우에는 이 형식을 생략하고 2~3문장으로 압축한다.`;

/* ─── Gemini 호출 ────────────────────────────────── */
async function callGemini(prompt: string, opts?: { noSystem?: boolean }): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('API 키가 설정되지 않았어요. .env.local을 확인해주세요.');
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };
  if (!opts?.noSystem) {
    body.systemInstruction = { parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }] };
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error('[Gemini Error]', res.status, JSON.stringify(errBody));
    if (res.status === 429) throw new Error('요청이 너무 많아요. 잠시 후 다시 시도해주세요.');
    throw new Error(errBody?.error?.message ?? `AI 응답 오류 (${res.status})`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '응답을 받지 못했어요.';
}

function getTodayStr() {
  return new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '');
}

/** 전체 읽기 답변: 요약 / --- / 심화 */
const FULL_READ_SPLIT = /\n-{3,}\s*\n/;

function splitSummaryAndDeep(text: string): { summary: string; deep: string | null } {
  const parts = text.split(FULL_READ_SPLIT);
  if (parts.length < 2) return { summary: text, deep: null };
  return {
    summary: parts[0].trim(),
    deep: parts.slice(1).join('\n\n').trim() || null,
  };
}

function AiMessageContent({ text }: { text: string }) {
  const { summary, deep } = splitSummaryAndDeep(text);
  if (!deep) {
    return <div className="whitespace-pre-wrap text-sm">{text}</div>;
  }
  return (
    <div className="flex flex-col gap-3">
      <section>
        <p className="text-xs font-semibold text-gray-500 mb-1.5">요약</p>
        <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {summary}
        </div>
      </section>
      <div className="border-t border-dashed border-gray-200" role="separator" />
      <section>
        <p className="text-xs font-semibold text-[#00D4E8] mb-1.5">심화 설명</p>
        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{deep}</div>
      </section>
    </div>
  );
}

/* ─── 메인 컴포넌트 ──────────────────────────────── */
function ViewerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileName = searchParams.get('file') || '';
  const todayStr = getTodayStr();

  /* PDF 상태 */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPageText, setCurrentPageText] = useState('');
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  /* UI 상태 */
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null);
  const [inlineBubble, setInlineBubble] = useState<InlineBubble | null>(null);
  const [commentBubble, setCommentBubble] = useState<CommentBubble | null>(null);
  const [pinnedBubbles, setPinnedBubbles] = useState<PinnedBubbleRecord[]>([]);
  const [highlights, setHighlights] = useState<HighlightRecord[]>([]);
  const [pinDrag, setPinDrag] = useState<{
    id: string;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);

  /* 채팅 모드 상태 */
  const [chatMode, setChatMode] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ─── PDF 로드 ─── */
  useEffect(() => {
    if (!fileName) return;
    let cancelled = false;

    async function loadPdf() {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const stored = localStorage.getItem(`learnlog_pdf_${fileName}`);
      const pdfUrl = stored ?? `/samples/${fileName}`;

      try {
        const doc = await pdfjsLib.getDocument(pdfUrl).promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setTotalPages(doc.numPages);
        }
      } catch (err) {
        console.error('PDF load error:', err);
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [fileName]);

  /* 자료(file) 바뀌면 페이지·고정 말풍선·하이라이트 로드 */
  useEffect(() => {
    if (!fileName) return;
    setCurrentPage(1);
    setPinnedBubbles(loadPinnedFromStorage(fileName));
    setHighlights(loadHighlightsFromStorage(fileName));
  }, [fileName]);

  /* ─── 페이지 렌더링 (canvas + text layer) ─── */
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !textLayerRef.current) return;
    let cancelled = false;

    async function renderPage() {
      const page = await pdfDoc.getPage(currentPage);
      const container = pdfContainerRef.current;
      const containerWidth = container ? container.clientWidth - 32 : 700;
      const viewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      /* canvas */
      const canvas = canvasRef.current!;
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

      if (cancelled) return;
      setCanvasSize({ w: scaledViewport.width, h: scaledViewport.height });

      /* text layer – manual span positioning to match canvas exactly */
      const textLayerDiv = textLayerRef.current!;
      textLayerDiv.innerHTML = '';
      textLayerDiv.style.width = `${scaledViewport.width}px`;
      textLayerDiv.style.height = `${scaledViewport.height}px`;

      const textContent = await page.getTextContent();
      if (cancelled) return;

      const { Util } = await import('pdfjs-dist');

      // Get the canvas-to-screen transform (same matrix used when rendering to canvas)
      const vt = scaledViewport.transform; // [sx, 0, 0, sy, tx, ty]

      const spans: { el: HTMLSpanElement; expectedWidth: number }[] = [];

      for (const item of textContent.items as any[]) {
        if (!('str' in item) || !item.str) continue;

        // Apply viewport transform to the text item's PDF transform matrix
        // Result tx is in CSS pixels (matching canvas coordinates exactly)
        const tx = Util.transform(vt, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]);
        if (fontHeight < 1) continue;

        const angle = Math.atan2(tx[1], tx[0]);

        // Baseline is at tx[4], tx[5]; move up by ascent (≈80% of fontHeight)
        const ascent = fontHeight * 0.8;
        const left = tx[4];
        const top = tx[5] - ascent;

        const span = document.createElement('span');
        span.textContent = item.str;
        span.style.cssText = [
          'position:absolute',
          `left:${left.toFixed(2)}px`,
          `top:${top.toFixed(2)}px`,
          `font-size:${fontHeight.toFixed(2)}px`,
          'line-height:1',
          'color:transparent',
          'white-space:pre',
          'cursor:text',
          'transform-origin:0% 0%',
          angle !== 0 ? `transform:rotate(${(angle * 180 / Math.PI).toFixed(2)}deg)` : '',
        ].filter(Boolean).join(';');

        textLayerDiv.appendChild(span);

        // item.width is in PDF user units; multiply by scale to get CSS pixels
        const expectedWidth = (item.width ?? 0) * scale;
        if (expectedWidth > 0 && item.str.length > 1) {
          spans.push({ el: span, expectedWidth });
        }
      }

      // Second pass: scale text horizontally to match PDF-specified widths.
      // Batch reads first (one reflow), then batch writes to avoid layout thrashing.
      if (spans.length > 0) {
        const measurements = spans.map(({ el, expectedWidth }) => ({
          el,
          expectedWidth,
          actualWidth: el.getBoundingClientRect().width,
        }));
        measurements.forEach(({ el, expectedWidth, actualWidth }) => {
          if (actualWidth > 1) {
            const sx = expectedWidth / actualWidth;
            const rot = el.style.transform;
            el.style.transform = rot
              ? `${rot} scaleX(${sx.toFixed(4)})`
              : `scaleX(${sx.toFixed(4)})`;
          }
        });
      }

      /* page text for AI context */
      const text = textContent.items.map((item: any) => item.str).join(' ');
      if (!cancelled) setCurrentPageText(text);
    }

    renderPage();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage]);

  /* ─── 채팅 자동 스크롤 ─── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /* ─── 고정 말풍선 드래그 ─── */
  useEffect(() => {
    if (!pinDrag) {
      document.body.style.cursor = '';
      return;
    }
    document.body.style.cursor = 'grabbing';
    const maxLeft = Math.max(0, canvasSize.w - 288);

    function onMove(e: MouseEvent) {
      const drag = pinDrag;
      if (!drag) return;
      let left = drag.origLeft + (e.clientX - drag.startX);
      let top = drag.origTop + (e.clientY - drag.startY);
      left = Math.max(0, Math.min(left, maxLeft));
      top = Math.max(0, top);
      setPinnedBubbles(prev =>
        prev.map(b => (b.id === drag.id ? { ...b, position: { left, top } } : b))
      );
    }

    function onUp() {
      setPinDrag(null);
      setPinnedBubbles(prev => {
        if (fileName) savePinnedToStorage(fileName, prev);
        return prev;
      });
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
  }, [pinDrag, canvasSize.w, fileName]);

  /* ─── 텍스트 선택 감지 ─── */
  function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    // 팝업 버튼 클릭은 무시
    if ((e.target as HTMLElement).closest('[data-popup]')) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 2) {
      setSelectionPopup(null);
      return;
    }

    const container = pdfContainerRef.current!;
    const containerRect = container.getBoundingClientRect();
    setSelectionPopup({
      x: e.clientX - containerRect.left + container.scrollLeft,
      y: e.clientY - containerRect.top + container.scrollTop,
      text,
    });
    setInlineBubble(null);
  }

  /* ─── Ask for AI ─── */
  async function handleAskAI() {
    if (!selectionPopup) return;
    const { text, x, y } = selectionPopup;
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();

    // 로딩 말풍선 표시
    setInlineBubble({ x, y, selectedText: text, summary: '', loading: true, pinned: false });

    const prompt = `다음 발췌에 대해 서두 없이 바로 2~3문장으로만 압축 설명한다.

발췌:
${text}`;

    try {
      const summary = await callGemini(prompt);
      setInlineBubble(prev => prev ? { ...prev, summary, loading: false } : null);

      const entry: HistoryEntry = {
        question: text,
        concept: text.slice(0, 30),
        date: todayStr,
        timestamp: Date.now(),
        answer: summary,
      };
      try {
        const raw = localStorage.getItem('learnlog_history');
        const hist: HistoryEntry[] = raw ? JSON.parse(raw) : [];
        hist.push(entry);
        localStorage.setItem('learnlog_history', JSON.stringify(hist));
      } catch {}
    } catch (err) {
      const msg = err instanceof Error ? err.message : '오류가 발생했어요.';
      setInlineBubble(prev => prev ? { ...prev, summary: msg, loading: false } : null);

      const entry: HistoryEntry = {
        question: text,
        concept: text.slice(0, 30),
        date: todayStr,
        timestamp: Date.now(),
        answer: msg,
      };
      try {
        const raw = localStorage.getItem('learnlog_history');
        const hist: HistoryEntry[] = raw ? JSON.parse(raw) : [];
        hist.push(entry);
        localStorage.setItem('learnlog_history', JSON.stringify(hist));
      } catch {}
    }
  }

  /* ─── Highlight ─── */
  function handleHighlight() {
    if (!selectionPopup || !canvasRef.current) {
      setSelectionPopup(null);
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setSelectionPopup(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects());
    const rects = clientRects
      .filter(r => r.width > 1 && r.height > 1)
      .map(r => ({
        x: (r.left - canvasRect.left) / canvasRect.width,
        y: (r.top - canvasRect.top) / canvasRect.height,
        w: r.width / canvasRect.width,
        h: r.height / canvasRect.height,
      }));

    if (rects.length > 0) {
      const record: HighlightRecord = {
        id: uuidv4(),
        pageNumber: currentPage,
        text: selectionPopup.text,
        rects,
      };
      setHighlights(prev => {
        const next = [...prev, record];
        if (fileName) saveHighlightsToStorage(fileName, next);
        return next;
      });
    }
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  }

  /* ─── Add Comment ─── */
  function handleAddComment() {
    if (!selectionPopup) return;
    setCommentBubble({
      x: selectionPopup.x,
      y: selectionPopup.y,
      selectedText: selectionPopup.text,
      commentText: '',
    });
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  }

  function handlePinComment() {
    if (!commentBubble || !commentBubble.commentText.trim() || !fileName) return;
    const left = Math.min(commentBubble.x, Math.max(0, canvasSize.w - 300));
    const top = commentBubble.y + 12;
    const record: PinnedBubbleRecord = {
      id: uuidv4(),
      pageNumber: currentPage,
      highlightedText: commentBubble.selectedText,
      aiAnswer: commentBubble.commentText.trim(),
      position: { top, left },
      type: 'comment',
    };
    setPinnedBubbles(prev => {
      const next = [...prev, record];
      savePinnedToStorage(fileName, next);
      return next;
    });
    setCommentBubble(null);
  }

  /* ─── 전체 읽기: 채팅 모드 진입 ─── */
  function handleFullRead() {
    if (!inlineBubble) return;
    // 채팅 모드 초기화
    setChatMessages([
      { role: 'user', text: inlineBubble.selectedText },
    ]);
    setChatMode(true);
    setInlineBubble(null);

    const prompt = `사용자에게 이미 짧은 요약이 제공된 상태이다. 아래 질문·참고 텍스트를 바탕으로
심화 설명만 작성한다. 요약 문장은 다시 쓰지 않는다.
심화 설명에는 개념의 배경, 예시, 관련 개념을 포함한다.
말투는 '~이다', '~한다' 체로 통일한다. 마크다운 볼드(**)는 쓰지 않는다.

질문: ${inlineBubble.selectedText}

페이지에서 추출한 참고 텍스트:
${currentPageText.slice(0, 800)}`;

    setChatLoading(true);
    callGemini(prompt, { noSystem: true }).then(deepOnly => {
      const summaryPart = inlineBubble.summary.trim();
      const deepPart = deepOnly.trim();
      const combined = `${summaryPart}\n---\n${deepPart}`;
      setChatMessages(prev => [...prev, { role: 'ai', text: combined }]);
      setChatLoading(false);
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : '오류가 발생했어요.';
      setChatMessages(prev => [...prev, { role: 'ai', text: msg }]);
      setChatLoading(false);
    });
  }

  /* ─── 고정하기 ─── */
  function handlePin() {
    if (!inlineBubble || inlineBubble.loading || !fileName) return;
    const left = Math.min(inlineBubble.x, Math.max(0, canvasSize.w - 300));
    const top = inlineBubble.y + 12;
    const record: PinnedBubbleRecord = {
      id: uuidv4(),
      pageNumber: currentPage,
      highlightedText: inlineBubble.selectedText,
      aiAnswer: inlineBubble.summary,
      position: { top, left },
    };
    setPinnedBubbles(prev => {
      const next = [...prev, record];
      savePinnedToStorage(fileName, next);
      return next;
    });
    setInlineBubble(null);
  }

  function removePinnedBubble(id: string) {
    if (!fileName) return;
    setPinnedBubbles(prev => {
      const next = prev.filter(b => b.id !== id);
      savePinnedToStorage(fileName, next);
      return next;
    });
  }

  /* ─── 채팅 모드: 추가 질문 전송 ─── */
  async function handleChatSend() {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: question }]);
    setChatLoading(true);

    const prompt = `질문에 답한다.

질문: ${question}

페이지에서 추출한 참고 텍스트:
${currentPageText.slice(0, 500)}`;

    try {
      const answer = await callGemini(prompt);
      setChatMessages(prev => [...prev, { role: 'ai', text: answer }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '오류가 발생했어요.';
      setChatMessages(prev => [...prev, { role: 'ai', text: msg }]);
    } finally {
      setChatLoading(false);
    }
  }

  /* ─── 채팅에서 LearnLog 저장 ─── */
  async function handleSaveToLearnLog(msg: ChatMessage, idx: number) {
    const question = chatMessages.slice(0, idx).reverse().find(m => m.role === 'user')?.text ?? '';
    const extractPrompt = `다음 AI 답변에서 핵심 개념명과 한 줄 정의를 추출해줘.
JSON 형식으로만 응답: {"concept":"개념명","definition":"한 줄 정의"}
답변: ${msg.text}`;
    try {
      const raw = await callGemini(extractPrompt, { noSystem: true });
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : { concept: question.slice(0, 20), definition: msg.text.slice(0, 60) };
      const card: LearnLogCard = {
        id: uuidv4(),
        concept: parsed.concept,
        definition: parsed.definition,
        fullAnswer: msg.text,
        question,
        source: fileName,
        date: todayStr,
        count: 1,
      };
      const existing = localStorage.getItem('learnlog_cards');
      const cards: LearnLogCard[] = existing ? JSON.parse(existing) : [];
      const dupIdx = cards.findIndex(c => c.concept === card.concept);
      if (dupIdx >= 0) cards[dupIdx].count = (cards[dupIdx].count || 1) + 1;
      else cards.push(card);
      localStorage.setItem('learnlog_cards', JSON.stringify(cards));
      setChatMessages(prev => prev.map((m, i) => i === idx ? { ...m, saved: true } : m));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '저장 중 오류가 발생했어요.';
      alert(msg);
    }
  }

  /* ─── 렌더: 채팅 모드 ─── */
  if (chatMode) {
    return (
      <div className="flex flex-col h-screen bg-white">
        {/* 채팅 헤더 */}
        <header className="bg-[#00D4E8] h-14 flex items-center px-4 shrink-0">
          <button
            onClick={() => setChatMode(false)}
            className="text-white text-sm flex items-center gap-1"
          >
            <span className="text-xl font-bold">&#8249;</span>
            <span>강의안으로 돌아가기</span>
          </button>
          <span className="ml-auto text-white text-sm opacity-80">{todayStr}</span>
        </header>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {chatMessages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} flex-col`}>
              {msg.role === 'user' ? (
                <div className="bg-[#00D4E8] text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[70%] self-end">
                  {msg.text}
                </div>
              ) : (
                <div className="max-w-[85%]">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#00D4E8] flex items-center justify-center shrink-0 text-white text-xs font-bold">AI</div>
                    <div className="bg-white border border-gray-100 shadow-sm text-sm px-4 py-3 rounded-2xl rounded-tl-sm leading-relaxed">
                      <AiMessageContent text={msg.text} />
                    </div>
                  </div>
                  {!msg.saved && (
                    <div className="flex gap-2 mt-2 ml-10">
                      <button
                        onClick={() => handleSaveToLearnLog(msg, idx)}
                        className="text-xs py-1.5 px-3 rounded-lg bg-[#F0FAFA] text-[#00D4E8] font-semibold border border-[#00D4E8]/30"
                      >
                        ✅ LearnLog에 저장
                      </button>
                    </div>
                  )}
                  {msg.saved && (
                    <div className="ml-10 mt-1 text-xs text-[#00D4E8]">✅ 저장되었어요!</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {chatLoading && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#00D4E8] flex items-center justify-center text-white text-xs font-bold shrink-0">AI</div>
              <div className="bg-white border border-gray-100 shadow-sm px-4 py-2 rounded-2xl rounded-tl-sm text-sm text-gray-400 animate-pulse">
                생각 중...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* 입력창 */}
        <div className="border-t border-gray-100 p-3 bg-white shrink-0">
          <div className="flex items-center gap-2 bg-[#F0FAFA] rounded-2xl px-4 py-2.5">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleChatSend(); }}
              placeholder="추가 질문하기"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400"
            />
            <button
              type="button"
              onClick={handleChatSend}
              disabled={!chatInput.trim() || chatLoading}
              className="w-9 h-9 shrink-0 rounded-full bg-[#00D4E8] text-white flex items-center justify-center disabled:opacity-40"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── 렌더: PDF 뷰어 모드 ─── */
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* 헤더 */}
      <header className="bg-[#00D4E8] h-14 flex items-center px-4 gap-3 shrink-0">
        <button onClick={() => router.back()} className="text-white text-2xl font-bold">&#8249;</button>
        <h1 className="text-white font-bold text-base flex-1 truncate text-center pr-6">{fileName}</h1>
      </header>

      {/* PDF 영역 */}
      <div
        ref={pdfContainerRef}
        className="flex-1 overflow-y-auto relative bg-gray-50"
        onMouseUp={handleMouseUp}
      >
        {/* canvas + text layer */}
        <div className="p-4 flex justify-center">
          <div className="relative shadow-md rounded">
            <canvas ref={canvasRef} />
            {/* 하이라이트 오버레이 — canvas와 동일 좌표계 */}
            {canvasSize.w > 0 && highlights
              .filter(h => h.pageNumber === currentPage)
              .flatMap(h =>
                h.rects.map((r, ri) => (
                  <div
                    key={`${h.id}-${ri}`}
                    className="absolute pointer-events-none"
                    style={{
                      left: r.x * canvasSize.w,
                      top: r.y * canvasSize.h,
                      width: r.w * canvasSize.w,
                      height: r.h * canvasSize.h,
                      backgroundColor: 'rgba(0, 212, 232, 0.28)',
                      zIndex: 1,
                    }}
                  />
                ))
              )
            }
            {/* text layer - selectable overlay */}
            <div ref={textLayerRef} className="textLayer" />

            {/* 인라인 말풍선 */}
            {inlineBubble && (
              <div
                data-popup="true"
                className="absolute z-20 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 w-80"
                style={{
                  left: Math.min(inlineBubble.x, canvasSize.w - 330),
                  top: inlineBubble.y + 12,
                }}
              >
                {inlineBubble.loading ? (
                  <div className="text-sm text-gray-400 animate-pulse">요약 중...</div>
                ) : (
                  <>
                    <p className="text-sm text-gray-700 leading-relaxed mb-3">{inlineBubble.summary}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleFullRead}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-[#00D4E8] text-white font-semibold"
                      >
                        전체 읽기
                      </button>
                      <button
                        onClick={handlePin}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-[#F0FAFA] text-[#00D4E8] font-semibold border border-[#00D4E8]/30"
                      >
                        고정하기
                      </button>
                    </div>
                  </>
                )}
                <button
                  onClick={() => setInlineBubble(null)}
                  className="absolute top-2 right-3 text-gray-300 hover:text-gray-500 text-sm"
                >
                  ✕
                </button>
              </div>
            )}

            {/* 코멘트 입력 말풍선 */}
            {commentBubble && (
              <div
                data-popup="true"
                className="absolute z-20 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 w-80"
                style={{
                  left: Math.min(commentBubble.x, canvasSize.w - 330),
                  top: commentBubble.y + 12,
                }}
              >
                <p className="text-xs text-gray-400 mb-2 truncate">
                  "{commentBubble.selectedText.slice(0, 35)}{commentBubble.selectedText.length > 35 ? '…' : ''}"
                </p>
                <textarea
                  autoFocus
                  value={commentBubble.commentText}
                  onChange={e => setCommentBubble(prev => prev ? { ...prev, commentText: e.target.value } : null)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePinComment(); } }}
                  placeholder="코멘트를 입력하세요..."
                  rows={3}
                  className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2 outline-none resize-none focus:border-[#00D4E8] mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handlePinComment}
                    disabled={!commentBubble.commentText.trim()}
                    className="flex-1 text-xs py-1.5 rounded-lg bg-[#00D4E8] text-white font-semibold disabled:opacity-40"
                  >
                    고정하기
                  </button>
                  <button
                    onClick={() => setCommentBubble(null)}
                    className="flex-1 text-xs py-1.5 rounded-lg bg-gray-100 text-gray-500 font-semibold"
                  >
                    취소
                  </button>
                </div>
                <button
                  onClick={() => setCommentBubble(null)}
                  className="absolute top-2 right-3 text-gray-300 hover:text-gray-500 text-sm"
                >
                  ✕
                </button>
              </div>
            )}

            {/* 고정된 말풍선 — 현재 페이지만 */}
            {pinnedBubbles
              .filter(b => b.pageNumber === currentPage)
              .map(b => (
              <div
                key={b.id}
                data-popup="true"
                className={`absolute z-10 rounded-2xl shadow-lg w-72 overflow-hidden border ${b.type === 'comment' ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200'}`}
                style={{
                  left: b.position.left,
                  top: b.position.top,
                }}
              >
                <div
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 border-b cursor-grab active:cursor-grabbing select-none shrink-0 ${b.type === 'comment' ? 'border-blue-200/90 bg-blue-100/50' : 'border-yellow-200/90 bg-amber-100/50'}`}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest('[data-pin-close]')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setPinDrag({
                      id: b.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      origLeft: b.position.left,
                      origTop: b.position.top,
                    });
                  }}
                  title="드래그하여 이동"
                >
                  <span className="flex gap-0.5 text-gray-500" aria-hidden>
                    <span className="block w-1 h-3 rounded-sm bg-current opacity-60" />
                    <span className="block w-1 h-3 rounded-sm bg-current opacity-60" />
                    <span className="block w-1 h-3 rounded-sm bg-current opacity-60" />
                  </span>
                  <button
                    type="button"
                    data-pin-close
                    onClick={() => removePinnedBubble(b.id)}
                    className="text-gray-400 hover:text-gray-600 text-sm px-1 py-0.5 rounded cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-3 pt-2">
                  <p className="text-xs text-gray-500 mb-1 line-clamp-2" title={b.highlightedText}>
                    “{b.highlightedText}”
                  </p>
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{b.aiAnswer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 선택 팝업 메뉴 */}
        {selectionPopup && (
          <div
            data-popup="true"
            className="absolute z-30 bg-white border border-gray-200 rounded-xl shadow-lg flex gap-1 p-1"
            style={{
              left: selectionPopup.x - 80,
              top: selectionPopup.y - 52,
            }}
          >
            <button
              data-popup="true"
              onClick={handleAskAI}
              className="px-3 py-1.5 text-xs bg-[#00D4E8] text-white rounded-lg font-semibold whitespace-nowrap"
            >
              Ask for AI
            </button>
            <button
              data-popup="true"
              onClick={handleHighlight}
              className="px-3 py-1.5 text-xs bg-yellow-400 text-white rounded-lg font-semibold whitespace-nowrap"
            >
              Highlight
            </button>
            <button
              data-popup="true"
              onClick={handleAddComment}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg font-semibold whitespace-nowrap"
            >
              Add Comment
            </button>
          </div>
        )}

        {/* 페이지 컨트롤 */}
        <div className="sticky bottom-0 left-0 right-0 bg-white/90 border-t border-gray-100 flex items-center justify-center gap-4 py-2 z-20">
          <button
            onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); setInlineBubble(null); setSelectionPopup(null); setCommentBubble(null); }}
            disabled={currentPage <= 1}
            className="px-4 py-1.5 rounded-lg bg-[#F0FAFA] text-[#00D4E8] font-bold disabled:opacity-30 text-sm"
          >
            이전
          </button>
          <span className="text-sm text-gray-500">{currentPage} / {totalPages || '?'}</span>
          <button
            onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); setInlineBubble(null); setSelectionPopup(null); setCommentBubble(null); }}
            disabled={currentPage >= totalPages}
            className="px-4 py-1.5 rounded-lg bg-[#F0FAFA] text-[#00D4E8] font-bold disabled:opacity-30 text-sm"
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ViewerPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen text-[#00D4E8]">로딩 중...</div>
    }>
      <ViewerContent />
    </Suspense>
  );
}
