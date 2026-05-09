import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import Home from "@/pages/Home";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import PayBooking from "@/pages/PayBooking";

function App() {
  useEffect(() => {
    document.title = "TuranEliteLimo — Luxury Chauffeur Service | Bay Area & Northern California";
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="App dark bg-[#050505] text-white min-h-screen">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pay/:bookingId" element={<PayBooking />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: "#111111",
            border: "1px solid #27272A",
            color: "#fff",
          },
        }}
      />
    </div>
  );
}

export default App;
