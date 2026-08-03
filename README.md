# Timebox

브레인덤프에서 할 일을 꺼내고, 오늘의 핵심 업무 3가지를 정한 뒤, 15분 단위 일정에 배치하고 회고하는 반응형 타임박싱 웹서비스입니다.

## 현재 구현된 기능

- 이메일 기반 Supabase 회원가입·로그인
- 날짜별 계획 작성과 이전/다음 날짜 이동
- 완료 전까지 날짜와 무관하게 유지되는 브레인덤프
- 작업별 태그와 예상 시간 설정
- 오늘의 핵심 업무(MIT) 최대 3개 선택 및 일정표 강조
- 15분·30분 눈금의 드래그 앤 드롭 일정 배치
- 블록 이동, 길이 조절, 버퍼 추가, 완료 및 실제 수행 시간 기록
- 계획 확정 이후의 생성·이동·크기 변경·완료·삭제 이력 저장
- 일기와 기분 자동 저장
- 하루·주·월·분기·연간·전체 통계와 기록 검색
- 30일 동안 유효한 읽기 전용 일정 공유 링크
- 종이 플래너 모드와 일잘러 모드

## 기술 구성

- Next.js App Router / React Server Components
- React 19 / TypeScript
- Zustand
- `@dnd-kit/react`
- Tailwind CSS 4와 전역 디자인 시스템
- Supabase Auth / Postgres / Row Level Security

초기 데이터와 인증 확인은 Server Component에서 처리하고, 드래그 앤 드롭과 편집 상태만 Client Component에서 관리합니다.

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
copy .env.example .env.local
npm run dev
```

`.env.local`에 다음 값을 입력합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Supabase SQL Editor 또는 CLI에서 `supabase/migrations`의 `001`부터 최신 파일까지 순서대로 적용합니다. 이미 운영 DB에 적용한 마이그레이션은 수정하지 말고 새 번호의 파일을 추가합니다.

Supabase Auth의 Redirect URLs에는 로컬 주소와 배포 주소의 `/auth/callback`을 등록해야 합니다.

## 테스트 데이터 초기화

로그인 계정과 DB 구조는 유지하고 Timebox 앱 데이터만 전부 비우려면 Supabase SQL Editor에서 다음 파일을 수동 실행합니다.

```text
supabase/scripts/reset_app_data.sql
```

이 파일은 복구할 수 없는 `truncate` 작업을 수행하므로 자동 마이그레이션에 포함하지 않습니다. 실행 후 파일 하단의 확인 쿼리가 모든 앱 테이블을 `0건`으로 표시하는지 확인합니다.

## 주요 경로

```text
app/
  page.tsx                    로그인 사용자의 날짜별 플래너 RSC
  demo/page.tsx               계정 없는 제품 데모
  api/shares/route.ts         공유 토큰 생성 API
  share/[token]/page.tsx      읽기 전용 공개 일정
features/planner/
  server-data.ts              플래너 초기 데이터 조회
  persistence.ts              Supabase 쓰기 작업
  records-data.ts             통계·검색 데이터 조회
  store.tsx                   Zustand 도메인 상태와 명령
  timebox-dashboard.tsx       클라이언트 UI와 상호작용
supabase/migrations/          스키마, RLS, 지표, 공유, 변경 이력
supabase/scripts/             필요할 때만 실행하는 운영·초기화 SQL
.github/workflows/ci.yml      Push·PR 자동 타입·린트·빌드 검사
```

날짜별 플래너는 `/?date=YYYY-MM-DD`로 열립니다. 날짜 파라미터가 없으면 서울 기준 오늘 계획을 엽니다.

## 핵심 데이터 규칙

- 하나의 작업은 한 날짜의 활성 시간표에 한 번만 배치합니다.
- 일정 블록 길이가 바뀌면 연결된 작업의 예상 시간도 동기화합니다.
- 같은 시간에 블록을 겹쳐 배치하지 않습니다.
- 완료된 작업은 브레인덤프에서 숨기지만 기록과 일정에서는 유지합니다.
- 삭제한 블록은 물리 삭제하지 않고 `cancelled` 상태로 보존합니다.
- 계획 확정 이후의 변경만 `schedule_change_events`에 기록합니다.
- 공유 토큰 원문은 저장하지 않고 SHA-256 해시만 저장합니다.

## 검사

```bash
npm run typecheck
npm run lint
npm run build
```

배포 전에는 로그인, 날짜 이동, 계획 확정, 이동·크기 변경·삭제, 일기 저장, 기록 조회, 공유 링크를 실제 Supabase 계정으로 한 번씩 확인합니다.

## 배포

GitHub의 `main` 브랜치를 Vercel에 연결하고 위의 환경 변수를 등록합니다. Supabase 마이그레이션을 먼저 적용한 다음 Vercel을 배포합니다.
