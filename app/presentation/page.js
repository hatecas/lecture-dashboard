'use client'

import { useState, useEffect } from 'react'

const slides = [
  {
    id: 'cover',
    render: () => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ fontSize: '14px', color: '#818cf8', letterSpacing: '6px', textTransform: 'uppercase', marginBottom: '24px', fontWeight: '600' }}>Project Presentation</div>
        <h1 style={{ fontSize: '52px', fontWeight: '800', background: 'linear-gradient(135deg, #c084fc, #818cf8, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '16px', lineHeight: 1.2 }}>강의 통합 관리 시스템</h1>
        <p style={{ fontSize: '20px', color: 'rgba(255,255,255,0.5)', marginBottom: '48px' }}>Lecture Dashboard — All-in-One Management Platform</p>
        <div style={{ display: 'flex', gap: '32px', marginBottom: '48px' }}>
          {['기능', '작동원리', '비용', '가치분석'].map((t, i) => (
            <div key={i} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>{t}</div>
          ))}
        </div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)' }}>Next.js · Supabase · Google Gemini AI · Python FastAPI</div>
      </div>
    )
  },
  {
    id: 'toc',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%' }}>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '48px' }}>목차</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {[
            { num: '01', title: '프로젝트 개요', desc: '시스템 소개 및 기술 스택', color: '#818cf8' },
            { num: '02', title: '핵심 기능', desc: '대시보드, AI 분석, CS 관리 등 8개 기능', color: '#60a5fa' },
            { num: '03', title: '작동 원리', desc: '시스템 아키텍처 및 데이터 흐름', color: '#34d399' },
            { num: '04', title: '기술 상세', desc: 'AI 분석 3단계 전략, 인증 시스템', color: '#a78bfa' },
            { num: '05', title: '운영 비용', desc: '실제 월 운영비 상세 내역', color: '#f472b6' },
            { num: '06', title: '개발 가치 분석', desc: '외주 견적 및 인건비 산출', color: '#fbbf24' },
            { num: '07', title: '기능별 외주 상세', desc: '기능 단위 개발 비용 분석', color: '#fb923c' },
            { num: '08', title: '총 정리', desc: '핵심 요약 및 결론', color: '#f87171' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '20px', padding: '24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', alignItems: 'center' }}>
              <div style={{ fontSize: '32px', fontWeight: '800', color: item.color, opacity: 0.8, minWidth: '50px' }}>{item.num}</div>
              <div>
                <div style={{ fontSize: '17px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>{item.title}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: 'overview',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%' }}>
        <div style={{ fontSize: '13px', color: '#818cf8', letterSpacing: '3px', marginBottom: '8px' }}>01 — PROJECT OVERVIEW</div>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>프로젝트 개요</h2>
        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', marginBottom: '40px' }}>온라인 교육 비즈니스를 위한 올인원 관리 플랫폼</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ fontSize: '14px', color: '#818cf8', fontWeight: '600', marginBottom: '16px' }}>Frontend</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['Next.js 16', 'React 19', 'TypeScript', 'Tailwind CSS 4', 'Recharts'].map((t, i) => (
                <span key={i} style={{ padding: '6px 14px', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '8px', fontSize: '13px', color: '#a5b4fc' }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ fontSize: '14px', color: '#34d399', fontWeight: '600', marginBottom: '16px' }}>Backend</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['Next.js API Routes', 'Python FastAPI', 'Supabase (PostgreSQL)', 'Docker'].map((t, i) => (
                <span key={i} style={{ padding: '6px 14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '8px', fontSize: '13px', color: '#6ee7b7' }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ fontSize: '14px', color: '#f472b6', fontWeight: '600', marginBottom: '16px' }}>AI / External APIs</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['Google Gemini 2.0', 'Anthropic Claude', 'YouTube API', 'Google Sheets API', 'Channel.io API'].map((t, i) => (
                <span key={i} style={{ padding: '6px 14px', background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.2)', borderRadius: '8px', fontSize: '13px', color: '#f9a8d4' }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ fontSize: '14px', color: '#fbbf24', fontWeight: '600', marginBottom: '16px' }}>Infra / Deploy</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['Vercel', 'HuggingFace Spaces', 'Railway', 'Docker', 'yt-dlp / FFmpeg'].map((t, i) => (
                <span key={i} style={{ padding: '6px 14px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '8px', fontSize: '13px', color: '#fcd34d' }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '20px 28px', background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '12px' }}>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>
            <strong style={{ color: '#a5b4fc' }}>총 코드 규모:</strong> 프론트엔드 컴포넌트 296KB+ · API 라우트 15개+ · Python 백엔드 서비스 · SQL 스키마 · Docker 배포 구성
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'features-1',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%' }}>
        <div style={{ fontSize: '13px', color: '#60a5fa', letterSpacing: '3px', marginBottom: '8px' }}>02 — CORE FEATURES</div>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '40px' }}>핵심 기능 (1/2)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #818cf8, #6366f1)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📊</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>실시간 대시보드</div>
            </div>
            <ul style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 2, paddingLeft: '16px' }}>
              <li>매출 / 영업이익 / 이익률 실시간 추적</li>
              <li>광고비 분석 (GDN, Meta 전환 비용)</li>
              <li>강사별 비교 & 랭킹 시스템</li>
              <li>5~30분 단위 타임라인 차트</li>
              <li>라이브 시청자수 / 구매 전환율</li>
            </ul>
          </div>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🤖</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>AI 강의 분석</div>
            </div>
            <ul style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 2, paddingLeft: '16px' }}>
              <li>YouTube URL 입력만으로 자동 분석</li>
              <li>Gemini 2.0 Flash 기반 3단계 전략</li>
              <li>자막 / 직접 URL / 오디오 추출 폴백</li>
              <li>실시간 진행률 스트리밍 (SSE)</li>
              <li>분석 이력 저장 및 조회</li>
            </ul>
          </div>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #34d399, #10b981)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>💬</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>AI 고객 응대</div>
            </div>
            <ul style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 2, paddingLeft: '16px' }}>
              <li>회사 CS 정책 기반 자동 응답 생성</li>
              <li>유사 과거 사례 5개 자동 참조</li>
              <li>이미지 첨부 문의도 AI 분석</li>
              <li>Channel.io 대화 내역 연동</li>
              <li>응대 이력 CRUD 관리</li>
            </ul>
          </div>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #60a5fa, #3b82f6)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📋</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Google Sheets 연동</div>
            </div>
            <ul style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 2, paddingLeft: '16px' }}>
              <li>멀티 시트 관리 (저장/불러오기)</li>
              <li>API 모드 / Iframe 모드 전환</li>
              <li>탭 자동 감지 및 동적 전환</li>
              <li>줌 컨트롤 / 전체화면 지원</li>
              <li>서비스 계정 권한 자동 안내</li>
            </ul>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'features-2',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%' }}>
        <div style={{ fontSize: '13px', color: '#60a5fa', letterSpacing: '3px', marginBottom: '8px' }}>02 — CORE FEATURES</div>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '40px' }}>핵심 기능 (2/2)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #fb923c, #f97316)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🧹</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>CRM 데이터 정리</div>
            </div>
            <ul style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 2, paddingLeft: '16px' }}>
              <li>엑셀 다중 파일 일괄 처리</li>
              <li>전화번호 자동 정규화 (010-XXXX-XXXX)</li>
              <li>이름 표준화 / 중복 제거</li>
              <li>정리된 CSV 내보내기</li>
            </ul>
          </div>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #f472b6, #ec4899)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🎥</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>YouTube 라이브 채팅 수집</div>
            </div>
            <ul style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 2, paddingLeft: '16px' }}>
              <li>실시간 라이브 채팅 자동 수집</li>
              <li>특정 사용자 타겟 필터링</li>
              <li>3~5초 간격 폴링</li>
              <li>엑셀 내보내기 지원</li>
            </ul>
          </div>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🔐</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>보안 인증 시스템</div>
            </div>
            <ul style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 2, paddingLeft: '16px' }}>
              <li>JWT 세션 토큰 (30분 만료)</li>
              <li>로그인 5회 실패 시 5분 잠금</li>
              <li>자동 로그아웃 + 1분 전 경고</li>
              <li>IP / User Agent 추적 로깅</li>
            </ul>
          </div>
          <div style={{ padding: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #f87171, #ef4444)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📎</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>파일 관리 & 매칭 도구</div>
            </div>
            <ul style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 2, paddingLeft: '16px' }}>
              <li>강사별 첨부파일 업로드 (이미지/PDF)</li>
              <li>드래그앤드롭 + 업로드 진행률</li>
              <li>카카오 / 인플로우 CRM 매칭</li>
              <li>매출 데이터 파싱 & 시각화</li>
            </ul>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'architecture',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%' }}>
        <div style={{ fontSize: '13px', color: '#34d399', letterSpacing: '3px', marginBottom: '8px' }}>03 — HOW IT WORKS</div>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '40px' }}>시스템 아키텍처</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-block', padding: '14px 48px', background: 'linear-gradient(135deg, #818cf8, #6366f1)', borderRadius: '12px', fontSize: '16px', fontWeight: '700', color: '#fff' }}>사용자 (브라우저)</div>
          </div>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '20px' }}>▼</div>
          <div style={{ padding: '24px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px' }}>
            <div style={{ fontSize: '14px', color: '#818cf8', fontWeight: '700', marginBottom: '12px' }}>Frontend — Next.js 16 (Vercel)</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {['React 19 SPA', 'App Router', '글래스모피즘 UI', 'Recharts 시각화', '반응형 디자인'].map((t, i) => (
                <span key={i} style={{ padding: '6px 12px', background: 'rgba(99,102,241,0.15)', borderRadius: '6px', fontSize: '12px', color: '#a5b4fc' }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '20px' }}>▼</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ padding: '24px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '16px' }}>
              <div style={{ fontSize: '14px', color: '#34d399', fontWeight: '700', marginBottom: '12px' }}>API Layer — Next.js API Routes</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['인증 미들웨어', '시트 데이터', 'CS 관리', '파일 업로드', '로그 추적'].map((t, i) => (
                  <span key={i} style={{ padding: '4px 10px', background: 'rgba(52,211,153,0.15)', borderRadius: '6px', fontSize: '11px', color: '#6ee7b7' }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ padding: '24px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '16px' }}>
              <div style={{ fontSize: '14px', color: '#fbbf24', fontWeight: '700', marginBottom: '12px' }}>Python Backend — FastAPI</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['YouTube 분석', 'yt-dlp 추출', 'FFmpeg 처리', 'Gemini AI', '3단계 폴백'].map((t, i) => (
                  <span key={i} style={{ padding: '4px 10px', background: 'rgba(251,191,36,0.15)', borderRadius: '6px', fontSize: '11px', color: '#fcd34d' }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '20px' }}>▼</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div style={{ padding: '16px', background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.2)', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: '#f472b6', fontWeight: '600' }}>Supabase</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>PostgreSQL DB + Auth</div>
            </div>
            <div style={{ padding: '16px', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: '#a78bfa', fontWeight: '600' }}>Google APIs</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Sheets · YouTube · Gemini</div>
            </div>
            <div style={{ padding: '16px', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: '#60a5fa', fontWeight: '600' }}>Channel.io</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>CS 대화 연동</div>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'ai-strategy',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%' }}>
        <div style={{ fontSize: '13px', color: '#a78bfa', letterSpacing: '3px', marginBottom: '8px' }}>04 — TECHNICAL DETAILS</div>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>AI 강의 분석 — 3단계 폴백 전략</h2>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '36px' }}>어떤 YouTube 영상이든 분석할 수 있도록 3단계 자동 전환</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch' }}>
            <div style={{ minWidth: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #34d399, #10b981)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '800', color: '#fff' }}>1</div>
              <div style={{ width: '2px', height: '20px', background: 'rgba(255,255,255,0.1)', marginTop: '8px' }} />
            </div>
            <div style={{ flex: 1, padding: '24px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#34d399' }}>자막 기반 분석</div>
                <span style={{ padding: '4px 12px', background: 'rgba(52,211,153,0.15)', borderRadius: '20px', fontSize: '12px', color: '#6ee7b7' }}>가장 빠름 · 비용 최저</span>
              </div>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>YouTube 자막(한국어/영어) 자동 추출 → Gemini에 텍스트 전달 → 분석 결과 생성</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch' }}>
            <div style={{ minWidth: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #60a5fa, #3b82f6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '800', color: '#fff' }}>2</div>
              <div style={{ width: '2px', height: '20px', background: 'rgba(255,255,255,0.1)', marginTop: '8px' }} />
            </div>
            <div style={{ flex: 1, padding: '24px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#60a5fa' }}>Gemini 직접 URL 분석</div>
                <span style={{ padding: '4px 12px', background: 'rgba(96,165,250,0.15)', borderRadius: '20px', fontSize: '12px', color: '#93c5fd' }}>공개 영상 전용</span>
              </div>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>자막 없는 경우 → Gemini 2.0 Flash에 YouTube URL 직접 전달 → AI가 영상 자체를 시청/분석</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch' }}>
            <div style={{ minWidth: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #f472b6, #ec4899)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '800', color: '#fff' }}>3</div>
            </div>
            <div style={{ flex: 1, padding: '24px', background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.15)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#f472b6' }}>오디오 추출 분석</div>
                <span style={{ padding: '4px 12px', background: 'rgba(244,114,182,0.15)', borderRadius: '20px', fontSize: '12px', color: '#f9a8d4' }}>최후의 수단 · 가장 강력</span>
              </div>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>비공개/제한 영상 → yt-dlp 오디오 추출 (봇 탐지 우회) → FFmpeg 변환 → Gemini File API 업로드 → 오디오 분석</div>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'db-auth',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%' }}>
        <div style={{ fontSize: '13px', color: '#a78bfa', letterSpacing: '3px', marginBottom: '8px' }}>04 — TECHNICAL DETAILS</div>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '40px' }}>데이터베이스 & 인증 흐름</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#a78bfa', marginBottom: '16px' }}>Supabase 테이블 (10개)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { name: 'admins', desc: '관리자 계정 (ID, PW 해시, 권한)', color: '#818cf8' },
                { name: 'auth_sessions', desc: '활성 세션 (토큰, 만료시간)', color: '#818cf8' },
                { name: 'login_attempts', desc: '로그인 시도 추적 (Rate Limit)', color: '#818cf8' },
                { name: 'login_logs', desc: '전체 로그인 기록 (IP, UA)', color: '#818cf8' },
                { name: 'saved_sheets', desc: '저장된 Google Sheets', color: '#60a5fa' },
                { name: 'instructor_attachments', desc: '강사별 첨부파일', color: '#60a5fa' },
                { name: 'lecture_analysis_cache', desc: 'AI 분석 캐시', color: '#34d399' },
                { name: 'lecture_analysis_history', desc: '분석 이력', color: '#34d399' },
                { name: 'cs_policies', desc: 'CS 정책 규정', color: '#f472b6' },
                { name: 'cs_history', desc: 'CS 응대 이력', color: '#f472b6' },
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: `3px solid ${t.color}` }}>
                  <code style={{ fontSize: '12px', color: t.color, minWidth: '180px', fontFamily: 'monospace' }}>{t.name}</code>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{t.desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#fbbf24', marginBottom: '16px' }}>인증 플로우</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { step: '1', text: '사용자 ID/PW 입력', detail: 'Rate Limit 체크 (5회/5분)' },
                { step: '2', text: 'Supabase admins 테이블 검증', detail: '비밀번호 해시 비교' },
                { step: '3', text: '32바이트 랜덤 JWT 토큰 생성', detail: 'auth_sessions에 저장' },
                { step: '4', text: 'localStorage에 토큰 저장', detail: '30분 만료 설정' },
                { step: '5', text: '5분마다 토큰 유효성 검증', detail: 'API 호출 시 Bearer 토큰' },
                { step: '6', text: '29분 경과 시 경고 모달', detail: '1분 카운트다운' },
                { step: '7', text: '30분 경과 시 자동 로그아웃', detail: '세션 삭제 + 로그인 화면' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{ width: '28px', height: '28px', background: 'rgba(251,191,36,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: '#fbbf24', flexShrink: 0 }}>{item.step}</div>
                  <div>
                    <div style={{ fontSize: '14px', color: '#fff', fontWeight: '600' }}>{item.text}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'cost',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%' }}>
        <div style={{ fontSize: '13px', color: '#f472b6', letterSpacing: '3px', marginBottom: '8px' }}>05 — OPERATING COST</div>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>운영 비용</h2>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '36px' }}>실제 월간 운영에 필요한 비용 내역</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          <div style={{ padding: '28px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: '16px' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#34d399', marginBottom: '20px' }}>무료 (Free Tier)</div>
            {[
              { name: 'Vercel (프론트엔드 호스팅)', cost: '$0', desc: 'Hobby Plan 무료' },
              { name: 'Supabase (DB + Auth)', cost: '$0', desc: 'Free: 500MB DB, 50K 요청' },
              { name: 'HuggingFace Spaces (백엔드)', cost: '$0', desc: 'Free CPU Basic' },
              { name: 'Google Sheets API', cost: '$0', desc: '무료 할당량 내 사용' },
              { name: 'YouTube Data API', cost: '$0', desc: '일일 10,000 유닛 무료' },
              { name: 'Channel.io', cost: '$0', desc: '기본 플랜' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div>
                  <div style={{ fontSize: '14px', color: '#fff' }}>{item.name}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{item.desc}</div>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#34d399' }}>{item.cost}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '28px', background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.15)', borderRadius: '16px' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#f472b6', marginBottom: '20px' }}>유료 (API 사용량 기반)</div>
            {[
              { name: 'Google Gemini API', cost: '~$5~15/월', desc: '강의 분석 사용량에 따라 변동' },
              { name: 'Anthropic Claude API', cost: '~$3~10/월', desc: 'CS AI · 세션 분석 사용량' },
              { name: '도메인 (선택)', cost: '~$12/년', desc: '커스텀 도메인 사용 시' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div>
                  <div style={{ fontSize: '14px', color: '#fff' }}>{item.name}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{item.desc}</div>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#f472b6' }}>{item.cost}</div>
              </div>
            ))}
            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>예상 월 총 운영비</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#f472b6' }}>약 $8~25/월</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>한화 약 11,000~35,000원</div>
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 24px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: '12px' }}>
          <div style={{ fontSize: '13px', color: '#fbbf24' }}>대부분의 인프라가 무료 티어로 운영 가능. AI API 비용만 사용량에 따라 발생하며, 일반적인 사용 패턴에서는 월 2만원 이내.</div>
        </div>
      </div>
    )
  },
  {
    id: 'value',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%' }}>
        <div style={{ fontSize: '13px', color: '#fbbf24', letterSpacing: '3px', marginBottom: '8px' }}>06 — DEVELOPMENT VALUE</div>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>개발 가치 분석</h2>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '36px' }}>외주 또는 개발자에게 의뢰했을 경우의 비용 산출</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '28px' }}>
          <div style={{ padding: '28px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#818cf8', marginBottom: '8px' }}>국내 외주 개발사</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>중소 SI / 웹에이전시 기준</div>
            <div style={{ fontSize: '36px', fontWeight: '800', color: '#fff', marginBottom: '4px' }}>3,500만</div>
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>~ 5,500만원</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.8 }}>• 풀스택 개발 2~3개월<br/>• PM + 디자이너 + 개발자 2명<br/>• AI 연동은 추가 비용 발생<br/>• 유지보수 별도 (월 50~100만)</div>
          </div>
          <div style={{ padding: '28px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '16px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#34d399', marginBottom: '8px' }}>프리랜서 개발자</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>경력 5년+ 시니어 기준</div>
            <div style={{ fontSize: '36px', fontWeight: '800', color: '#fff', marginBottom: '4px' }}>2,000만</div>
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>~ 3,500만원</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.8 }}>• 풀스택 1인 개발 3~4개월<br/>• 월 단가 600~800만원<br/>• 디자인 별도 (300~500만)<br/>• AI/백엔드 전문성 필요</div>
          </div>
          <div style={{ padding: '28px', background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.2)', borderRadius: '16px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#f472b6', marginBottom: '8px' }}>정규직 채용</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>풀스택 + AI 경험자 기준</div>
            <div style={{ fontSize: '36px', fontWeight: '800', color: '#fff', marginBottom: '4px' }}>4,800만</div>
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>~ 7,200만원 /년</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.8 }}>• 연봉 4,800~7,200만<br/>• 4대보험 등 부대비용 +20%<br/>• 채용까지 1~3개월 소요<br/>• 지속적 유지보수 가능</div>
          </div>
        </div>
        <div style={{ padding: '20px 28px', background: 'linear-gradient(135deg, rgba(251,191,36,0.1), rgba(249,115,22,0.1))', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '12px' }}>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>
            <strong style={{ color: '#fbbf24' }}>핵심:</strong> 본 시스템은 프론트엔드 + 백엔드 + AI 연동 + DB 설계 + 배포까지 모두 포함된 <strong style={{ color: '#fbbf24' }}>풀스택 프로젝트</strong>로, 일반적인 외주 견적으로 <strong style={{ color: '#fbbf24' }}>최소 3,000만원 이상</strong>의 개발 가치를 가집니다.
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'cost-detail',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%' }}>
        <div style={{ fontSize: '13px', color: '#fb923c', letterSpacing: '3px', marginBottom: '8px' }}>07 — FEATURE COST BREAKDOWN</div>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '36px' }}>기능별 외주 개발 비용 상세</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 20px', background: 'rgba(255,255,255,0.06)', borderRadius: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.6)' }}>기능</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>난이도</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>예상 공수</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textAlign: 'right' }}>외주 비용</div>
          </div>
          {[
            { feat: '인증/보안 시스템 (JWT, Rate Limit, 자동 로그아웃)', diff: '중상', diffColor: '#fb923c', days: '5~7일', cost: '250~400만' },
            { feat: '실시간 대시보드 (차트, 매출분석, 강사 비교)', diff: '상', diffColor: '#f87171', days: '10~15일', cost: '500~800만' },
            { feat: 'AI 강의 분석 (3단계 폴백, SSE 스트리밍)', diff: '최상', diffColor: '#ef4444', days: '12~18일', cost: '700~1,200만' },
            { feat: 'AI CS 응대 (정책 기반, 이력 관리)', diff: '상', diffColor: '#f87171', days: '7~10일', cost: '400~600만' },
            { feat: 'Google Sheets 연동 (멀티시트, API/Iframe)', diff: '중', diffColor: '#fbbf24', days: '5~7일', cost: '200~350만' },
            { feat: 'CRM 데이터 정리 도구 (엑셀 처리)', diff: '중', diffColor: '#fbbf24', days: '4~6일', cost: '180~300만' },
            { feat: 'YouTube 채팅 수집 시스템', diff: '중상', diffColor: '#fb923c', days: '5~8일', cost: '250~400만' },
            { feat: 'Channel.io 연동', diff: '중', diffColor: '#fbbf24', days: '3~5일', cost: '150~250만' },
            { feat: 'Python 백엔드 (FastAPI + Docker)', diff: '상', diffColor: '#f87171', days: '5~8일', cost: '300~500만' },
            { feat: 'UI/UX 디자인 (글래스모피즘, 반응형)', diff: '중상', diffColor: '#fb923c', days: '7~10일', cost: '350~500만' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 20px', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderRadius: '8px', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', color: '#fff' }}>{item.feat}</div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ padding: '3px 10px', background: `${item.diffColor}20`, borderRadius: '6px', fontSize: '12px', color: item.diffColor, fontWeight: '600' }}>{item.diff}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{item.days}</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', textAlign: 'right' }}>{item.cost}</div>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '16px 20px', background: 'linear-gradient(135deg, rgba(251,146,60,0.1), rgba(249,115,22,0.1))', borderRadius: '10px', marginTop: '8px', border: '1px solid rgba(251,146,60,0.2)' }}>
            <div style={{ fontSize: '15px', fontWeight: '800', color: '#fb923c' }}>합계</div>
            <div />
            <div style={{ fontSize: '13px', color: '#fb923c', textAlign: 'center', fontWeight: '600' }}>63~94일</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#fb923c', textAlign: 'right' }}>3,280~5,300만</div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'summary',
    render: () => (
      <div style={{ padding: '60px 80px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '13px', color: '#f87171', letterSpacing: '3px', marginBottom: '8px' }}>08 — CONCLUSION</div>
        <h2 style={{ fontSize: '36px', fontWeight: '700', color: '#fff', marginBottom: '36px' }}>총 정리</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '32px' }}>
          <div style={{ padding: '28px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#818cf8', marginBottom: '12px', fontWeight: '600' }}>총 기능 수</div>
            <div style={{ fontSize: '48px', fontWeight: '800', color: '#fff' }}>8+</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>핵심 모듈</div>
          </div>
          <div style={{ padding: '28px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#34d399', marginBottom: '12px', fontWeight: '600' }}>월 운영비</div>
            <div style={{ fontSize: '48px', fontWeight: '800', color: '#fff' }}>~2만</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>원 / 월</div>
          </div>
          <div style={{ padding: '28px', background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.2)', borderRadius: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#f472b6', marginBottom: '12px', fontWeight: '600' }}>개발 가치</div>
            <div style={{ fontSize: '48px', fontWeight: '800', color: '#fff' }}>4,000</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>만원+ (외주 기준)</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
          <div style={{ padding: '24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>이 시스템이 가지는 가치</div>
            <ul style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 2.2, paddingLeft: '16px' }}>
              <li>강의 비즈니스 운영에 <strong style={{ color: '#a5b4fc' }}>즉시 투입 가능</strong>한 완성도</li>
              <li>AI 기반 자동 분석으로 <strong style={{ color: '#a5b4fc' }}>업무 시간 70%+ 절감</strong></li>
              <li>외부 서비스 의존 최소화, <strong style={{ color: '#a5b4fc' }}>자체 운영 가능</strong></li>
              <li>보안 인증, 로깅 등 <strong style={{ color: '#a5b4fc' }}>기업급 기능</strong> 포함</li>
              <li>무료 인프라 활용으로 <strong style={{ color: '#a5b4fc' }}>월 운영비 극소</strong></li>
            </ul>
          </div>
          <div style={{ padding: '24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>기술적 특장점</div>
            <ul style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 2.2, paddingLeft: '16px' }}>
              <li>최신 스택: <strong style={{ color: '#6ee7b7' }}>Next.js 16 + React 19</strong></li>
              <li>듀얼 AI: <strong style={{ color: '#6ee7b7' }}>Gemini + Claude</strong> 동시 활용</li>
              <li>마이크로서비스: <strong style={{ color: '#6ee7b7' }}>Node.js + Python</strong> 분리</li>
              <li>3단계 폴백으로 <strong style={{ color: '#6ee7b7' }}>100% 분석 성공률</strong></li>
              <li>글래스모피즘 <strong style={{ color: '#6ee7b7' }}>프리미엄 UI/UX</strong></li>
            </ul>
          </div>
        </div>
        <div style={{ padding: '20px 28px', background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.12), rgba(244,114,182,0.12))', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', color: '#fff', fontWeight: '600', lineHeight: 1.8 }}>
            외주 개발 시 <span style={{ color: '#f472b6', fontSize: '20px', fontWeight: '800' }}>3,500~5,500만원</span> 규모의 프로젝트를<br/>
            월 <span style={{ color: '#34d399', fontSize: '20px', fontWeight: '800' }}>~2만원</span>으로 운영하는 올인원 강의 관리 플랫폼
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'thankyou',
    render: () => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(168,85,247,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ fontSize: '60px', fontWeight: '800', background: 'linear-gradient(135deg, #c084fc, #818cf8, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '24px' }}>Thank You</div>
        <h2 style={{ fontSize: '28px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginBottom: '16px' }}>강의 통합 관리 시스템</h2>
        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.35)', maxWidth: '500px', lineHeight: 1.8 }}>
          Next.js · Supabase · Google Gemini · Anthropic Claude · Python FastAPI
        </p>
      </div>
    )
  },
]

export default function Presentation() {
  const [current, setCurrent] = useState(0)
  const total = slides.length

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        setCurrent(prev => Math.min(prev + 1, total - 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCurrent(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Home') {
        setCurrent(0)
      } else if (e.key === 'End') {
        setCurrent(total - 1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [total])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a12', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{
          width: '100%',
          maxWidth: '1200px',
          height: '100%',
          maxHeight: '720px',
          background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {slides[current].render()}
        </div>
      </div>
      <div style={{ padding: '16px 40px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={() => setCurrent(prev => Math.max(prev - 1, 0))}
          disabled={current === 0}
          style={{
            padding: '10px 24px',
            background: current === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            color: current === 0 ? 'rgba(255,255,255,0.2)' : '#fff',
            cursor: current === 0 ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
        >
          ← 이전
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {slides.map((_, i) => (
            <div
              key={i}
              onClick={() => setCurrent(i)}
              style={{
                width: i === current ? '32px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: i === current ? '#818cf8' : 'rgba(255,255,255,0.15)',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
            />
          ))}
          <span style={{ marginLeft: '12px', fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>{current + 1} / {total}</span>
        </div>
        <button
          onClick={() => setCurrent(prev => Math.min(prev + 1, total - 1))}
          disabled={current === total - 1}
          style={{
            padding: '10px 24px',
            background: current === total - 1 ? 'rgba(255,255,255,0.03)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: current === total - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
            borderRadius: '10px',
            color: current === total - 1 ? 'rgba(255,255,255,0.2)' : '#fff',
            cursor: current === total - 1 ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
        >
          다음 →
        </button>
      </div>
    </div>
  )
}
