import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // 같은 Wi‑Fi의 휴대폰에서 http://<PC IP>:5173 로 접속 가능
  },
});

