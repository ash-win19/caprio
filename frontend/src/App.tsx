import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthGuard } from "@/components/AuthGuard";
import AppLayout from "@/layouts/AppLayout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Today from "./pages/Today";
import Conversation from "./pages/Conversation";
import History from "./pages/History";
import HistoryDay from "./pages/HistoryDay";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthGuard>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/landing" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            {/* Setup and Settings are gone; their old links open Today. */}
            <Route path="/onboarding/*" element={<Navigate to="/today" replace />} />
            <Route path="/settings/*" element={<Navigate to="/today" replace />} />
            <Route path="/conversation" element={<Conversation />} />
            <Route path="/new" element={<Navigate to="/conversation" replace />} />
            <Route element={<AppLayout />}>
              <Route path="/today" element={<Today />} />
              <Route path="/capture" element={<Navigate to="/today" replace />} />
              <Route path="/review" element={<Navigate to="/today" replace />} />
              <Route path="/history" element={<History />} />
              <Route path="/history/:date" element={<HistoryDay />} />
              <Route path="/momentum" element={<Navigate to="/history" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthGuard>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
