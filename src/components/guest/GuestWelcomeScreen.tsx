import type { ReactNode } from 'react'
import { Button, ConfigProvider, App as AntdApp } from 'antd'
import {
  LogOut,
  User,
  Lightbulb,
  Target,
  Puzzle,
  GraduationCap,
  ChevronRight,
  BookOpen,
  Clock,
  BrainCircuit,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import './GuestWelcomeScreen.css'
import logoCampus from '@/assets/logo-campus.png'
import guestExamMain from '@/assets/guest-exam-main.png'

interface GuestWelcomeScreenProps {
  onStart: () => void
  loading: boolean
  hasRecord: boolean
  recruitmentYear: number
  recruitmentSeason: string
}

function maskPhone(phone: string | undefined): string {
  if (!phone) return '访客'
  const p = phone.replace(/\D/g, '')
  if (p.length >= 11) return `${p.slice(0, 3)}****${p.slice(7)}`
  return phone
}

const rules: { icon: ReactNode; text: string }[] = [
  {
    icon: <BookOpen size={18} strokeWidth={2} className="text-cyan-200" />,
    text: '题目涵盖语言能力与逻辑能力，请按题意作答。',
  },
  {
    icon: <Clock size={18} strokeWidth={2} className="text-cyan-200" />,
    text: '每题按页面倒计时限时作答；超时记为空答并进入下一题。',
  },
  {
    icon: <BrainCircuit size={18} strokeWidth={2} className="text-cyan-200" />,
    text: '已提交进度可恢复；当前题尚未提交的选择不会保存。',
  },
]

function GuestWelcomeContent({ onStart, loading, hasRecord, recruitmentYear, recruitmentSeason }: GuestWelcomeScreenProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { modal } = AntdApp.useApp()

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  const handleLogoutConfirm = () => {
    modal.confirm({
      title: '确认退出登录？',
      content: '退出后返回登录页，已提交的考试进度仍会保留。',
      okText: '确认退出',
      cancelText: '取消',
      onOk: () => void handleLogout(),
    })
  }

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#00FFD1', borderRadius: 16 } }}>
      <div
        className="min-h-screen bg-gradient-to-br from-[#1070E5] via-[#00BFA5] to-[#00F0FF] animate-guest-exam-gradient bg-[length:200%_200%] relative overflow-hidden font-sans text-white flex flex-col selection:bg-white/30"
      >
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[#00FFFF]/35 rounded-full blur-[140px] pointer-events-none mix-blend-screen animate-pulse duration-[8s]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[45vw] h-[45vw] bg-[#00FF88]/30 rounded-full blur-[140px] pointer-events-none mix-blend-screen" />
        <div className="absolute top-[10%] right-[10%] w-[40vw] h-[40vw] bg-[#0055FF]/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[20%] left-[10%] w-[35vw] h-[35vw] bg-[#00FFD1]/30 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />

        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_100%)] opacity-50 pointer-events-none" />

        <header className="relative z-10 w-full px-6 sm:px-8 py-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={logoCampus}
              alt="BlueFocus 校招"
              className="h-8 sm:h-9 w-auto object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.25)]"
            />
          </div>
          <div className="flex items-center gap-3 sm:gap-4 text-white">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                <User size={14} strokeWidth={2} className="text-white/80" />
              </div>
              <span className="text-[13px] sm:text-[14px] font-medium text-white/90 tracking-wide truncate max-w-[9rem] sm:max-w-none">
                {maskPhone(user?.phone)}
              </span>
            </div>
            <div className="w-px h-3.5 bg-white/20 shrink-0" />
            <button
              type="button"
              onClick={handleLogoutConfirm}
              className="guest-header-logout flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-white/90 border-0 bg-transparent hover:bg-white/20 hover:text-white cursor-pointer shrink-0 shadow-none"
            >
              <LogOut size={14} strokeWidth={2} className="opacity-95" />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </header>

        <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-6 sm:px-8 pb-10 flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-16 xl:gap-24">
          <div className="flex-1 w-full flex flex-col justify-center relative z-20 mt-2 lg:mt-0">
            <div className="space-y-6 max-w-[600px] relative z-30 text-center lg:text-left mx-auto lg:mx-0">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-white text-sm font-medium tracking-wide shadow-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-[#00FFD1] animate-pulse shadow-[0_0_8px_#00FFD1]" />
                {recruitmentYear} {recruitmentSeason}校园招聘
              </div>

              <h1 className="text-[2.7rem] sm:text-[3.75rem] lg:text-[5.4rem] font-black tracking-tight leading-[1.38] text-white drop-shadow-lg">
                蓝色光标{recruitmentYear}届{recruitmentSeason}校园招聘
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[#00FFD1]">
                  认知能力<span className="font-bold tracking-normal text-white">测试</span>
                </span>
              </h1>

              <p className="text-base sm:text-[17px] lg:text-[19px] text-cyan-50/90 font-light leading-relaxed max-w-full drop-shadow-sm">
                认知能力评测用于了解您的语言理解与逻辑推理表现，
                <br className="hidden sm:block" />
                请在安静环境中独立完成。
              </p>
            </div>

            <div className="relative w-full max-w-[650px] aspect-[4/3] lg:aspect-[16/10] mt-10 lg:mt-12 z-10 mx-auto lg:mx-0 flex items-center justify-center lg:-translate-x-8">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90%,350px)] h-[min(90%,350px)] bg-white/25 rounded-full blur-[80px] animate-pulse pointer-events-none" />

              <div className="relative z-10 w-full h-full flex items-center justify-center animate-guest-exam-float pointer-events-none px-4">
                <img
                  src={guestExamMain}
                  alt="认知测评主视觉"
                  className="relative z-[1] w-[138%] sm:w-[150%] lg:w-[162%] h-auto object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
                />
              </div>

              <div className="absolute top-[5%] right-[5%] lg:right-[-5%] z-20 animate-guest-exam-float-slow-reverse">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.1)] p-3.5 rounded-[1.5rem] flex items-center justify-center rotate-[20deg] hover:scale-110 hover:rotate-[5deg] transition-all duration-500">
                  <Lightbulb className="text-[#0DFFD4] drop-shadow-md" size={32} strokeWidth={1.5} />
                </div>
              </div>
              <div className="absolute top-[52%] left-[2%] lg:left-[5%] z-20 animate-bounce duration-[5s]">
                <div className="bg-white/5 backdrop-blur-lg border border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.1)] p-3.5 rounded-full flex items-center justify-center rotate-[-25deg] hover:scale-110 transition-all duration-500">
                  <Target className="text-[#00F0FF] drop-shadow-sm" size={32} strokeWidth={1.5} />
                </div>
              </div>
              <div className="absolute bottom-[8%] right-[10%] lg:right-[15%] z-20 animate-guest-exam-float-fast">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.1)] p-3.5 rounded-[1.5rem] flex items-center justify-center rotate-[-15deg] hover:scale-110 transition-all duration-500">
                  <Puzzle className="text-[#FFAE00] fill-[#FFAE00]/40 drop-shadow-sm" size={32} strokeWidth={2} />
                </div>
              </div>
              <div className="absolute top-[15%] left-[8%] lg:left-[12%] z-20 animate-bounce duration-[6s] [animation-direction:reverse]">
                <div className="bg-white/5 backdrop-blur-lg border border-white/15 shadow-[0_8px_20px_rgba(0,0,0,0.05)] p-3.5 rounded-[1.5rem] flex items-center justify-center rotate-[12deg] hover:scale-110 transition-all duration-500">
                  <GraduationCap className="text-[#A0E2FF] drop-shadow-sm" size={32} strokeWidth={1.5} />
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-[440px] shrink-0 space-y-6 relative z-30 mx-auto lg:mx-0">
            <div className="rounded-[1.75rem] bg-white/12 backdrop-blur-xl border border-white/25 shadow-[0_20px_50px_rgba(0,40,80,0.2)] p-6 sm:p-7">
              <p className="text-[15px] text-cyan-50/95 leading-relaxed mb-6">
                {hasRecord ? '检测到未完成的测评记录，可继续作答。' : '请仔细阅读测试说明，然后点击“开始测评”。'}
              </p>
              <p className="mb-6 rounded-xl border border-cyan-100/35 bg-white/12 px-4 py-3 text-sm font-medium text-cyan-50/95">
                题量以实际试卷为准。每套试卷每个账号可参加一次，交卷后无法重新作答。
              </p>

              <h2 className="text-lg font-bold text-white flex items-center gap-2.5 mb-5">
                测试说明
              </h2>
              <ul className="space-y-4 m-0 p-0 list-none">
                {rules.map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-[14px] sm:text-[15px] text-white/85 leading-relaxed">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/15">
                      {item.icon}
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button
              type="primary"
              size="large"
              onClick={onStart}
              loading={loading}
              disabled={loading}
              block
              className="!inline-flex !items-center !justify-center !gap-2 !h-14 !rounded-2xl !font-bold !text-base !border-0 !shadow-[0_12px_32px_rgba(0,0,0,0.18)] hover:!shadow-[0_16px_40px_rgba(0,0,0,0.24)] !bg-white hover:!bg-white !text-[#0A6A4D]"
              icon={<ChevronRight size={20} className="text-[#0A6A4D]" />}
              iconPosition="end"
            >
              {hasRecord ? '继续测评' : '开始测评'}
            </Button>
            <p className="text-center text-xs text-cyan-50/90" style={{ marginTop: '10px' }}>
              {hasRecord ? '将从上次进度继续作答。' : '开始后将进入正式测评，请保持网络稳定。'}
            </p>
          </div>
        </main>

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes guest-exam-gradient-xy {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animate-guest-exam-gradient {
            animation: guest-exam-gradient-xy 22s ease infinite;
          }
          @keyframes guest-exam-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
          .animate-guest-exam-float {
            animation: guest-exam-float 6s ease-in-out infinite;
          }
          .animate-guest-exam-float-slow-reverse {
            animation: guest-exam-float 7s ease-in-out infinite reverse;
          }
          .animate-guest-exam-float-fast {
            animation: guest-exam-float 4.5s ease-in-out infinite;
          }
        ` }} />
      </div>
    </ConfigProvider>
  )
}

export default function GuestWelcomeScreen(props: GuestWelcomeScreenProps) {
  return (
    <AntdApp>
      <GuestWelcomeContent {...props} />
    </AntdApp>
  )
}
