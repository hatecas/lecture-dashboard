import { planEbook } from './ebook'

// 활성 플래너 레지스트리. 새 기능 추가 = 여기에 import + 한 줄 추가.
export const planners = {
  ebook: planEbook,
  // boomUp: planBoomUp,                  // 다음 단계
  // alimtalk: planAlimtalk,              // 다음 단계
  // viralQ: planViralQ,                  // 다음 단계
  // ppt: planPpt,                        // 다음 단계
  // salesPage: planSalesPage,            // 다음 단계
  // groupAnnouncement: planGroupAnnouncement, // 다음 단계
}

// UI 렌더링용 메타. enabled=false 항목은 체크박스가 disabled로 보임.
export const PLANNER_META = {
  ebook: {
    label: '무료 전자책 기획안',
    icon: '📚',
    description: '썸네일 카피 + 제목 + 도입 후크 + 본문 4섹션 + CTA',
    enabled: true,
  },
  boomUp: {
    label: '붐업 멘트 (스타일별)',
    icon: '🎉',
    description: '단톡방/라이브 시작 직전 분위기 띄우는 멘트 3종',
    enabled: false,
  },
  alimtalk: {
    label: '알림톡 / 채널톡 멘트',
    icon: '💬',
    description: '슝 알림톡 변수에 그대로 꽂을 수 있는 멘트',
    enabled: false,
  },
  viralQ: {
    label: '바이럴 질문',
    icon: '❓',
    description: '단톡방 참여 유도 질문 10개',
    enabled: false,
  },
  ppt: {
    label: '강의 PPT outline',
    icon: '📋',
    description: '슬라이드별 outline + 발표 멘트 초안',
    enabled: false,
  },
  salesPage: {
    label: '무료 상페 카피',
    icon: '📄',
    description: '무료강의 상세페이지 섹션별 카피',
    enabled: false,
  },
  groupAnnouncement: {
    label: '단톡방 공지 시리즈',
    icon: '📢',
    description: 'D-1 / D-day / D+1 시점별 공지',
    enabled: false,
  },
}
