import { useState } from 'react'
import { Form, Input, Button, message, ConfigProvider, Alert, Modal, Checkbox, Segmented } from 'antd'
import {
  Lock,
  Smartphone,
  Sparkles,
  GraduationCap,
  Rocket,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import logoCampus from '@/assets/logo-campus.png'
import authService from '@/services/AuthService'
import { useAuth } from '@/hooks/useAuth'
import './LoginPage.css'

/** 手机号格式，与后端 AuthServiceImpl 保持一致 */
const PHONE_REGEX = /^1[3-9]\d{9}$/

export default function LoginPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  /** 手机号与密码登录 / 注册 */
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [agreed, setAgreed] = useState(true)
  /** 表单内弱提示（不依赖全局 message.error） */
  const [authHint, setAuthHint] = useState<
    | { variant: 'not_registered' }
    | { variant: 'already_registered' }
    | { variant: 'generic'; text: string }
    | null
  >(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')
  const { setUser } = useAuth()

  const navigateAfterAuth = () => {
    // 仅接受本工程的测评入口，登录后直接进入认知测试。
    const destination = redirect?.split('?')[0]
    const safeRedirect = destination === '/exam' ? redirect : '/exam'
    navigate(safeRedirect || '/exam', { replace: true })
  }

  const onFinish = async (values: { phone: string; password: string }) => {
    if (!agreed) {
      message.warning('请先阅读并勾选用户协议')
      return
    }
    setAuthHint(null)
    setLoading(true)
    try {
      const payload = { phone: values.phone.trim(), password: values.password }
      const res = authMode === 'login'
        ? await authService.login(payload)
        : await authService.register(payload)
      setUser(res.userInfo)
      message.success(authMode === 'login' ? '登录成功' : '注册成功')
      navigateAfterAuth()
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : ''
      const fallback = authMode === 'login' ? '登录失败' : '注册失败'
      if (authMode === 'login' && /用户不存在|未注册/.test(raw)) {
        setAuthHint({ variant: 'not_registered' })
      } else if (authMode === 'register' && /已注册|已存在|已被注册/.test(raw)) {
        setAuthHint({ variant: 'already_registered' })
      } else {
        setAuthHint({
          variant: 'generic',
          text: raw.includes('未设置密码')
            ? '该账号尚未设置密码，请联系管理员设置后再登录。'
            : raw || fallback,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <ConfigProvider
      theme={{
        token: { colorPrimary: '#0066FF', borderRadius: 16 },
        components: {
          Segmented: {
            trackBg: '#eef2ff',
            trackPadding: 4,
            itemColor: 'rgb(100 116 139)',
            itemHoverColor: '#0066FF',
            itemHoverBg: 'transparent',
            itemSelectedBg: '#ffffff',
            itemSelectedColor: '#0066FF',
          },
        },
      }}
    >
      <div
        className="min-h-screen relative overflow-hidden font-sans flex items-center justify-center selection:bg-white/30 p-8 animate-gradient-xy"
        style={{
          background: 'linear-gradient(-45deg, #001A88, #0044FF, #0066FF, #0033FF, #001166)',
          backgroundSize: '200% 200%',
        }}
      >
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[#0066FF]/40 rounded-full blur-[140px] pointer-events-none mix-blend-screen blob-anim-1" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[45vw] h-[45vw] bg-[#00DDFF]/15 rounded-full blur-[140px] pointer-events-none mix-blend-screen blob-anim-2" />
        <div className="absolute top-[10%] right-[10%] w-[40vw] h-[40vw] bg-[#4400FF]/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen blob-anim-3" />
        <div className="absolute bottom-[20%] left-[10%] w-[35vw] h-[35vw] bg-[#0088FF]/30 rounded-full blur-[120px] pointer-events-none mix-blend-screen blob-anim-4" />

        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_100%)] opacity-50 pointer-events-none" />

        <div className="w-full max-w-[1000px] bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[2.5rem] shadow-[0_30px_80px_rgba(0,40,100,0.25)] flex flex-col md:flex-row overflow-hidden relative z-20">
          <div className="md:w-[45%] lg:w-1/2 p-12 flex flex-col items-center justify-center relative min-h-[300px] md:min-h-[600px] overflow-hidden border-b md:border-b-0 border-white/10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] bg-white/20 rounded-full blur-[60px] pointer-events-none" />

            <div className="absolute top-[20%] right-[18%] z-20 animate-[float_7s_ease-in-out_infinite_reverse]">
              <div className="bg-white/10 backdrop-blur-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.15)] p-4 rounded-3xl flex items-center justify-center rotate-[15deg] group hover:scale-110 transition-transform">
                <Sparkles className="text-[#FFDD00] drop-shadow-md" size={44} strokeWidth={1.5} />
              </div>
            </div>
            <div className="absolute top-[34%] left-[16%] z-40 animate-[bounce_5s_infinite_ease-in-out]">
              <div className="bg-white/10 backdrop-blur-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.15)] p-4 rounded-3xl flex items-center justify-center rotate-[-20deg] group hover:scale-110 transition-transform">
                <GraduationCap className="text-[#00FFD1] drop-shadow-sm" size={44} strokeWidth={1.5} />
              </div>
            </div>
            <div className="absolute bottom-[18%] right-[22%] z-20 animate-[float_6s_ease-in-out_infinite]">
              <div className="bg-white/10 backdrop-blur-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.15)] p-4 rounded-3xl flex items-center justify-center rotate-[10deg] group hover:scale-110 transition-transform">
                <Rocket className="text-[#FF3366] drop-shadow-sm" size={44} strokeWidth={1.5} />
              </div>
            </div>

            <div className="relative z-30 text-center flex flex-col items-center gap-5 drop-shadow-lg">
              <img
                src={logoCampus}
                alt="BlueFocus 校招"
                className="w-[216px] md:w-[260px] h-auto drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)]"
              />
              <p className="text-[20px] md:text-[23px] text-white/95 font-medium tracking-[0.3em] ml-1 drop-shadow-sm">
                蓝色光标
              </p>
            </div>
          </div>

          <div className="md:w-[55%] lg:w-1/2 bg-white flex flex-col justify-center px-8 sm:px-14 lg:px-16 py-12 relative">
            <div className="mb-7">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <h2 className="m-0 text-[34px] sm:text-[40px] font-extrabold text-slate-800 tracking-tight leading-[1.1]">
                  {authMode === 'login' ? '登录' : '注册'}
                </h2>
                <Segmented
                  className="login-auth-segmented"
                  value={authMode}
                  onChange={(value) => {
                    setAuthMode(value as 'login' | 'register')
                    setAuthHint(null)
                    form.resetFields(['password'])
                  }}
                  options={[
                    { label: '登录', value: 'login' },
                    { label: '注册', value: 'register' },
                  ]}
                />
              </div>
              <p className="mt-3 mb-0 text-[13px] leading-[1.55] text-slate-500">
                {authMode === 'login'
                  ? '输入手机号和密码登录'
                  : '首次使用请用手机号和密码完成注册'}
              </p>
            </div>

            {authHint && (
              <div className="mb-5">
                {authHint.variant === 'not_registered' && (
                  <Alert
                    type="info"
                    showIcon
                    message="该手机号尚未注册"
                    description="若您是首次使用，请先完成注册后再登录。"
                    className="rounded-xl border-slate-200/80"
                    action={
                      <Button
                        type="link"
                        size="small"
                        className="!p-0 !h-auto font-semibold"
                        onClick={() => {
                          setAuthMode('register')
                          setAuthHint(null)
                        }}
                      >
                        去注册
                      </Button>
                    }
                  />
                )}
                {authHint.variant === 'already_registered' && (
                  <Alert
                    type="info"
                    showIcon
                    message="该手机号已注册"
                    description="请使用手机号和密码登录。"
                    className="rounded-xl border-slate-200/80"
                    action={
                      <Button
                        type="link"
                        size="small"
                        className="!p-0 !h-auto font-semibold"
                        onClick={() => {
                          setAuthMode('login')
                          setAuthHint(null)
                        }}
                      >
                        去登录
                      </Button>
                    }
                  />
                )}
                {authHint.variant === 'generic' && (
                  <Alert
                    type="warning"
                    showIcon
                    message="暂时无法完成操作"
                    description={authHint.text}
                    className="rounded-xl border-slate-200/80"
                  />
                )}
              </div>
            )}

            <Form
              form={form}
              onFinish={onFinish}
              onValuesChange={(changed) => {
                if ('phone' in changed || 'password' in changed) setAuthHint(null)
              }}
              layout="vertical"
              requiredMark={false}
              className="login-figma-form flex w-full flex-col gap-5"
            >
              <Form.Item
                name="phone"
                validateTrigger="onBlur"
                rules={[
                  { required: true, message: '请输入手机号' },
                  { pattern: PHONE_REGEX, message: '请输入11位有效手机号' },
                ]}
                className="!mb-0"
              >
                <Input
                  placeholder="手机号"
                  aria-label="手机号"
                  autoComplete="username"
                  inputMode="tel"
                  prefix={<Smartphone size={19} strokeWidth={2} className="text-slate-400" />}
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[
                  { required: true, whitespace: true, message: '请输入密码' },
                  { min: 8, max: 128, message: '密码须为8至128位' },
                ]}
                className="!mb-0"
              >
                <Input.Password
                  placeholder="密码"
                  aria-label="密码"
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  prefix={<Lock size={19} strokeWidth={2} className="text-slate-400" />}
                />
              </Form.Item>

              <Form.Item className="!mb-0">
                <div className="mb-4 flex items-center">
                  <Checkbox
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  >
                    <span className="text-xs text-slate-500">
                      我已阅读并同意
                      <button
                        type="button"
                        onClick={() => setAgreementOpen(true)}
                        className="ml-1 border-0 bg-transparent p-0 text-xs font-medium text-[#0066FF] cursor-pointer hover:text-[#0052CC]"
                      >
                        《用户协议》
                      </button>
                    </span>
                  </Checkbox>
                </div>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  disabled={!agreed}
                  className="!w-full !h-14 !rounded-2xl !bg-[#0066FF] hover:!bg-[#0052CC] !text-white !font-bold !text-[16px] !tracking-wide !border-0 !shadow-none hover:!shadow-[0_10px_25px_rgba(0,102,255,0.3)] active:!scale-[0.98]"
                >
                  {authMode === 'login' ? '登录' : '注册'}
                </Button>
              </Form.Item>
            </Form>
          </div>
        </div>
        <Modal
          title="用户协议"
          open={agreementOpen}
          onCancel={() => setAgreementOpen(false)}
          footer={[
            <Button key="ok" type="primary" onClick={() => setAgreementOpen(false)}>
              我已知晓
            </Button>,
          ]}
        >
          <p>
            1. 服务说明：本平台用于蓝色光标集团测评与相关流程管理。您应确保注册与使用行为合法合规，不得冒用他人身份，不得将账号提供给他人使用。
          </p>
          <p>
            2. 手机号使用：为完成登录、身份校验与安全风控，我们会收集并使用您提交的手机号，用于账号识别、异常登录识别及招聘流程通知。
          </p>
          <p>
            3. 信息收集范围：为实现测评与招聘目的，我们可能收集并处理账号信息、作答数据、设备与日志信息（如IP、浏览器信息、操作时间）等必要信息。
          </p>
          <p>
            4. 信息使用原则：我们仅在招聘相关的必要范围内使用您的个人信息，用于测评组织、结果评估、候选人管理、系统安全与服务优化，不作与招聘无关的非法用途。
          </p>
          <p>
            5. 信息保存、保护与披露：我们将在符合法律法规及业务必要期限内保存相关信息，并采取合理的技术与管理措施保障数据安全，防止信息泄露、篡改或丢失。未经您的授权或法律法规另有规定，我们不会向无关第三方扩散、公开传播或提供您的个人信息。
          </p>
          <p>
            6. 依法共享例外：在法律法规要求、监管机关依法要求，或为维护平台及相关方合法权益所必需的情形下，我们可能依法提供必要信息，并在法定范围内履行相应义务。
          </p>
          <p>
            7. 用户权利：您可依法申请查询、更正、删除个人信息或注销账号。因法律法规、审计或争议处理需要保留的信息，我们将在法定范围内继续保存。
          </p>
          <p>
            8. 使用规范与责任：请独立完成测评，禁止作弊、代答、攻击系统等行为。因您违规操作造成的后果由您自行承担，平台有权采取限制或终止服务等措施。
          </p>
          <p>
            9. 协议生效：勾选并继续登录/注册即表示您已阅读、理解并同意本协议及相关隐私政策条款。
          </p>
        </Modal>

        <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes gradient-xy {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-xy {
          animation: gradient-xy 20s ease infinite;
        }
        @keyframes blob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(5%, 5%) scale(1.05); }
        }
        @keyframes blob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-5%, -5%) scale(1.05); }
        }
        @keyframes blob3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-5%, 5%) scale(0.95); }
        }
        @keyframes blob4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(5%, -5%) scale(1.05); }
        }
        .blob-anim-1 { animation: blob1 20s ease-in-out infinite; }
        .blob-anim-2 { animation: blob2 22s ease-in-out infinite alternate; }
        .blob-anim-3 { animation: blob3 25s ease-in-out infinite; }
        .blob-anim-4 { animation: blob4 23s ease-in-out infinite alternate; }
      ` }} />
      </div>
    </ConfigProvider>
  )
}
