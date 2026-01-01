import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { installTenantQueryGuard } from "@/lib/tenantQuery";

// Install tenant query guard in development mode
installTenantQueryGuard();

// Ensure PWA updates don't leave users on an older cached bundle (which can cause new routes to 404)
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
});

createRoot(document.getElementById("root")!).render(<App />);
