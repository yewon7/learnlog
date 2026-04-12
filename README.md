# LearnLog

PDF 학습 뷰어와 질문 기록(Learn Log), 일일 요약(Daily Log)을 제공하는 Next.js 앱입니다. Google Gemini API로 발췌 요약·유사 질문 그룹핑 등을 수행합니다.

## 요구 사항

- Node.js 20 이상 권장
- npm (또는 pnpm, yarn, bun)

## 환경 변수

1. 저장소 루트에 `.env.local` 파일을 만듭니다. (Git에 커밋하지 마세요.)
2. `.env.example`을 참고해 아래 값을 넣습니다.

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_GEMINI_API_KEY` | Google AI Studio 등에서 발급한 Gemini API 키 |

예시:

```bash
cp .env.example .env.local
# .env.local 을 열어 your_api_key_here 를 실제 키로 바꿉니다.
```

`.gitignore`에 `.env*` 패턴이 포함되어 있어 `.env.local` 등 환경 파일은 기본적으로 추적되지 않습니다.

## 설치 및 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 엽니다.

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 (Turbopack) |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 (`build` 후) |
| `npm run lint` | ESLint |

## 배포

- **Vercel**: 저장소 연결 후 Root Directory에서 빌드 명령 `npm run build`, 출력 `.next` 기본 설정. 프로젝트 설정의 Environment Variables에 `NEXT_PUBLIC_GEMINI_API_KEY`를 등록합니다.
- **자체 호스팅(Docker 등)**: `npm run build` 후 `npm run start`. 필요 시 `next.config`에서 `output: 'standalone'`을 켜 이미지에 포함할 수 있습니다(현재는 기본값).

## 기술 스택

- Next.js (App Router), React, TypeScript
- PDF.js(`pdfjs-dist`), Tailwind CSS

## 라이선스

Private 프로젝트로 두거나 저장소 정책에 따릅니다.
