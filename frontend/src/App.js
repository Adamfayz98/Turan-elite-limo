import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import Home from "@/pages/Home";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import PayBooking from "@/pages/PayBooking";
import ManageBooking from "@/pages/ManageBooking";
import DriverPortal from "@/pages/DriverPortal";
import PostTrip from "@/pages/PostTrip";
import Announcement from "@/pages/Announcement";
import MobileMockup from "@/pages/MobileMockup";
import ResetPassword from "@/pages/ResetPassword";
import GoogleSiteTag from "@/components/GoogleSiteTag";

function App() {
  useEffect(() => {
    document.title = "TuranEliteLimo — Luxury Chauffeur Service | Bay Area & Northern California";
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="App dark bg-[#050505] text-white min-h-screen">
      <GoogleSiteTag />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pay/:bookingId" element={<PayBooking />} />
          <Route path="/thank-you" element={<PayBooking />} />
          <Route path="/manage/:token" element={<ManageBooking />} />
          <Route path="/driver/:token" element={<DriverPortal />} />
          <Route path="/post-trip/:token" element={<PostTrip />} />
          <Route path="/news/:slug" element={<Announcement />} />
          <Route path="/preview/mobile" element={<MobileMockup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
