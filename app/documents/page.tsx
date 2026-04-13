'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import BottomNav from '../components/BottomNav';

type SortType = '날짜' | '이름' | '유형';

interface FileItem {
  name: string;
  type: 'folder' | 'pdf';
  /** 표시명과 달리 /viewer?file=·/samples/ 에 쓰는 실제 파일명 */
  viewerFileName?: string;
}

interface FolderItem {
  name: string;
  type: 'folder';
  children: FileItem[];
}

type RootItem = FolderItem | { name: string; type: 'pdf' };

/* ─── 폴더 구조 정의 ─── */
const ROOT_ITEMS: RootItem[] = [
  {
    name: '빅데이터 분석기사',
    type: 'folder',
    children: [
      {
        name: '빅분기 1과목',
        type: 'pdf',
        viewerFileName: 'sample1.pdf',
      },
      {
        name: '빅분기 2과목',
        type: 'pdf',
        viewerFileName: 'sample2.pdf',
      },
    ],
  },
];

const UPLOADS_KEY = 'learnlog_uploads';

export default function DocumentsPage() {
  const router = useRouter();
  const [sort, setSort] = useState<SortType>('날짜');
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<FileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UPLOADS_KEY);
      if (raw) setUploadedFiles(JSON.parse(raw));
    } catch {}
  }, []);

  /* 현재 보여줄 아이템 목록 */
  const baseItems: FileItem[] = currentFolder
    ? currentFolder.children
    : ROOT_ITEMS.map(item => ({ name: item.name, type: item.type }));

  /* 업로드 PDF는 루트·폴더 안 모두에서 동일 목록으로 표시 */
  const allItems: FileItem[] = [...baseItems, ...uploadedFiles];

  const sorted = [...allItems].sort((a, b) => {
    if (sort === '이름') return a.name.localeCompare(b.name);
    if (sort === '유형') return a.type.localeCompare(b.type);
    return 0;
  });

  function handleItemClick(item: FileItem) {
    if (item.type === 'folder') {
      const found = ROOT_ITEMS.find(r => r.name === item.name && r.type === 'folder') as FolderItem | undefined;
      if (found) setCurrentFolder(found);
    } else {
      const file = item.viewerFileName ?? item.name;
      router.push(`/viewer?file=${encodeURIComponent(file)}`);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const newFile: FileItem = { name: file.name, type: 'pdf' };
      const updated = [...uploadedFiles, newFile];
      setUploadedFiles(updated);
      localStorage.setItem(UPLOADS_KEY, JSON.stringify(updated));
      localStorage.setItem(`learnlog_pdf_${file.name}`, dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const iconSrc = (item: FileItem) =>
    item.type === 'folder' ? '/icons/folder.png' : '/icons/document.png';

  return (
    <div className="flex flex-col min-h-screen bg-white pb-16">
      {/* 헤더 */}
      <header className="bg-[#00D4E8] h-14 flex items-center px-4 gap-3">
        {currentFolder && (
          <button
            onClick={() => setCurrentFolder(null)}
            className="text-white text-2xl font-bold leading-none"
          >
            &#8249;
          </button>
        )}
        <h1 className="text-white font-bold text-base flex-1 text-center truncate pr-6">
          {currentFolder ? currentFolder.name : 'Documents'}
        </h1>
      </header>

      {/* 중앙 정렬 콘텐츠 영역 */}
      <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 px-8">
        {/* 정렬 탭 */}
        <div className="flex items-center justify-between py-2 border-b border-gray-100">
          <div className="flex gap-4">
            {(['날짜', '이름', '유형'] as SortType[]).map(s => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`text-sm pb-0.5 ${sort === s ? 'text-[#00D4E8] font-semibold border-b-2 border-[#00D4E8]' : 'text-gray-400'}`}
              >
                {s}
              </button>
            ))}
          </div>
          <button className="text-xs text-gray-400">목록으로 보기</button>
        </div>

        {/* 그리드 */}
        <div className="flex-1 py-4 grid grid-cols-4 gap-4 content-start">
          {sorted.map(item => (
            <button
              key={`${item.name}-${item.viewerFileName ?? ''}`}
              onClick={() => handleItemClick(item)}
              className="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-[#F0FAFA] transition-colors"
            >
              <Image
                src={iconSrc(item)}
                alt={item.name}
                width={56}
                height={56}
                sizes="56px"
                className={
                  item.type === 'folder'
                    ? 'h-[100px] w-[100px] shrink-0'
                    : 'box-border h-23 w-23 shrink-0 object-contain object-center p-1'
                }
              />
              <span className="text-xs text-center text-gray-600 break-all leading-tight">
                {item.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 업로드 버튼 */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="fixed bottom-20 right-5 w-12 h-12 rounded-full bg-[#00D4E8] text-white text-2xl flex items-center justify-center shadow-lg hover:bg-[#00bcd4] transition-colors"
      >
        +
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <BottomNav />
    </div>
  );
}
