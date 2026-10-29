import { createRoot } from 'react-dom/client'
import './index.css'
import 'antd/dist/reset.css'
import App from './App.tsx'

// 未使用 StrictMode：避免开发环境下 useEffect 被双重执行导致接口被调用两次
createRoot(document.getElementById('root')!).render(<App />)
