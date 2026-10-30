import { useEffect, useState } from 'react'
import {
  Check,
  Award,
  Star,
  GraduationCap,
  Globe,
  BookOpen,
  Sparkles,
  Heart,
} from 'lucide-react'
import logoCampus from '@/assets/logo-campus.png'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export default function GuestCompletionScreen({ recruitmentYear }: { recruitmentYear: number }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center font-sans overflow-hidden bg-[#2563EB]">
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#3B82F6] via-[#2563EB] to-[#1D4ED8]" />

        <div className="absolute top-[-10%] left-[-5%] w-[70vw] h-[70vw] bg-white/10 rounded-full blur-[120px] animate-[float_15s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[60vw] h-[60vw] bg-[#60A5FA]/20 rounded-full blur-[100px] animate-[float_12s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-[30%] right-[10%] w-[40vw] h-[40vw] bg-white/5 rounded-full blur-[80px] animate-pulse" />

        <div className="absolute top-[12%] right-[15%] text-white/10 animate-[float-slow_18s_ease-in-out_infinite] pointer-events-none">
          <GraduationCap size={72} strokeWidth={1} />
        </div>
        <div className="absolute bottom-[25%] left-[10%] text-white/10 animate-[float-slow_14s_ease-in-out_infinite_reverse] pointer-events-none">
          <BookOpen size={64} strokeWidth={1} />
        </div>
        <div className="absolute top-[40%] left-[5%] text-white/10 animate-[float-slow_20s_ease-in-out_infinite] pointer-events-none">
          <Star size={40} strokeWidth={1} />
        </div>
        <div className="absolute bottom-[15%] right-[20%] text-white/10 animate-[float-slow_16s_ease-in-out_infinite_reverse] pointer-events-none">
          <Award size={56} strokeWidth={1} />
        </div>
      </div>

      <div
        className={`relative z-10 w-full max-w-[620px] mx-4 transition-all duration-[1200ms] ease-out transform ${
          mounted ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-95'
        }`}
      >
        <div className="bg-white/15 backdrop-blur-[40px] border border-white/30 rounded-[48px] p-8 md:p-14 shadow-[0_40px_100px_rgba(0,0,0,0.15)] flex flex-col items-center text-center overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          <div className="relative mb-10 group">
            <div className="absolute inset-0 bg-[#0BB37A] rounded-full blur-3xl opacity-30 animate-pulse" />

            <div className="relative w-32 h-32 rounded-full bg-white/20 border border-white/20 backdrop-blur-md shadow-2xl flex items-center justify-center p-1">
              <div className="w-full h-full rounded-full border border-dashed border-white/40 animate-[spin_25s_linear_infinite] absolute" />

              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[#0BB37A] to-[#34D399] flex items-center justify-center shadow-lg transition-transform duration-700 group-hover:scale-105">
                <Check
                  className="text-white animate-[bounce-in_0.8s_cubic-bezier(0.175,0.885,0.32,1.275)_both_0.4s]"
                  size={48}
                  strokeWidth={3.5}
                />
              </div>
            </div>

            <div className="absolute -top-1 -right-1 bg-white rounded-full p-2.5 shadow-lg animate-[float-mini_4s_ease-in-out_infinite]">
              <Sparkles size={16} className="text-[#3B82F6] fill-[#3B82F6]/20" />
            </div>
            <div className="absolute -bottom-1 -left-1 bg-[#F43F5E] rounded-full p-2.5 shadow-lg animate-[float-mini_5s_ease-in-out_infinite_reverse]">
              <Heart size={16} className="text-white fill-white" />
            </div>
          </div>

          <h1 className="text-[36px] md:text-[40px] font-bold text-white tracking-tight mb-4 leading-tight drop-shadow-sm">
            提交成功
          </h1>

          <div className="flex items-center gap-2 mb-8 text-white/80 font-bold text-[13px] uppercase tracking-[0.3em]">
            <span>Future Innovators</span>
            <div className="w-1 h-1 rounded-full bg-white/40" />
            <span>BlueFocus {recruitmentYear}</span>
          </div>

          <div className="w-full max-w-[440px] space-y-6">

            <p className="text-white/70 text-[14px] md:text-[15px] leading-relaxed">
              请务必留意后续通知。
              <br />
              期待在充满创意的蓝色光标森林里，遇见那个闪闪发光的你！✨
            </p>
          </div>

          <button type="button" className="mt-6 rounded-xl border border-white/40 bg-white/10 px-6 py-2 text-white cursor-pointer"
            onClick={async () => {
              try { await logout() } finally { navigate('/login', { replace: true }) }
            }}>
            退出登录
          </button>

          <div className="mt-12 w-full flex justify-center">
            <a
              href="https://www.bluefocusgroup.com/"
              target="_blank"
              rel="noreferrer"
              className="no-underline flex items-center gap-4 py-3.5 px-7 bg-white/10 rounded-[20px] border border-white/20 hover:bg-white/20 transition-all cursor-pointer group shadow-lg"
            >
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white">
                <Globe size={18} />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-bold text-white m-0">了解公司近况</p>
                <p className="text-[11px] text-white/60 font-medium m-0">访问蓝色光标官网 · 探索更多精彩</p>
              </div>
            </a>
          </div>
        </div>

        <div
          className={`mt-14 flex flex-col items-center transition-all duration-1000 delay-500 transform ${
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          <div className="w-[180px] brightness-0 invert opacity-100 drop-shadow-[0_4px_20px_rgba(255,255,255,0.2)]">
            <img src={logoCampus} alt="BlueFocus Logo" className="w-full h-auto" />
          </div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(1deg); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-12px, -18px) rotate(-2.5deg); }
        }
        @keyframes float-mini {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-7px); }
        }
        @keyframes bounce-in {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `,
        }}
      />
    </div>
  )
}
