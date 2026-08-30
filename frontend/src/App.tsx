import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthGuard } from "@/components/AuthGuard";
import AppLayout from "@/layouts/AppLayout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import OnboardingPrefs from "./pages/OnboardingPrefs";
import Today from "./pages/Today";
import New from "./pages/New";
import Capture from "./pages/Capture";
import Review from "./pages/Review";
import Momentum from "./pages/Momentum";
import SettingsPage from "./pages/Settings";
import SettingsCategories from "./pages/SettingsCategories";
import SettingsNotifications from "./pages/SettingsNotifications";
import SettingsVoice from "./pages/SettingsVoice";
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
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/onboarding/prefs" element={<OnboardingPrefs />} />
            <Route path="/new" element={<New />} />
            <Route element={<AppLayout />}>
              <Route path="/today" element={<Today />} />
              <Route path="/new" element={<New />} />
              <Route path="/capture" element={<Capture />} />
              <Route path="/review" element={<Review />} />
              <Route path="/momentum" element={<Momentum />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/categories" element={<SettingsCategories />} />
              <Route path="/settings/notifications" element={<SettingsNotifications />} />
              <Route path="/settings/voice" element={<SettingsVoice />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthGuard>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
