# Timebox

브레인덤프, 오늘의 Big 3, 15분 단위 일정 배치, 실행 시간 기록과 하루 회고를 한 화면에서 이어가는 타임박싱 웹서비스입니다.

## 실행

```bash
npm install
npm run dev
```

Supabase 연결 전에는 데모 데이터로 제품 흐름을 확인할 수 있습니다. 실제 계정과 영구 저장을 연결하려면 `.env.example`을 기준으로 환경 변수를 설정하고 `supabase/migrations`의 SQL을 순서대로 적용합니다.

## 주요 구성

- Next.js App Router와 React Server Components
- Tailwind CSS 및 반응형 모바일 레이아웃
- Zustand 기반 플래너 편집 상태
- dnd-kit 기반 작업·타임블록 드래그앤드롭
- Supabase Auth, Postgres 스키마와 RLS 정책

## 검사

```bash
npm run typecheck
npm run build
```
