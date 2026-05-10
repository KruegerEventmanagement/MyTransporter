import { useEffect, useState } from "react";
import { User, X, ChevronRight, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const AUTH_CONFIRM_URL = `${typeof window !== "undefined" ? window.location.origin : ""}/`;

export function Navbar() {
  const [showModal, setShowModal] = useState<"login" | "register" | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "" });

  useEffect(() => {
    const apply = (user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) => {
      if (user) {
        setIsLoggedIn(true);
        const meta = (user.user_metadata ?? {}) as { first_name?: string };
        setUserName(meta.first_name || (user.email?.split("@")[0] ?? "Konto"));
      } else {
        setIsLoggedIn(false);
        setUserName("");
      }
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const closeModal = () => {
    setShowModal(null);
    setError(null);
    setInfo(null);
    setForm({ firstName: "", lastName: "", email: "", phone: "", password: "" });
  };

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    closeModal();
  };

  const handleRegister = async () => {
    setError(null);
    setInfo(null);
    if (form.password.length < 6) {
      setError("Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: AUTH_CONFIRM_URL,
        data: {
          first_name: form.firstName,
          last_name: form.lastName,
          phone: form.phone,
        },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.user && !data.session) {
      setInfo("Bitte bestätige deine E-Mail-Adresse. Wir haben dir einen Link geschickt.");
    } else {
      closeModal();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShowProfileMenu(false);
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-end gap-2 sm:gap-3">
          {!isLoggedIn ? (
            <>
              <button
                onClick={() => { setShowModal("login"); setError(null); setInfo(null); }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Login
              </button>
              <button
                onClick={() => { setShowModal("register"); setError(null); setInfo(null); }}
                className="text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground border border-border hover:bg-muted transition-colors whitespace-nowrap"
              >
                Registrieren
              </button>
            </>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-accent transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-accent" />
                </div>
                {userName}
              </button>
              {showProfileMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-lg p-2 animate-fade-in">
                  <p className="px-3 py-2 text-xs text-muted-foreground">Angemeldet als <span className="font-medium text-foreground">{userName}</span></p>
                  <hr className="border-border my-1" />
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/5 rounded-lg transition-colors"
                  >
                    Abmelden
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-sm p-6 animate-fade-in-up relative">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>

            <h3 className="text-xl font-bold text-foreground mb-1">
              {showModal === "login" ? "Willkommen zurück" : "Konto erstellen"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {showModal === "login" ? "Melde dich an, um fortzufahren" : "Erstelle dein MyTransporter-Konto"}
            </p>

            <div className="space-y-3">
              {showModal === "register" && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    placeholder="Vorname"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    placeholder="Nachname"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              )}
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="E-Mail"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {showModal === "register" && (
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Telefonnummer"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              )}
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Passwort"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}
              {info && <p className="text-xs text-foreground bg-secondary p-2 rounded-lg">{info}</p>}

              <button
                onClick={showModal === "login" ? handleLogin : handleRegister}
                disabled={loading || !form.email || !form.password || (showModal === "register" && (!form.firstName || !form.lastName))}
                className="w-full rounded-xl bg-accent py-2.5 text-accent-foreground font-medium text-sm transition-all hover:bg-accent/90 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Bitte warten…" : showModal === "login" ? "Einloggen" : "Registrieren"}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              {showModal === "login" ? (
                <>Noch kein Konto? <button onClick={() => { setShowModal("register"); setError(null); setInfo(null); }} className="font-medium text-accent hover:underline">Registrieren</button></>
              ) : (
                <>Bereits registriert? <button onClick={() => { setShowModal("login"); setError(null); setInfo(null); }} className="font-medium text-accent hover:underline">Einloggen</button></>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
